import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlackService } from './slack.service';

describe('SlackService', () => {
  let service: SlackService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SLACK_BOT_TOKEN') return 'xoxb-test-token';
              if (key === 'SLACK_DEFAULT_USER_ID') return 'U0123456789';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SlackService>(SlackService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendDM', () => {
    it('should warn if SLACK_BOT_TOKEN is not configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);
      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      const result = await service.sendDM('U123', 'test message');

      expect(result).toBeNull();
      expect(loggerSpy).toHaveBeenCalledWith(
        'Cannot send DM: SLACK_BOT_TOKEN not configured',
      );
    });
  });

  describe('formatDispatchedMessage', () => {
    it('should format dispatched message correctly', () => {
      const task = {
        recommendedAgent: 'claude-code',
        llmSummary: 'Fix payment bug',
        githubIssueUrl: 'https://github.com/org/repo/issues/1',
      };

      const message = service['formatDispatchedMessage'](task);

      expect(message).toContain('*Task dispatched to claude-code*');
      expect(message).toContain('Fix payment bug');
      expect(message).toContain('https://github.com/org/repo/issues/1');
    });
  });

  describe('formatPrOpenedMessage', () => {
    it('should format PR opened message correctly', () => {
      const task = {
        llmSummary: 'Fix payment bug',
        githubPrUrl: 'https://github.com/org/repo/pull/42',
      };

      const message = service['formatPrOpenedMessage'](task);

      expect(message).toContain('*PR ready for review*');
      expect(message).toContain('Fix payment bug');
      expect(message).toContain('https://github.com/org/repo/pull/42');
    });
  });

  describe('formatPrMergedMessage', () => {
    it('should format PR merged message correctly', () => {
      const task = {
        llmSummary: 'Fix payment bug',
        githubPrUrl: 'https://github.com/org/repo/pull/42',
      };

      const message = service['formatPrMergedMessage'](task);

      expect(message).toContain('*Done! PR has been merged.*');
      expect(message).toContain('Fix payment bug');
      expect(message).toContain('https://github.com/org/repo/pull/42');
    });
  });

  describe('formatClarificationQuestionsMessage', () => {
    it('should format clarification questions correctly', () => {
      const questions = [
        'What is the current behavior?',
        'What is the expected behavior?',
      ];

      const message = service['formatClarificationQuestionsMessage'](
        'task-123',
        questions,
      );

      expect(message).toContain('*I need some clarification');
      expect(message).toContain('1. What is the current behavior?');
      expect(message).toContain('2. What is the expected behavior?');
      expect(message).toContain('reply to this thread');
    });
  });
});
