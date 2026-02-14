import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SlackWebhookController } from './slack-webhook.controller';
import { SlackService } from './slack.service';
import { TasksService } from '../tasks/tasks.service';
import { BadRequestException } from '@nestjs/common';

describe('SlackWebhookController', () => {
  let controller: SlackWebhookController;
  let slackService: SlackService;
  let tasksService: TasksService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlackWebhookController],
      providers: [
        {
          provide: SlackService,
          useValue: {
            sendClarificationQuestions: jest.fn(),
            sendThreadReply: jest.fn(),
          },
        },
        {
          provide: TasksService,
          useValue: {
            create: jest.fn(),
            clarify: jest.fn(),
            prisma: {
              task: {
                update: jest.fn(),
                findFirst: jest.fn(),
              },
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SLACK_SIGNING_SECRET') return 'test-secret';
              if (key === 'DEFAULT_REPO') return 'mothership/finance-service';
              return null;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<SlackWebhookController>(SlackWebhookController);
    slackService = module.get<SlackService>(SlackService);
    tasksService = module.get<TasksService>(TasksService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleWebhook', () => {
    it('should handle URL verification challenge', async () => {
      const body = {
        type: 'url_verification',
        challenge: 'test-challenge-123',
      };

      // Mock signature verification to pass
      jest.spyOn<any, any>(controller, 'verifySlackSignature').mockReturnValue(true);

      const result = await controller.handleWebhook(body, 'sig', '123');

      expect(result).toEqual({ challenge: 'test-challenge-123' });
    });

    it('should reject invalid signature', async () => {
      const body = { type: 'event_callback' };

      jest.spyOn<any, any>(controller, 'verifySlackSignature').mockReturnValue(false);

      await expect(
        controller.handleWebhook(body, 'invalid-sig', '123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('parseAnswersFromText', () => {
    it('should parse numbered list correctly', () => {
      const text = '1. First answer\n2. Second answer\n3. Third answer';
      const result = controller['parseAnswersFromText'](text, 3);

      expect(result).toEqual(['First answer', 'Second answer', 'Third answer']);
    });

    it('should parse newline-separated answers', () => {
      const text = 'First answer\nSecond answer\nThird answer';
      const result = controller['parseAnswersFromText'](text, 3);

      expect(result).toEqual(['First answer', 'Second answer', 'Third answer']);
    });

    it('should return full text for single answer', () => {
      const text = 'This is a single long answer';
      const result = controller['parseAnswersFromText'](text, 1);

      expect(result).toEqual(['This is a single long answer']);
    });

    it('should take first N lines if too many', () => {
      const text = 'Line 1\nLine 2\nLine 3\nLine 4';
      const result = controller['parseAnswersFromText'](text, 2);

      expect(result).toEqual(['Line 1', 'Line 2']);
    });
  });

  describe('verifySlackSignature', () => {
    it('should return true for valid signature', () => {
      const body = '{"test":"data"}';
      const timestamp = String(Math.floor(Date.now() / 1000)); // Current timestamp
      const signingSecret = 'test-secret';

      // Mock ConfigService to return the signing secret
      const getSpy = jest.spyOn(configService, 'get');
      getSpy.mockImplementation((key: string) => {
        if (key === 'SLACK_SIGNING_SECRET') return signingSecret;
        return null;
      });

      // Create valid signature
      const crypto = require('crypto');
      const sigBasestring = `v0:${timestamp}:${body}`;
      const hmac = crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex');
      const signature = `v0=${hmac}`;

      const result = controller['verifySlackSignature'](body, signature, timestamp);

      expect(result).toBe(true);
    });

    it('should reject old timestamps', () => {
      const body = JSON.stringify({ test: 'data' });
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400); // 400 seconds ago
      const signature = 'v0=abc123';

      const result = controller['verifySlackSignature'](body, signature, oldTimestamp);

      expect(result).toBe(false);
    });

    it('should allow requests when signing secret is not configured', () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);

      const result = controller['verifySlackSignature']('body', 'sig', '123');

      expect(result).toBe(true);
    });
  });
});
