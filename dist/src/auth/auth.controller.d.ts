import type { Request, Response } from 'express';
export declare class AuthController {
    githubLogin(): Promise<void>;
    githubCallback(req: Request, res: Response): Promise<void>;
    getMe(req: Request): Promise<{
        authenticated: boolean;
        user?: undefined;
    } | {
        authenticated: boolean;
        user: {
            id: string;
            username: string;
            displayName: string;
            email: string;
            avatarUrl: string;
        };
    }>;
    logout(req: Request, res: Response): Promise<void>;
}
