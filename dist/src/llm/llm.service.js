"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var LlmService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
const rest_1 = require("@octokit/rest");
const default_system_prompt_1 = require("./prompts/default-system-prompt");
let LlmService = LlmService_1 = class LlmService {
    configService;
    logger = new common_1.Logger(LlmService_1.name);
    openai;
    octokit;
    promptCache = new Map();
    CACHE_TTL = 60 * 60 * 1000;
    constructor(configService) {
        this.configService = configService;
        const apiKey = this.configService.get('OPENAI_API_KEY');
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not configured');
        }
        this.openai = new openai_1.default({
            apiKey,
        });
        const githubToken = this.configService.get('GITHUB_TOKEN');
        if (!githubToken) {
            throw new Error('GITHUB_TOKEN is not configured');
        }
        this.octokit = new rest_1.Octokit({
            auth: githubToken,
        });
    }
    async analyzeTask(task) {
        try {
            const systemPrompt = await this.getSystemPrompt(task.repo);
            const userMessage = this.buildUserMessage(task);
            this.logger.log(`Analyzing task for repo: ${task.repo}`);
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
            return this.parseResponse(content, task);
        }
        catch (error) {
            this.logger.error(`LLM analysis failed: ${error.message}`, error.stack);
            return this.getFallbackAnalysis(task);
        }
    }
    async getSystemPrompt(repo) {
        const cacheKey = `prompt:${repo}`;
        const cached = this.promptCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            this.logger.debug(`Using cached prompt for ${repo}`);
            return cached.content;
        }
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
                this.promptCache.set(cacheKey, {
                    content,
                    expiresAt: Date.now() + this.CACHE_TTL,
                });
                return content;
            }
        }
        catch (error) {
            if (error.status === 404) {
                this.logger.debug(`No custom prompt found for ${repo}, using default`);
            }
            else {
                this.logger.warn(`Failed to fetch custom prompt for ${repo}: ${error.message}`);
            }
        }
        this.promptCache.set(cacheKey, {
            content: default_system_prompt_1.DEFAULT_SYSTEM_PROMPT,
            expiresAt: Date.now() + this.CACHE_TTL,
        });
        return default_system_prompt_1.DEFAULT_SYSTEM_PROMPT;
    }
    buildUserMessage(task) {
        const parts = [];
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
    parseResponse(content, task) {
        try {
            let jsonContent = content.trim();
            const codeBlockMatch = jsonContent.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
            if (codeBlockMatch) {
                jsonContent = codeBlockMatch[1].trim();
            }
            const parsed = JSON.parse(jsonContent);
            if (!parsed.task_type || !parsed.recommended_agent || !parsed.summary) {
                this.logger.warn('LLM response missing required fields, using fallback');
                return this.getFallbackAnalysis(task);
            }
            return {
                clear_enough: parsed.clear_enough ?? true,
                questions: parsed.questions || [],
                task_type: parsed.task_type,
                recommended_agent: parsed.recommended_agent,
                summary: parsed.summary,
                suggested_acceptance_criteria: parsed.suggested_acceptance_criteria || [],
                likely_files: parsed.likely_files || [],
                repo: parsed.repo || task.repo,
            };
        }
        catch (error) {
            this.logger.error(`Failed to parse LLM response: ${error.message}`);
            this.logger.debug(`Raw content: ${content}`);
            return this.getFallbackAnalysis(task);
        }
    }
    getFallbackAnalysis(task) {
        return {
            clear_enough: false,
            questions: [
                'Could you provide more details about what needs to be changed?',
                'What is the expected behavior after this task is complete?',
                'Which files or modules should be modified?',
            ],
            task_type: task.task_type_hint || 'bug-fix',
            recommended_agent: 'claude-code',
            summary: task.description.slice(0, 100) + (task.description.length > 100 ? '...' : ''),
            suggested_acceptance_criteria: [],
            likely_files: task.files_hint ? task.files_hint.split(',').map(f => f.trim()) : [],
            repo: task.repo,
        };
    }
};
exports.LlmService = LlmService;
exports.LlmService = LlmService = LlmService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LlmService);
//# sourceMappingURL=llm.service.js.map