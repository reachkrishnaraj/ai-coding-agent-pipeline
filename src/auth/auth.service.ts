import { Injectable, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UserDocument } from '../common/schemas/user.schema';

export interface GitHubProfile {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  accessToken: string;
}

export interface SessionUser {
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: string;
  status: string;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Validate and persist user on OAuth login
   */
  async validateUser(profile: GitHubProfile): Promise<SessionUser> {
    // Find or create user in database
    const user = await this.usersService.findOrCreate({
      githubId: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    });

    // Check user status
    if (user.status === 'inactive') {
      throw new ForbiddenException(
        'Your account has been deactivated. Contact an admin.',
      );
    }

    // Return session user object
    return this.toSessionUser(user, profile.accessToken);
  }

  /**
   * Get user by MongoDB ID (for session deserialization)
   */
  async getUserById(id: string): Promise<SessionUser | null> {
    const user = await this.usersService.findById(id);
    if (!user) return null;
    return this.toSessionUser(user, '');
  }

  /**
   * Get user by GitHub ID
   */
  async getUserByGithubId(githubId: string): Promise<SessionUser | null> {
    const user = await this.usersService.findByGithubId(githubId);
    if (!user) return null;
    return this.toSessionUser(user, '');
  }

  private toSessionUser(user: UserDocument, accessToken: string): SessionUser {
    return {
      id: user._id.toString(),
      githubId: user.githubId,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      accessToken,
    };
  }
}
