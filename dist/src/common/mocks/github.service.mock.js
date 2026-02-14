"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubServiceMock = void 0;
const common_1 = require("@nestjs/common");
let GitHubServiceMock = class GitHubServiceMock {
    async createIssue(task, analysis) {
        const issueNumber = Math.floor(Math.random() * 1000) + 1;
        const [owner, repo] = task.repo.split('/');
        return {
            issueNumber,
            issueUrl: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
            htmlUrl: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
        };
    }
};
exports.GitHubServiceMock = GitHubServiceMock;
exports.GitHubServiceMock = GitHubServiceMock = __decorate([
    (0, common_1.Injectable)()
], GitHubServiceMock);
//# sourceMappingURL=github.service.mock.js.map