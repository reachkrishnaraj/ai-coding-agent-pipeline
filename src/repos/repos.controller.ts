import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ReposService } from './repos.service';
import { AddRepoDto } from './dto/add-repo.dto';
import { UpdateRepoSettingsDto } from './dto/update-repo-settings.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/repos')
@UseGuards(AuthGuard('session'))
export class ReposController {
  constructor(private readonly reposService: ReposService) {}

  /**
   * GET /api/repos - Get user's repos
   */
  @Get()
  async getUserRepos(
    @Request() req: any,
    @Query('includeStats') includeStats?: string,
  ) {
    const userId = req.user.username;
    const repos = await this.reposService.getUserRepos(
      userId,
      includeStats === 'true',
    );

    return {
      repos,
      total: repos.length,
    };
  }

  /**
   * GET /api/repos/available - Get available GitHub repos
   */
  @Get('available')
  async getAvailableRepos(@Request() req: any) {
    const userId = req.user.username;
    const repos = await this.reposService.getAvailableRepos(userId);

    return {
      repos,
      total: repos.length,
      cached: true,
      cacheExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  /**
   * POST /api/repos - Add a repo to dashboard
   */
  @Post()
  async addRepo(@Request() req: any, @Body() addRepoDto: AddRepoDto) {
    const userId = req.user.username;
    const repo = await this.reposService.addRepo(
      userId,
      addRepoDto.repoName,
      addRepoDto.defaultAgent,
    );

    return repo;
  }

  /**
   * DELETE /api/repos/:id - Remove a repo
   */
  @Delete(':id')
  @HttpCode(200)
  async removeRepo(@Request() req: any, @Param('id') repoId: string) {
    const userId = req.user.username;
    await this.reposService.removeRepo(userId, repoId);

    const repo = await this.reposService.getRepoById(repoId);
    const taskCount = (await this.reposService.getRepoStats(repo.repoName))
      .totalTasks;

    return {
      success: true,
      repoName: repo.repoName,
      tasksKept: taskCount,
      message: 'Repo removed from dashboard. Task history preserved.',
    };
  }

  /**
   * GET /api/repos/:id/stats - Get repo stats
   */
  @Get(':id/stats')
  async getRepoStats(@Param('id') repoId: string) {
    const repo = await this.reposService.getRepoById(repoId);
    const stats = await this.reposService.getRepoStats(repo.repoName);

    return {
      repoName: repo.repoName,
      period: '7d',
      ...stats,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /api/repos/:id/settings - Get repo settings
   */
  @Get(':id/settings')
  async getRepoSettings(@Request() req: any, @Param('id') repoId: string) {
    const repo = await this.reposService.getRepoById(repoId);

    return {
      id: repo._id.toString(),
      repoName: repo.repoName,
      defaultAgent: repo.defaultAgent,
      customSystemPrompt: repo.customSystemPrompt,
      useCustomPrompt: !!repo.customSystemPrompt,
    };
  }

  /**
   * PATCH /api/repos/:id/settings - Update repo settings
   */
  @Patch(':id/settings')
  async updateRepoSettings(
    @Request() req: any,
    @Param('id') repoId: string,
    @Body() updateDto: UpdateRepoSettingsDto,
  ) {
    const userId = req.user.username;
    const repo = await this.reposService.updateRepoSettings(
      userId,
      repoId,
      updateDto,
    );

    return {
      id: repo._id.toString(),
      repoName: repo.repoName,
      defaultAgent: repo.defaultAgent,
      useCustomPrompt: !!repo.customSystemPrompt,
      updatedAt: repo.updatedAt,
    };
  }
}
