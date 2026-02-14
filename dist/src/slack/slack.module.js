"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackModule = void 0;
const common_1 = require("@nestjs/common");
const slack_service_1 = require("./slack.service");
const slack_webhook_controller_1 = require("./slack-webhook.controller");
const slack_notification_service_1 = require("./slack-notification.service");
const tasks_module_1 = require("../tasks/tasks.module");
const prisma_module_1 = require("../prisma/prisma.module");
let SlackModule = class SlackModule {
};
exports.SlackModule = SlackModule;
exports.SlackModule = SlackModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [(0, common_1.forwardRef)(() => tasks_module_1.TasksModule), prisma_module_1.PrismaModule],
        controllers: [slack_webhook_controller_1.SlackWebhookController],
        providers: [
            slack_service_1.SlackService,
            slack_notification_service_1.SlackNotificationService,
            {
                provide: 'SlackNotificationService',
                useExisting: slack_notification_service_1.SlackNotificationService,
            },
        ],
        exports: [slack_service_1.SlackService, slack_notification_service_1.SlackNotificationService, 'SlackNotificationService'],
    })
], SlackModule);
//# sourceMappingURL=slack.module.js.map