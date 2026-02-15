import { Controller, Get, Post, Req, Res, UseGuards, Logger } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { SessionUser } from './auth.service';

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
    const user = req.user as SessionUser;
    this.logger.log(`=== CALLBACK START ===`);
    this.logger.log(`User: ${user?.username} (${user?.role}, ${user?.status})`);

    // Manually call login to ensure user is serialized to session
    req.login(user, (err) => {
      if (err) {
        this.logger.error(`Login error: ${err.message}`);
        return res.status(500).json({ message: 'Login failed' });
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          this.logger.error(`Session save error: ${saveErr.message}`);
        }

        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

        // Redirect pending users to a pending page
        if (user.status === 'pending') {
          this.logger.log(`User ${user.username} is pending approval`);
          res.redirect(`${frontendUrl}/pending`);
        } else {
          this.logger.log(`=== CALLBACK END - Redirecting ===`);
          res.redirect(frontendUrl);
        }
      });
    });
  }

  @Get('me')
  async getMe(@Req() req: Request) {
    if (!req.isAuthenticated()) {
      return { authenticated: false };
    }

    const user = req.user as SessionUser;
    return {
      authenticated: true,
      user: {
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
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
