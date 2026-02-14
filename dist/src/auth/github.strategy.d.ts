import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
export interface GitHubUser {
    id: string;
    username: string;
    displayName: string;
    email: string;
    avatarUrl: string;
    accessToken: string;
}
declare const GitHubStrategy_base: new (...args: [options: import("passport-github2").StrategyOptionsWithRequest] | [options: import("passport-github2").StrategyOptions]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class GitHubStrategy extends GitHubStrategy_base {
    private readonly configService;
    constructor(configService: ConfigService);
    validate(accessToken: string, _refreshToken: string, profile: any): Promise<GitHubUser>;
}
export {};
