import { Injectable } from '@nestjs/common';
import { GitHubUser } from './github.strategy';

@Injectable()
export class AuthService {
  async validateUser(user: GitHubUser): Promise<GitHubUser> {
    // Additional user validation logic can go here
    return user;
  }

  async getUser(userId: string): Promise<GitHubUser | null> {
    // In a real implementation, this would fetch from database
    // For now, we rely on session storage
    return null;
  }
}
