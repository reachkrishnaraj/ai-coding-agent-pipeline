"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmServiceMock = void 0;
const common_1 = require("@nestjs/common");
let LlmServiceMock = class LlmServiceMock {
    async analyzeTask(task) {
        const needsClarification = task.description.length < 20;
        return {
            clear_enough: !needsClarification,
            questions: needsClarification
                ? [
                    'Can you provide more details about the expected behavior?',
                    'What is the current behavior that needs to be changed?',
                ]
                : undefined,
            task_type: task.task_type_hint || 'bug-fix',
            recommended_agent: 'claude-code',
            summary: `Fix: ${task.description.substring(0, 50)}`,
            suggested_acceptance_criteria: [
                'All existing tests pass',
                'New functionality is tested',
            ],
            likely_files: task.files_hint
                ? task.files_hint.split(',').map((f) => f.trim())
                : ['src/modules/example/'],
            repo: task.repo || 'mothership/finance-service',
        };
    }
};
exports.LlmServiceMock = LlmServiceMock;
exports.LlmServiceMock = LlmServiceMock = __decorate([
    (0, common_1.Injectable)()
], LlmServiceMock);
//# sourceMappingURL=llm.service.mock.js.map