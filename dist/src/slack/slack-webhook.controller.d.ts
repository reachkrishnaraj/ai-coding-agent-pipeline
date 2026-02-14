import { ConfigService } from '@nestjs/config';
import { SlackService } from './slack.service';
import { TasksService } from '../tasks/tasks.service';
export declare class SlackWebhookController {
    private readonly slackService;
    private readonly tasksService;
    private readonly configService;
    private readonly logger;
    constructor(slackService: SlackService, tasksService: TasksService, configService: ConfigService);
    handleWebhook(body: any, signature: string, timestamp: string): Promise<{
        text: string;
        response_type: string;
    } | {
        challenge: any;
        ok?: undefined;
    } | {
        ok: boolean;
        challenge?: undefined;
    }>;
    private handleSlashCommand;
    private handleEvent;
    private handleThreadReply;
    private parseAnswersFromText;
    private verifySlackSignature;
}
