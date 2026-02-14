import { SlackService } from './slack.service';
import { PrismaService } from '../prisma/prisma.service';
export declare class SlackNotificationService {
    private readonly slackService;
    private readonly prisma;
    private readonly logger;
    constructor(slackService: SlackService, prisma: PrismaService);
    notifyTaskDispatched(taskId: string): Promise<void>;
    notifyPROpened(taskId: string): Promise<void>;
    notifyPRMerged(taskId: string): Promise<void>;
    notifyPRClosed(taskId: string): Promise<void>;
    notifyAgentQuestion(taskId: string): Promise<void>;
}
