import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Octokit } from '@octokit/rest';
import { LlmAnalysis } from '../common/interfaces/llm-analysis.interface';
import { TaskInput } from '../common/interfaces/task.interface';
import { DEFAULT_SYSTEM_PROMPT } from './prompts/default-system-prompt';

interface PromptCacheEntry {
  content: string;
  expiresAt: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly openai: OpenAI;
  private readonly octokit: Octokit;
  private readonly promptCache = new Map<string, PromptCacheEntry>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    this.openai = new OpenAI({
      apiKey,
    });

    const githubToken = this.configService.get<string>('GITHUB_TOKEN');
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN is not configured');
    }

    this.octokit = new Octokit({
      auth: githubToken,
    });
  }

  /**
   * Analyze a task using OpenAI GPT-4o
   */
  async analyzeTask(task: TaskInput): Promise<LlmAnalysis> {
    try {
      // Get system prompt (per-repo or default)
      const systemPrompt = await this.getSystemPrompt(task.repo);

      // Build user message
      const userMessage = this.buildUserMessage(task);

      this.logger.log(`Analyzing task for repo: ${task.repo}`);

      // Call OpenAI
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('OpenAI returned empty response, using fallback');
        return this.getFallbackAnalysis(task);
      }

      // Parse response
      return this.parseResponse(content, task);
    } catch (error) {
      this.logger.error(`LLM analysis failed: ${error.message}`, error.stack);
      return this.getFallbackAnalysis(task);
    }
  }

  /**
   * Get system prompt for a repo (cached, per-repo or default)
   */
  private async getSystemPrompt(repo: string): Promise<string> {
    const cacheKey = `prompt:${repo}`;
    const cached = this.promptCache.get(cacheKey);

    // Check cache
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Using cached prompt for ${repo}`);
      return cached.content;
    }

    // Try to fetch per-repo prompt
    try {
      const [owner, repoName] = repo.split('/');
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo: repoName,
        path: '.ai/prompts/system.md',
      });

      if ('content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        this.logger.log(`Loaded custom prompt for ${repo}`);

        // Cache it
        this.promptCache.set(cacheKey, {
          content,
          expiresAt: Date.now() + this.CACHE_TTL,
        });

        return content;
      }
    } catch (error) {
      if (error.status === 404) {
        this.logger.debug(`No custom prompt found for ${repo}, using default`);
      } else {
        this.logger.warn(
          `Failed to fetch custom prompt for ${repo}: ${error.message}`,
        );
      }
    }

    // Cache default prompt
    this.promptCache.set(cacheKey, {
      content: DEFAULT_SYSTEM_PROMPT,
      expiresAt: Date.now() + this.CACHE_TTL,
    });

    return DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * Build user message from task input
   */
  private buildUserMessage(task: TaskInput): string {
    const parts: string[] = [];

    parts.push(`Task Description: ${task.description}`);

    if (task.task_type_hint) {
      parts.push(`User's Type Hint: ${task.task_type_hint}`);
    }

    if (task.repo) {
      parts.push(`Target Repository: ${task.repo}`);
    }

    if (task.files_hint) {
      parts.push(`Files/Modules to Focus On: ${task.files_hint}`);
    }

    if (task.acceptance_criteria) {
      parts.push(`User's Acceptance Criteria: ${task.acceptance_criteria}`);
    }

    if (task.priority) {
      parts.push(`Priority: ${task.priority}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Parse LLM response, handling markdown code fences
   */
  private parseResponse(content: string, task: TaskInput): LlmAnalysis {
    try {
      // Strip markdown code fences if present
      let jsonContent = content.trim();

      // Remove ```json ... ``` or ``` ... ```
      const codeBlockMatch = jsonContent.match(
        /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,
      );
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1].trim();
      }

      const parsed = JSON.parse(jsonContent);

      // Validate required fields
      if (!parsed.task_type || !parsed.recommended_agent || !parsed.summary) {
        this.logger.warn(
          'LLM response missing required fields, using fallback',
        );
        return this.getFallbackAnalysis(task);
      }

      return {
        clear_enough: parsed.clear_enough ?? true,
        questions: parsed.questions || [],
        task_type: parsed.task_type,
        recommended_agent: parsed.recommended_agent,
        summary: parsed.summary,
        suggested_acceptance_criteria:
          parsed.suggested_acceptance_criteria || [],
        likely_files: parsed.likely_files || [],
        repo: parsed.repo || task.repo,
      };
    } catch (error) {
      this.logger.error(`Failed to parse LLM response: ${error.message}`);
      this.logger.debug(`Raw content: ${content}`);
      return this.getFallbackAnalysis(task);
    }
  }

  /**
   * Fallback analysis when LLM fails
   */
  private getFallbackAnalysis(task: TaskInput): LlmAnalysis {
    return {
      clear_enough: false,
      questions: [
        'Could you provide more details about what needs to be changed?',
        'What is the expected behavior after this task is complete?',
        'Which files or modules should be modified?',
      ],
      task_type: (task.task_type_hint as any) || 'bug-fix',
      recommended_agent: 'claude-code',
      summary:
        task.description.slice(0, 100) +
        (task.description.length > 100 ? '...' : ''),
      suggested_acceptance_criteria: [],
      likely_files: task.files_hint
        ? task.files_hint.split(',').map((f) => f.trim())
        : [],
      repo: task.repo,
    };
  }
}
