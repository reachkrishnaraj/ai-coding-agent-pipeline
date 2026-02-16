import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: NotificationsService;

  const mockNotificationsService = {
    getOrCreatePreferences: jest.fn(),
    updatePreferences: jest.fn(),
    getNotificationHistory: jest.fn(),
    unsubscribe: jest.fn(),
    resubscribe: jest.fn(),
  };

  const mockReq = {
    user: { username: 'test-user' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPreferences', () => {
    it('should return preferences for the current user', async () => {
      const mockPrefs = {
        userId: 'test-user',
        channels: {
          email: { enabled: true, address: 'test-user@example.com', digestMode: 'real-time' },
          slack_dm: { enabled: true },
          slack_channel: { enabled: false },
        },
        quietHours: { enabled: false, startTime: '18:00', endTime: '09:00', daysOfWeek: [1, 2, 3, 4, 5], bypassForUrgent: true },
        eventPreferences: { task_created: false, task_dispatched: true },
      };

      mockNotificationsService.getOrCreatePreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getPreferences(mockReq);

      expect(result).toEqual(mockPrefs);
      expect(service.getOrCreatePreferences).toHaveBeenCalledWith('test-user');
    });

    it('should fall back to session user if req.user is missing', async () => {
      const sessionReq = {
        session: { user: { username: 'session-user' } },
      } as any;
      const mockPrefs = { userId: 'session-user' };

      mockNotificationsService.getOrCreatePreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getPreferences(sessionReq);

      expect(result).toEqual(mockPrefs);
      expect(service.getOrCreatePreferences).toHaveBeenCalledWith('session-user');
    });

    it('should fall back to test-user if no user info is available', async () => {
      const emptyReq = {} as any;
      const mockPrefs = { userId: 'test-user' };

      mockNotificationsService.getOrCreatePreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getPreferences(emptyReq);

      expect(result).toEqual(mockPrefs);
      expect(service.getOrCreatePreferences).toHaveBeenCalledWith('test-user');
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences for the current user', async () => {
      const updates = {
        channels: {
          email: { enabled: false, address: 'new@example.com', digestMode: 'daily' as const },
          slack_dm: { enabled: true },
          slack_channel: { enabled: false },
        },
      };

      const mockResult = { userId: 'test-user', ...updates };

      mockNotificationsService.updatePreferences.mockResolvedValue(mockResult);

      const result = await controller.updatePreferences(mockReq, updates as any);

      expect(result).toEqual(mockResult);
      expect(service.updatePreferences).toHaveBeenCalledWith('test-user', updates);
    });
  });

  describe('resetPreferences', () => {
    it('should reset preferences to defaults', async () => {
      const mockDefaultPrefs = {
        userId: 'test-user',
        channels: {
          email: { enabled: true, address: 'test-user@example.com', digestMode: 'real-time' },
          slack_dm: { enabled: true },
          slack_channel: { enabled: false },
        },
      };

      mockNotificationsService.updatePreferences.mockResolvedValue({});
      mockNotificationsService.getOrCreatePreferences.mockResolvedValue(mockDefaultPrefs);

      const result = await controller.resetPreferences(mockReq);

      expect(result).toEqual(mockDefaultPrefs);
      expect(service.updatePreferences).toHaveBeenCalledWith('test-user', expect.objectContaining({
        channels: expect.objectContaining({
          email: expect.objectContaining({ enabled: true, digestMode: 'real-time' }),
          slack_dm: expect.objectContaining({ enabled: true }),
          slack_channel: expect.objectContaining({ enabled: false }),
        }),
        quietHours: expect.objectContaining({
          enabled: false,
          bypassForUrgent: true,
        }),
        eventPreferences: expect.objectContaining({
          task_created: false,
          task_clarification_needed: true,
          task_dispatched: true,
          pr_opened: true,
          pr_merged: true,
          task_failed: true,
        }),
      }));
      expect(service.getOrCreatePreferences).toHaveBeenCalledWith('test-user');
    });
  });

  describe('getHistory', () => {
    it('should return paginated notification history with default pagination', async () => {
      const mockResult = {
        logs: [{ id: '1', eventType: 'task_created', status: 'sent' }],
        total: 1,
      };

      mockNotificationsService.getNotificationHistory.mockResolvedValue(mockResult);

      const result = await controller.getHistory(mockReq);

      expect(result).toEqual({
        logs: mockResult.logs,
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(service.getNotificationHistory).toHaveBeenCalledWith(
        { userId: 'test-user' },
        1,
        20,
      );
    });

    it('should apply pagination and filters', async () => {
      const mockResult = { logs: [], total: 0 };

      mockNotificationsService.getNotificationHistory.mockResolvedValue(mockResult);

      const result = await controller.getHistory(
        mockReq,
        '2',      // page
        '10',     // limit
        'sent',   // status
        'email',  // channel
        'task_created', // eventType
        'task-123',     // taskId
      );

      expect(result).toEqual({
        logs: [],
        total: 0,
        page: 2,
        limit: 10,
      });
      expect(service.getNotificationHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          status: 'sent',
          channel: 'email',
          eventType: 'task_created',
          taskId: 'task-123',
        }),
        2,
        10,
      );
    });

    it('should apply date filters when provided', async () => {
      const mockResult = { logs: [], total: 0 };
      mockNotificationsService.getNotificationHistory.mockResolvedValue(mockResult);

      await controller.getHistory(
        mockReq,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '2026-01-01',
        '2026-01-31',
      );

      expect(service.getNotificationHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-31'),
        }),
        1,
        20,
      );
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe and return HTML response', async () => {
      const mockPrefs = { userId: 'test-user', unsubscribed: { email: true, slackDm: true, slackChannel: true } };
      mockNotificationsService.unsubscribe.mockResolvedValue(mockPrefs);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.unsubscribe('some-token', 'email', mockRes);

      expect(service.unsubscribe).toHaveBeenCalledWith('some-token', 'email');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('Unsubscribed'));
    });

    it('should throw NotFoundException for invalid token', async () => {
      mockNotificationsService.unsubscribe.mockResolvedValue(null);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await expect(controller.unsubscribe('invalid-token', undefined, mockRes))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('resubscribe', () => {
    it('should resubscribe and return HTML response', async () => {
      const mockPrefs = { userId: 'test-user', unsubscribed: { email: false, slackDm: false, slackChannel: false } };
      mockNotificationsService.resubscribe.mockResolvedValue(mockPrefs);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.resubscribe('some-token', 'email', mockRes);

      expect(service.resubscribe).toHaveBeenCalledWith('some-token', 'email');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(expect.stringContaining('Resubscribed'));
    });

    it('should throw NotFoundException for invalid token', async () => {
      mockNotificationsService.resubscribe.mockResolvedValue(null);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await expect(controller.resubscribe('invalid-token', undefined, mockRes))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getQuietHoursStatus', () => {
    it('should return quiet hours status when disabled', async () => {
      const mockPrefs = {
        quietHours: {
          enabled: false,
          startTime: '18:00',
          endTime: '09:00',
          daysOfWeek: [1, 2, 3, 4, 5],
          bypassForUrgent: true,
        },
        timezone: 'UTC',
      };

      mockNotificationsService.getOrCreatePreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getQuietHoursStatus(mockReq);

      expect(result).toHaveProperty('quietHoursEnabled', false);
      expect(result).toHaveProperty('isCurrentlyQuiet', false);
      expect(result).toHaveProperty('currentTime');
      expect(result).toHaveProperty('timezone', 'UTC');
      expect(service.getOrCreatePreferences).toHaveBeenCalledWith('test-user');
    });

    it('should return quiet hours status when enabled', async () => {
      const mockPrefs = {
        quietHours: {
          enabled: true,
          startTime: '00:00',
          endTime: '23:59',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // all days
          bypassForUrgent: true,
        },
        timezone: 'America/New_York',
      };

      mockNotificationsService.getOrCreatePreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getQuietHoursStatus(mockReq);

      expect(result).toHaveProperty('quietHoursEnabled', true);
      // Should be in quiet hours since range covers all day every day
      expect(result.isCurrentlyQuiet).toBe(true);
      expect(result).toHaveProperty('timezone', 'America/New_York');
    });
  });
});
