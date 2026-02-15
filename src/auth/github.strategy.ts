import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';

export interface GitHubUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  accessToken: string;
}

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(private readonly configService: ConfigService) {
    const clientID = configService.get<string>('GITHUB_OAUTH_CLIENT_ID');
    const clientSecret = configService.get<string>('GITHUB_OAUTH_CLIENT_SECRET');

    // Use placeholder values if not configured - strategy won't be usable but app will start
    // Callback URL should go through frontend proxy in dev so session cookie works
    const frontendUrl = configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL:
        configService.get<string>('GITHUB_OAUTH_CALLBACK_URL') ||
        `${frontendUrl}/api/auth/github/callback`,
      scope: ['read:user', 'read:org'],
    });

    if (!clientID || !clientSecret) {
      this.logger.warn(
        'GitHub OAuth not configured. Login will not work until GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET are set.',
      );
    }
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: any,
  ): Promise<GitHubUser> {
    // Check if org restriction is configured
    const requiredOrg = this.configService.get<string>('GITHUB_REQUIRED_ORG');

    if (requiredOrg) {
      // Verify user belongs to the required organization
      const octokit = new Octokit({ auth: accessToken });

      try {
        const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser();
        const isMemberOfOrg = orgs.some(
          (org) => org.login === requiredOrg,
        );

        if (!isMemberOfOrg) {
          throw new UnauthorizedException(
            `You must be a member of the ${requiredOrg} organization`,
          );
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException(
          'Failed to verify organization membership',
        );
      }
    }

    // No org restriction or passed check - allow login
    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      email: profile.emails?.[0]?.value || '',
      avatarUrl: profile.photos?.[0]?.value || '',
      accessToken,
    };
  }
}
