import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { AuthService, SessionUser } from './auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const clientID = configService.get<string>('GITHUB_OAUTH_CLIENT_ID');
    const clientSecret = configService.get<string>('GITHUB_OAUTH_CLIENT_SECRET');

    // Use placeholder values if not configured - strategy won't be usable but app will start
    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL:
        configService.get<string>('GITHUB_OAUTH_CALLBACK_URL') ||
        'http://localhost:3000/api/auth/github/callback',
      scope: ['read:user', 'read:org', 'repo'],
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
  ): Promise<SessionUser> {
    const octokit = new Octokit({ auth: accessToken });

    // Check if org restriction is configured
    const requiredOrg = this.configService.get<string>('GITHUB_REQUIRED_ORG');

    if (requiredOrg) {
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

    // Check if user has access to any of the allowed repos
    const hasRepoAccess = await this.checkRepoAccess(octokit, profile.username);

    // Validate and persist user
    const githubProfile = {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      email: profile.emails?.[0]?.value || '',
      avatarUrl: profile.photos?.[0]?.value || '',
      accessToken,
      hasRepoAccess,
    };

    return this.authService.validateUser(githubProfile);
  }

  /**
   * Check if user has access to any of the allowed repos/orgs
   */
  private async checkRepoAccess(octokit: Octokit, username: string): Promise<boolean> {
    const allowedReposConfig = this.configService.get<string>('ALLOWED_REPOS') || '';
    const allowedRepos = allowedReposConfig
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    if (allowedRepos.length === 0) {
      return false;
    }

    for (const allowed of allowedRepos) {
      try {
        // Check if it's an org (ends with /) or specific repo
        if (allowed.endsWith('/')) {
          // It's an org - check membership
          const orgName = allowed.slice(0, -1);
          try {
            await octokit.rest.orgs.checkMembershipForUser({
              org: orgName,
              username,
            });
            this.logger.log(`User ${username} is member of org ${orgName}`);
            return true;
          } catch {
            // Not a member, continue checking
          }
        } else if (allowed.includes('/')) {
          // It's a specific repo - check access
          const [owner, repo] = allowed.split('/');
          try {
            await octokit.rest.repos.getCollaboratorPermissionLevel({
              owner,
              repo,
              username,
            });
            this.logger.log(`User ${username} has access to repo ${allowed}`);
            return true;
          } catch {
            // No access, continue checking
          }
        }
      } catch (error) {
        this.logger.debug(`Error checking access for ${allowed}: ${error.message}`);
      }
    }

    this.logger.log(`User ${username} has no access to any allowed repos`);
    return false;
  }
}
