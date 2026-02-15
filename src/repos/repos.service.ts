import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { UserRepo, UserRepoDocument } from '../common/schemas/user-repo.schema';
import { Task, TaskDocument } from '../common/schemas/task.schema';

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  url: string;
  description: string;
  isPrivate: boolean;
  hasAccess: boolean;
  isAdded?: boolean;
}

export interface RepoStats {
  totalTasks: number;
  statusBreakdown: {
    received: number;
    analyzing: number;
    needsClarification: number;
    dispatched: number;
    coding: number;
    prOpen: number;
    merged: number;
    failed: number;
  };
  successRate: number;
  health: 'green' | 'yellow' | 'red' | 'gray';
  lastTaskAt?: Date;
}

@Injectable()
export class ReposService {
  private readonly logger = new Logger(ReposService.name);
  private readonly octokit: Octokit;

  constructor(
    @InjectModel(UserRepo.name) private userRepoModel: Model<UserRepoDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    private readonly configService: ConfigService,
  ) {
    const githubToken = this.configService.get<string>('GITHUB_TOKEN');
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN is not configured');
    }
    this.octokit = new Octokit({ auth: githubToken });
  }

  /**
   * Get user's added repos with optional stats
   */
  async getUserRepos(
    userId: string,
    includeStats = false,
  ): Promise<Array<UserRepoDocument & { stats?: RepoStats }>> {
    const repos = await this.userRepoModel
      .find({ userId, isActive: true })
      .sort({ addedAt: -1 })
      .exec();

    if (!includeStats) {
      return repos;
    }

    // Fetch stats for each repo
    const reposWithStats = await Promise.all(
      repos.map(async (repo) => {
        const stats = await this.getRepoStats(repo.repoName);
        return { ...repo.toJSON(), stats } as any;
      }),
    );

    return reposWithStats as any;
  }

  /**
   * Get available GitHub repos for the user
   */
  async getAvailableRepos(userId: string): Promise<GithubRepo[]> {
    try {
      // Get allowed repo prefixes
      const allowedReposConfig =
        this.configService.get<string>('ALLOWED_REPOS') || 'mothership/';
      const allowedPrefixes = allowedReposConfig
        .split(',')
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      // Fetch user's accessible repos from GitHub
      const response = await this.octokit.repos.listForAuthenticatedUser({
        visibility: 'all',
        per_page: 100,
        sort: 'updated',
      });

      // Filter for allowed repos with push access
      const filteredRepos = response.data
        .filter((r) => {
          const matchesPrefix = allowedPrefixes.some((prefix) =>
            r.full_name.startsWith(prefix),
          );
          return matchesPrefix && !r.archived && r.permissions?.push;
        })
        .map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          url: r.html_url,
          description: r.description || '',
          isPrivate: r.private,
          hasAccess: true,
        }));

      // Check which repos are already added
      const userRepos = await this.userRepoModel
        .find({ userId, isActive: true })
        .exec();
      const addedRepoNames = new Set(userRepos.map((r) => r.repoName));

      return filteredRepos.map((repo) => ({
        ...repo,
        isAdded: addedRepoNames.has(repo.fullName),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to fetch GitHub repos: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to fetch repositories from GitHub');
    }
  }

  /**
   * Add a repo to user's dashboard
   */
  async addRepo(
    userId: string,
    repoName: string,
    defaultAgent?: string,
  ): Promise<UserRepoDocument> {
    // Validate repo name format
    if (!repoName.includes('/')) {
      throw new BadRequestException('Invalid repo name format. Use owner/repo');
    }

    // Validate against allowed prefixes
    const allowedReposConfig =
      this.configService.get<string>('ALLOWED_REPOS') || 'mothership/';
    const allowedPrefixes = allowedReposConfig
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const isAllowed = allowedPrefixes.some((prefix) =>
      repoName.startsWith(prefix),
    );

    if (!isAllowed) {
      throw new ForbiddenException(
        `Repository ${repoName} is not allowed. Allowed prefixes: ${allowedPrefixes.join(', ')}`,
      );
    }

    // Check if already added
    const existing = await this.userRepoModel
      .findOne({ userId, repoName })
      .exec();

    if (existing) {
      if (existing.isActive) {
        // Already active, return it (idempotent)
        return existing;
      }
      // Reactivate soft-deleted repo
      existing.isActive = true;
      existing.addedAt = new Date();
      existing.removedAt = undefined;
      await existing.save();
      return existing;
    }

    // Verify user has access via GitHub API
    try {
      const [owner, repo] = repoName.split('/');
      const repoData = await this.octokit.repos.get({ owner, repo });

      if (!repoData.data.permissions?.push) {
        throw new ForbiddenException(
          `You don't have push access to ${repoName}`,
        );
      }

      // Create new user-repo association
      const userRepo = new this.userRepoModel({
        userId,
        repoName,
        repoFullName: repoData.data.full_name,
        defaultAgent: defaultAgent || 'claude-code',
        isActive: true,
        addedAt: new Date(),
        repoDescription: repoData.data.description,
        repoUrl: repoData.data.html_url,
        isPrivate: repoData.data.private,
      });

      await userRepo.save();
      this.logger.log(`User ${userId} added repo ${repoName}`);
      return userRepo;
    } catch (error) {
      if (error.status === 404) {
        throw new NotFoundException(`Repository ${repoName} not found`);
      }
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Failed to add repo: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to add repository');
    }
  }

  /**
   * Remove a repo from user's dashboard (soft delete)
   */
  async removeRepo(userId: string, repoId: string): Promise<void> {
    const repo = await this.userRepoModel.findById(repoId).exec();

    if (!repo) {
      throw new NotFoundException('Repository not found');
    }

    if (repo.userId !== userId) {
      throw new ForbiddenException('You can only remove your own repositories');
    }

    // Soft delete
    repo.isActive = false;
    repo.removedAt = new Date();
    await repo.save();

    this.logger.log(`User ${userId} removed repo ${repo.repoName}`);
  }

  /**
   * Get stats for a specific repo
   */
  async getRepoStats(repoName: string): Promise<RepoStats> {
    const tasks = await this.taskModel.find({ repo: repoName }).exec();

    const statusBreakdown = {
      received: 0,
      analyzing: 0,
      needsClarification: 0,
      dispatched: 0,
      coding: 0,
      prOpen: 0,
      merged: 0,
      failed: 0,
    };

    let lastTaskAt: Date | undefined;

    tasks.forEach((task) => {
      const status = task.status.replace(/-/g, '_');
      if (status in statusBreakdown) {
        statusBreakdown[status as keyof typeof statusBreakdown]++;
      }
      const taskCreatedAt = (task as any).createdAt;
      if (taskCreatedAt && (!lastTaskAt || taskCreatedAt > lastTaskAt)) {
        lastTaskAt = taskCreatedAt;
      }
    });

    const totalTasks = tasks.length;
    const merged = statusBreakdown.merged;
    const failed = statusBreakdown.failed;
    const completed = merged + failed;
    const successRate = completed > 0 ? (merged / completed) * 100 : 0;

    // Calculate health
    let health: 'green' | 'yellow' | 'red' | 'gray' = 'gray';
    if (completed === 0) {
      health = 'gray';
    } else if (successRate >= 80) {
      health = 'green';
    } else if (successRate >= 60) {
      health = 'yellow';
    } else {
      health = 'red';
    }

    return {
      totalTasks,
      statusBreakdown,
      successRate: Math.round(successRate * 100) / 100,
      health,
      lastTaskAt,
    };
  }

  /**
   * Update repo settings
   */
  async updateRepoSettings(
    userId: string,
    repoId: string,
    updates: {
      defaultAgent?: string;
      customSystemPrompt?: string;
    },
  ): Promise<UserRepoDocument> {
    const repo = await this.userRepoModel.findById(repoId).exec();

    if (!repo) {
      throw new NotFoundException('Repository not found');
    }

    if (repo.userId !== userId) {
      throw new ForbiddenException(
        'You can only update your own repository settings',
      );
    }

    if (updates.defaultAgent) {
      repo.defaultAgent = updates.defaultAgent;
    }

    if (updates.customSystemPrompt !== undefined) {
      repo.customSystemPrompt = updates.customSystemPrompt;
    }

    await repo.save();
    this.logger.log(`User ${userId} updated settings for repo ${repo.repoName}`);
    return repo;
  }

  /**
   * Validate user has access to a repo
   */
  async validateUserRepoAccess(
    userId: string,
    repoName: string,
  ): Promise<boolean> {
    const userRepo = await this.userRepoModel
      .findOne({ userId, repoName, isActive: true })
      .exec();

    return !!userRepo;
  }

  /**
   * Get repo by ID
   */
  async getRepoById(repoId: string): Promise<UserRepoDocument> {
    const repo = await this.userRepoModel.findById(repoId).exec();
    if (!repo) {
      throw new NotFoundException('Repository not found');
    }
    return repo;
  }
}
