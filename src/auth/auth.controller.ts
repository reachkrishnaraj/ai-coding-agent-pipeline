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
    const user = req.user as GitHubUser;
    this.logger.log(`=== CALLBACK START ===`);
    this.logger.log(`User: ${user?.username}`);
    this.logger.log(`Session ID: ${req.sessionID}`);
    this.logger.log(`Session passport before: ${JSON.stringify((req.session as any).passport)}`);
    this.logger.log(`isAuthenticated: ${req.isAuthenticated()}`);
    this.logger.log(`Cookie header: ${req.headers.cookie}`);

    // Manually call login to ensure user is serialized to session
    req.login(user, (err) => {
      if (err) {
        this.logger.error(`Login error: ${err.message}`);
        return res.status(500).json({ message: 'Login failed' });
      }

      this.logger.log(`Session passport after login: ${JSON.stringify((req.session as any).passport)}`);

      req.session.save((saveErr) => {
        if (saveErr) {
          this.logger.error(`Session save error: ${saveErr.message}`);
        }
        this.logger.log(`Session saved successfully`);
        this.logger.log(`=== CALLBACK END - Redirecting ===`);
        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
        res.redirect(frontendUrl);
      });
    });
  }

  @Get('me')
  async getMe(@Req() req: Request) {
    this.logger.log(`/me called - Session ID: ${req.sessionID}`);
    this.logger.log(`/me called - Cookies: ${JSON.stringify(req.headers.cookie)}`);
    this.logger.log(`/me called - Session passport: ${JSON.stringify((req.session as any)?.passport)}`);
    this.logger.log(`/me called - isAuthenticated: ${req.isAuthenticated()}`);

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

  // Debug endpoints to test session
  @Get('debug/set')
  async debugSet(@Req() req: Request) {
    (req.session as any).testValue = 'session-works-' + Date.now();
    this.logger.log(`Debug set - Session ID: ${req.sessionID}, value: ${(req.session as any).testValue}`);
    return { sessionId: req.sessionID, testValue: (req.session as any).testValue };
  }

  @Get('debug/get')
  async debugGet(@Req() req: Request) {
    this.logger.log(`Debug get - Session ID: ${req.sessionID}, value: ${(req.session as any).testValue}`);
    this.logger.log(`Debug get - Cookie header: ${req.headers.cookie}`);
    return {
      sessionId: req.sessionID,
      testValue: (req.session as any).testValue,
      cookie: req.headers.cookie
    };
  }
}
