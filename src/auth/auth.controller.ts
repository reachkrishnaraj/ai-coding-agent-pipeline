import { Controller, Get, Post, Req, Res, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { GitHubUser } from './github.strategy';

@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly configService: ConfigService) {}

  @Get('github')
  @UseGuards(PassportAuthGuard('github'))
  async githubLogin() {
    // Initiates the GitHub OAuth flow
  }

  @Get('github/callback')
  @UseGuards(PassportAuthGuard('github'))
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    // Log successful authentication
    const user = req.user as GitHubUser;
    this.logger.log(`User authenticated: ${user?.username || 'unknown'}`);
    this.logger.log(`Session ID: ${req.sessionID}`);
    this.logger.log(`Session: ${JSON.stringify(req.session)}`);

    // Successful authentication, redirect to frontend dashboard
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    res.redirect(frontendUrl);
  }

  @Get('me')
  async getMe(@Req() req: Request) {
    this.logger.log(`/me called - Session ID: ${req.sessionID}`);
    this.logger.log(`/me called - isAuthenticated: ${req.isAuthenticated()}`);
    this.logger.log(`/me called - user: ${JSON.stringify(req.user)}`);

    if (!req.isAuthenticated()) {
      return { authenticated: false };
    }

    const user = req.user as GitHubUser;
    return {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: 'Logout failed' });
      }
      res.json({ message: 'Logged out successfully' });
    });
  }
}
