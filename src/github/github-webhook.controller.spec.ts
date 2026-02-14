import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { GitHubWebhookController } from './github-webhook.controller';
import * as crypto from 'crypto';

describe('GitHubWebhookController', () => {
  let controller: GitHubWebhookController;
  const webhookSecret = 'test-secret';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubWebhookController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GITHUB_WEBHOOK_SECRET') return webhookSecret;
              return null;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<GitHubWebhookController>(GitHubWebhookController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const hmac = crypto.createHmac('sha256', webhookSecret);
      const signature = 'sha256=' + hmac.update(payload).digest('hex');

      const result = controller.verifyWebhookSignature(payload, signature);

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'sha256=invalid';

      const result = controller.verifyWebhookSignature(payload, invalidSignature);

      expect(result).toBe(false);
    });

    it('should reject missing signature', () => {
      const payload = JSON.stringify({ test: 'data' });

      const result = controller.verifyWebhookSignature(payload, '');

      expect(result).toBe(false);
    });

    it('should handle tampered payload', () => {
      const originalPayload = JSON.stringify({ test: 'data' });
      const tamperedPayload = JSON.stringify({ test: 'hacked' });

      const hmac = crypto.createHmac('sha256', webhookSecret);
      const signature = 'sha256=' + hmac.update(originalPayload).digest('hex');

      const result = controller.verifyWebhookSignature(tamperedPayload, signature);

      expect(result).toBe(false);
    });
  });

  describe('handleGitHubWebhook', () => {
    it('should reject requests with invalid signature', async () => {
      const payload = { action: 'opened' };
      const invalidSignature = 'sha256=invalid';

      await expect(
        controller.handleGitHubWebhook(
          invalidSignature,
          'pull_request',
          payload,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept requests with valid signature', async () => {
      const payload = { action: 'opened' };
      const payloadString = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', webhookSecret);
      const signature = 'sha256=' + hmac.update(payloadString).digest('hex');

      const result = await controller.handleGitHubWebhook(
        signature,
        'pull_request',
        payload,
      );

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('event handling', () => {
    const createValidSignature = (payload: any): string => {
      const payloadString = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', webhookSecret);
      return 'sha256=' + hmac.update(payloadString).digest('hex');
    };

    it('should handle PR opened event', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 123,
          html_url: 'https://github.com/mothership/test/pull/123',
          merged: false,
          state: 'open',
          user: { login: 'test-bot' },
        },
      };

      const signature = createValidSignature(payload);

      const result = await controller.handleGitHubWebhook(
        signature,
        'pull_request',
        payload,
      );

      expect(result).toEqual({ status: 'ok' });
    });

    it('should handle PR merged event', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          number: 123,
          html_url: 'https://github.com/mothership/test/pull/123',
          merged: true,
          state: 'closed',
          user: { login: 'test-bot' },
        },
      };

      const signature = createValidSignature(payload);

      const result = await controller.handleGitHubWebhook(
        signature,
        'pull_request',
        payload,
      );

      expect(result).toEqual({ status: 'ok' });
    });

    it('should handle PR closed without merge', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          number: 123,
          html_url: 'https://github.com/mothership/test/pull/123',
          merged: false,
          state: 'closed',
          user: { login: 'test-bot' },
        },
      };

      const signature = createValidSignature(payload);

      const result = await controller.handleGitHubWebhook(
        signature,
        'pull_request',
        payload,
      );

      expect(result).toEqual({ status: 'ok' });
    });

    it('should handle issue comment event', async () => {
      const payload = {
        action: 'created',
        issue: {
          number: 456,
          html_url: 'https://github.com/mothership/test/issues/456',
        },
        comment: {
          body: 'Question from bot',
          user: { login: 'github-actions[bot]' },
        },
      };

      const signature = createValidSignature(payload);

      const result = await controller.handleGitHubWebhook(
        signature,
        'issue_comment',
        payload,
      );

      expect(result).toEqual({ status: 'ok' });
    });
  });
});
