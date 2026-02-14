import { GitHubUser } from './github.strategy';
export declare class AuthService {
    validateUser(user: GitHubUser): Promise<GitHubUser>;
    getUser(userId: string): Promise<GitHubUser | null>;
}
