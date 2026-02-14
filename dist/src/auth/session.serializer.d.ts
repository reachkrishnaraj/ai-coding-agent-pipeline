import { PassportSerializer } from '@nestjs/passport';
import { GitHubUser } from './github.strategy';
export declare class SessionSerializer extends PassportSerializer {
    serializeUser(user: GitHubUser, done: (err: Error | null, user: any) => void): void;
    deserializeUser(payload: any, done: (err: Error | null, user: any) => void): void;
}
