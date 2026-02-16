import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationPreference } from '../common/schemas/notification-preference.schema';
import { NotificationLog } from '../common/schemas/notification-log.schema';
import { EmailService } from './email.service';
import { SlackService } from '../slack/slack.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockNotificationPreferenceModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const mockNotificationLogModel = {
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
  };

  const mockEmailService = {
    sendEmail: jest.fn(),
  };

  const mockSlackService = {
    sendDM: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        APP_URL: 'http://localhost:3000',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getModelToken(NotificationPreference.name),
          useValue: mockNotificationPreferenceModel,
        },
        {
          provide: getModelToken(NotificationLog.name),
          useValue: mockNotificationLogModel,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: SlackService,
          useValue: mockSlackService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreatePreferences', () => {
    it('should return existing preferences', async () => {
      const existingPrefs = {
        userId: 'test-user',
        channels: {
          email: { enabled: true, address: 'test-user@example.com', digestMode: 'real-time' },
          slack_dm: { enabled: true },
          slack_channel: { enabled: false },
        },
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(existingPrefs);

      const result = await service.getOrCreatePreferences('test-user');

      expect(result).toEqual(existingPrefs);
      expect(mockNotificationPreferenceModel.findOne).toHaveBeenCalledWith({ userId: 'test-user' });
    });

    it('should create default preferences when none exist', async () => {
      const createdPrefs = {
        userId: 'new-user',
        channels: {
          email: { enabled: true, address: 'new-user@example.com', digestMode: 'real-time' },
          slack_dm: { enabled: true },
          slack_channel: { enabled: false },
        },
        quietHours: {
          enabled: false,
          startTime: '18:00',
          endTime: '09:00',
          daysOfWeek: [1, 2, 3, 4, 5],
          bypassForUrgent: true,
        },
        eventPreferences: {
          task_created: false,
          task_clarification_needed: true,
          task_dispatched: true,
          pr_opened: true,
          pr_merged: true,
          pr_closed: true,
          task_failed: true,
          agent_question: true,
          task_clarified: false,
        },
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(null);
      mockNotificationPreferenceModel.create.mockResolvedValue(createdPrefs);

      const result = await service.getOrCreatePreferences('new-user');

      expect(result).toEqual(createdPrefs);
      expect(mockNotificationPreferenceModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'new-user',
          email: 'new-user@example.com',
          channels: expect.objectContaining({
            email: expect.objectContaining({ enabled: true }),
          }),
        }),
      );
    });
  });

  describe('updatePreferences', () => {
    it('should update and save preferences', async () => {
      const existingPrefs = {
        userId: 'test-user',
        channels: {
          email: { enabled: true, address: 'test@example.com', digestMode: 'real-time' },
          slack_dm: { enabled: true },
          slack_channel: { enabled: false },
        },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(existingPrefs);
      existingPrefs.save.mockResolvedValue(existingPrefs);

      const updates = {
        channels: {
          email: { enabled: false, address: 'new@example.com', digestMode: 'daily' as const },
          slack_dm: { enabled: false },
          slack_channel: { enabled: false },
        },
      };

      const result = await service.updatePreferences('test-user', updates as any);

      expect(existingPrefs.save).toHaveBeenCalled();
      expect(result.channels.email.enabled).toBe(false);
    });
  });

  describe('getNotificationHistory', () => {
    it('should return paginated notification logs', async () => {
      const mockLogs = [
        { userId: 'test-user', eventType: 'task_created', status: 'sent' },
      ];

      mockNotificationLogModel.find.mockReturnThis();
      mockNotificationLogModel.sort.mockReturnThis();
      mockNotificationLogModel.skip.mockReturnThis();
      mockNotificationLogModel.limit.mockReturnThis();
      mockNotificationLogModel.exec.mockResolvedValue(mockLogs);
      mockNotificationLogModel.countDocuments.mockResolvedValue(1);

      const result = await service.getNotificationHistory(
        { userId: 'test-user' },
        1,
        20,
      );

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(1);
      expect(mockNotificationLogModel.find).toHaveBeenCalledWith({ userId: 'test-user' });
      expect(mockNotificationLogModel.skip).toHaveBeenCalledWith(0);
      expect(mockNotificationLogModel.limit).toHaveBeenCalledWith(20);
    });

    it('should apply status and channel filters', async () => {
      mockNotificationLogModel.find.mockReturnThis();
      mockNotificationLogModel.sort.mockReturnThis();
      mockNotificationLogModel.skip.mockReturnThis();
      mockNotificationLogModel.limit.mockReturnThis();
      mockNotificationLogModel.exec.mockResolvedValue([]);
      mockNotificationLogModel.countDocuments.mockResolvedValue(0);

      await service.getNotificationHistory(
        { userId: 'test-user', status: 'sent', channel: 'email' },
        1,
        10,
      );

      expect(mockNotificationLogModel.find).toHaveBeenCalledWith({
        userId: 'test-user',
        status: 'sent',
        channel: 'email',
      });
    });

    it('should apply date range filters', async () => {
      mockNotificationLogModel.find.mockReturnThis();
      mockNotificationLogModel.sort.mockReturnThis();
      mockNotificationLogModel.skip.mockReturnThis();
      mockNotificationLogModel.limit.mockReturnThis();
      mockNotificationLogModel.exec.mockResolvedValue([]);
      mockNotificationLogModel.countDocuments.mockResolvedValue(0);

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      await service.getNotificationHistory(
        { userId: 'test-user', startDate, endDate },
        1,
        20,
      );

      expect(mockNotificationLogModel.find).toHaveBeenCalledWith({
        userId: 'test-user',
        createdAt: { $gte: startDate, $lte: endDate },
      });
    });

    it('should paginate correctly for page 2', async () => {
      mockNotificationLogModel.find.mockReturnThis();
      mockNotificationLogModel.sort.mockReturnThis();
      mockNotificationLogModel.skip.mockReturnThis();
      mockNotificationLogModel.limit.mockReturnThis();
      mockNotificationLogModel.exec.mockResolvedValue([]);
      mockNotificationLogModel.countDocuments.mockResolvedValue(25);

      const result = await service.getNotificationHistory(
        { userId: 'test-user' },
        2,
        10,
      );

      expect(result.total).toBe(25);
      expect(mockNotificationLogModel.skip).toHaveBeenCalledWith(10);
      expect(mockNotificationLogModel.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from a specific channel', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: false, slackDm: false, slackChannel: false },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      const result = await service.unsubscribe('some-token', 'email');

      expect(result).toBeTruthy();
      expect(mockPrefs.unsubscribed.email).toBe(true);
      expect(mockPrefs.unsubscribed.slackDm).toBe(false);
      expect(mockPrefs.save).toHaveBeenCalled();
      expect(mockNotificationPreferenceModel.findOne).toHaveBeenCalledWith({ unsubscribeToken: 'some-token' });
    });

    it('should unsubscribe from all channels when no channel specified', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: false, slackDm: false, slackChannel: false },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      const result = await service.unsubscribe('some-token');

      expect(result).toBeTruthy();
      expect(mockPrefs.unsubscribed.email).toBe(true);
      expect(mockPrefs.unsubscribed.slackDm).toBe(true);
      expect(mockPrefs.unsubscribed.slackChannel).toBe(true);
    });

    it('should unsubscribe from slack_dm channel', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: false, slackDm: false, slackChannel: false },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      await service.unsubscribe('some-token', 'slack_dm');

      expect(mockPrefs.unsubscribed.slackDm).toBe(true);
      expect(mockPrefs.unsubscribed.email).toBe(false);
    });

    it('should unsubscribe from slack_channel', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: false, slackDm: false, slackChannel: false },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      await service.unsubscribe('some-token', 'slack_channel');

      expect(mockPrefs.unsubscribed.slackChannel).toBe(true);
      expect(mockPrefs.unsubscribed.email).toBe(false);
    });

    it('should return null for invalid token', async () => {
      mockNotificationPreferenceModel.findOne.mockResolvedValue(null);

      const result = await service.unsubscribe('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('resubscribe', () => {
    it('should resubscribe to a specific channel', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: true, slackDm: true, slackChannel: true },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      const result = await service.resubscribe('some-token', 'email');

      expect(result).toBeTruthy();
      expect(mockPrefs.unsubscribed.email).toBe(false);
      expect(mockPrefs.unsubscribed.slackDm).toBe(true); // unchanged
      expect(mockPrefs.save).toHaveBeenCalled();
    });

    it('should resubscribe to all channels when no channel specified', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: true, slackDm: true, slackChannel: true },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      const result = await service.resubscribe('some-token');

      expect(result).toBeTruthy();
      expect(mockPrefs.unsubscribed.email).toBe(false);
      expect(mockPrefs.unsubscribed.slackDm).toBe(false);
      expect(mockPrefs.unsubscribed.slackChannel).toBe(false);
    });

    it('should resubscribe to slack_dm channel', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: true, slackDm: true, slackChannel: true },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      await service.resubscribe('some-token', 'slack_dm');

      expect(mockPrefs.unsubscribed.slackDm).toBe(false);
      expect(mockPrefs.unsubscribed.email).toBe(true); // unchanged
    });

    it('should resubscribe to slack_channel', async () => {
      const mockPrefs = {
        userId: 'test-user',
        unsubscribed: { email: true, slackDm: true, slackChannel: true },
        save: jest.fn(),
      };

      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockPrefs.save.mockResolvedValue(mockPrefs);

      await service.resubscribe('some-token', 'slack_channel');

      expect(mockPrefs.unsubscribed.slackChannel).toBe(false);
      expect(mockPrefs.unsubscribed.email).toBe(true); // unchanged
    });

    it('should return null for invalid token', async () => {
      mockNotificationPreferenceModel.findOne.mockResolvedValue(null);

      const result = await service.resubscribe('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('sendNotification', () => {
    const createMockPrefs = (overrides: any = {}) => ({
      userId: 'test-user',
      channels: {
        email: { enabled: true, address: 'test@example.com', digestMode: 'real-time' },
        slack_dm: { enabled: false },
        slack_channel: { enabled: false },
      },
      quietHours: {
        enabled: false,
        startTime: '18:00',
        endTime: '09:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        bypassForUrgent: true,
      },
      eventPreferences: {
        task_dispatched: true,
        task_created: false,
      },
      unsubscribed: { email: false, slackDm: false, slackChannel: false },
      unsubscribeToken: 'test-token',
      ...overrides,
    });

    it('should send email notification when event is enabled', async () => {
      const mockPrefs = createMockPrefs();
      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockEmailService.sendEmail.mockResolvedValue({ success: true, messageId: 'msg-1' });
      mockNotificationLogModel.create.mockResolvedValue({});

      await service.sendNotification('test-user', 'task_dispatched', {
        taskId: '123',
        summary: 'Fix the bug',
        repo: 'mothership/test',
        agent: 'claude-code',
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Task dispatched'),
        }),
      );
    });

    it('should skip notification when event is disabled', async () => {
      const mockPrefs = createMockPrefs();
      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);

      await service.sendNotification('test-user', 'task_created', {
        taskId: '123',
        description: 'New task',
      });

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should skip notification when user is unsubscribed from all channels', async () => {
      const mockPrefs = createMockPrefs({
        unsubscribed: { email: true, slackDm: true, slackChannel: false },
      });
      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);

      await service.sendNotification('test-user', 'task_dispatched', {
        taskId: '123',
      });

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should not throw on error', async () => {
      mockNotificationPreferenceModel.findOne.mockRejectedValue(new Error('DB error'));

      await expect(
        service.sendNotification('test-user', 'task_dispatched', {}),
      ).resolves.toBeUndefined();
    });

    it('should send slack DM when enabled', async () => {
      const mockPrefs = createMockPrefs({
        channels: {
          email: { enabled: false, address: 'test@example.com', digestMode: 'real-time' },
          slack_dm: { enabled: true, slackUserId: 'U12345' },
          slack_channel: { enabled: false },
        },
      });
      mockNotificationPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockSlackService.sendDM.mockResolvedValue('ts-123');
      mockNotificationLogModel.create.mockResolvedValue({});

      await service.sendNotification('test-user', 'task_dispatched', {
        taskId: '123',
        summary: 'Fix bug',
        repo: 'mothership/test',
        agent: 'claude-code',
      });

      expect(mockSlackService.sendDM).toHaveBeenCalledWith(
        'U12345',
        expect.stringContaining('Task Dispatched'),
      );
    });
  });
});
