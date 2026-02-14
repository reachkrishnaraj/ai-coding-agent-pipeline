import { Injectable, UnauthorizedException } from '@nestjs/common';
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
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.get<string>('GITHUB_OAUTH_CLIENT_ID'),
      clientSecret: configService.get<string>('GITHUB_OAUTH_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GITHUB_OAUTH_CALLBACK_URL') || 'http://localhost:3000/api/auth/github/callback',
      scope: ['read:user', 'read:org'],
    });
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: any,
  ): Promise<GitHubUser> {
    // Verify user belongs to the mothership organization
    const octokit = new Octokit({ auth: accessToken });

    try {
      const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser();
      const isMemberOfMothership = orgs.some(org => org.login === 'mothership');

      if (!isMemberOfMothership) {
        throw new UnauthorizedException(
          'You must be a member of the mothership organization',
        );
      }

      return {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value || '',
        avatarUrl: profile.photos?.[0]?.value || '',
        accessToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to verify organization membership');
    }
  }
}
