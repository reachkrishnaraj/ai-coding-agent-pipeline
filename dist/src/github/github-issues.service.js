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
var GitHubIssuesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubIssuesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rest_1 = require("@octokit/rest");
const issue_body_template_1 = require("./templates/issue-body.template");
let GitHubIssuesService = GitHubIssuesService_1 = class GitHubIssuesService {
    configService;
    logger = new common_1.Logger(GitHubIssuesService_1.name);
    octokit;
    constructor(configService) {
        this.configService = configService;
        const githubToken = this.configService.get('GITHUB_TOKEN');
        if (!githubToken) {
            throw new Error('GITHUB_TOKEN is not configured');
        }
        this.octokit = new rest_1.Octokit({
            auth: githubToken,
        });
    }
    async createIssue(input) {
        const { taskId, source, description, analysis, clarificationQA } = input;
        if (!analysis.repo.startsWith('mothership/')) {
            throw new common_1.BadRequestException(`Invalid repository: ${analysis.repo}. Only mothership/* repositories are allowed.`);
        }
        const [owner, repo] = analysis.repo.split('/');
        const labels = this.buildLabels(analysis);
        const body = (0, issue_body_template_1.generateIssueBody)({
            taskId,
            source,
            description,
            analysis,
            clarificationQA,
        });
        try {
            this.logger.log(`Creating issue in ${analysis.repo} with labels: ${labels.join(', ')}`);
            const response = await this.octokit.rest.issues.create({
                owner,
                repo,
                title: analysis.summary,
                body,
                labels,
            });
            this.logger.log(`Issue created: ${response.data.html_url} (#${response.data.number})`);
            return {
                issueNumber: response.data.number,
                issueUrl: response.data.url,
                htmlUrl: response.data.html_url,
            };
        }
        catch (error) {
            this.logger.error(`Failed to create GitHub issue: ${error.message}`, error.stack);
            if (error.status === 404) {
                throw new common_1.BadRequestException(`Repository not found: ${analysis.repo}. Check the repo name and token permissions.`);
            }
            if (error.status === 422) {
                throw new common_1.BadRequestException(`GitHub validation error: ${error.message}`);
            }
            throw new common_1.BadGatewayException(`Failed to create GitHub issue: ${error.message}`);
        }
    }
    buildLabels(analysis) {
        const labels = ['ai-task'];
        if (analysis.task_type) {
            labels.push(analysis.task_type);
        }
        if (analysis.recommended_agent === 'codex') {
            labels.push('codex');
        }
        else if (analysis.recommended_agent === 'copilot') {
            labels.push('copilot-eligible');
        }
        return labels;
    }
};
exports.GitHubIssuesService = GitHubIssuesService;
exports.GitHubIssuesService = GitHubIssuesService = GitHubIssuesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GitHubIssuesService);
//# sourceMappingURL=github-issues.service.js.map