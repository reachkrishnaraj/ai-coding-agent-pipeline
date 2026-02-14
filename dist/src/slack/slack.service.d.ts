import { ConfigService } from '@nestjs/config';
export declare class SlackService {
    private readonly configService;
    private readonly logger;
    private readonly client;
    constructor(configService: ConfigService);
    sendDM(slackUserId: string, text: string): Promise<string | null>;
    sendThreadReply(channel: string, threadTs: string, text: string): Promise<void>;
    sendTaskNotification(task: any, eventType: string): Promise<void>;
    sendClarificationQuestions(slackUserId: string, taskId: string, questions: string[]): Promise<string | null>;
    private formatDispatchedMessage;
    private formatPrOpenedMessage;
    private formatPrMergedMessage;
    private formatPrClosedMessage;
    private formatAgentQuestionMessage;
    private formatClarificationMessage;
    private formatClarificationQuestionsMessage;
}
