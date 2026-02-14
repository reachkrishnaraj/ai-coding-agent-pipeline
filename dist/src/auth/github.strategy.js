"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_github2_1 = require("passport-github2");
const config_1 = require("@nestjs/config");
const rest_1 = require("@octokit/rest");
let GitHubStrategy = class GitHubStrategy extends (0, passport_1.PassportStrategy)(passport_github2_1.Strategy, 'github') {
    configService;
    constructor(configService) {
        super({
            clientID: configService.get('GITHUB_OAUTH_CLIENT_ID') || '',
            clientSecret: configService.get('GITHUB_OAUTH_CLIENT_SECRET') || '',
            callbackURL: configService.get('GITHUB_OAUTH_CALLBACK_URL') || 'http://localhost:3000/api/auth/github/callback',
            scope: ['read:user', 'read:org'],
        });
        this.configService = configService;
    }
    async validate(accessToken, _refreshToken, profile) {
        const octokit = new rest_1.Octokit({ auth: accessToken });
        try {
            const { data: orgs } = await octokit.rest.orgs.listForAuthenticatedUser();
            const isMemberOfMothership = orgs.some(org => org.login === 'mothership');
            if (!isMemberOfMothership) {
                throw new common_1.UnauthorizedException('You must be a member of the mothership organization');
            }
            return {
                id: profile.id,
                username: profile.username,
                displayName: profile.displayName,
                email: profile.emails?.[0]?.value || '',
                avatarUrl: profile.photos?.[0]?.value || '',
                accessToken,
            };
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            throw new common_1.UnauthorizedException('Failed to verify organization membership');
        }
    }
};
exports.GitHubStrategy = GitHubStrategy;
exports.GitHubStrategy = GitHubStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GitHubStrategy);
//# sourceMappingURL=github.strategy.js.map