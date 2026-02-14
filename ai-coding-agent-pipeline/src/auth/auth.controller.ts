import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import type { GitHubUser } from './github.strategy';

@Controller('api/auth')
export class AuthController {
  @Get('github')
  @UseGuards(PassportAuthGuard('github'))
  async githubLogin() {
    // Initiates the GitHub OAuth flow
  }

  @Get('github/callback')
  @UseGuards(PassportAuthGuard('github'))
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    // Successful authentication, redirect to dashboard
    res.redirect('/');
  }

  @Get('me')
  async getMe(@Req() req: Request) {
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
