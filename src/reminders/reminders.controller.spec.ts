import { Test, TestingModule } from '@nestjs/testing';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { AuthGuard } from '../auth/auth.guard';

describe('RemindersController', () => {
  let controller: RemindersController;
  let service: RemindersService;

  const mockRemindersService = {
    getReminders: jest.fn(),
    getReminderSummary: jest.fn(),
    getOrCreatePreferences: jest.fn(),
    updatePreferences: jest.fn(),
    snoozeReminder: jest.fn(),
    dismissReminder: jest.fn(),
    undoDismiss: jest.fn(),
    deleteReminder: jest.fn(),
    createReminder: jest.fn(),
  };

  const mockReq = {
    user: { username: 'test-user', role: 'admin' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemindersController],
      providers: [
        {
          provide: RemindersService,
          useValue: mockRemindersService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RemindersController>(RemindersController);
    service = module.get<RemindersService>(RemindersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getReminders', () => {
    it('should return paginated reminders with default pagination', async () => {
      const mockResult = {
        reminders: [
          { _id: 'rem-1', title: 'Reminder 1', status: 'pending' },
        ],
        total: 1,
      };

      mockRemindersService.getReminders.mockResolvedValue(mockResult);

      const result = await controller.getReminders(mockReq);

      expect(result).toEqual({
        reminders: mockResult.reminders,
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(service.getReminders).toHaveBeenCalledWith('test-user', {
        status: undefined,
        type: undefined,
        taskId: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('should apply filters and custom pagination', async () => {
      const mockResult = {
        reminders: [],
        total: 0,
      };

      mockRemindersService.getReminders.mockResolvedValue(mockResult);

      const result = await controller.getReminders(
        mockReq,
        'pending',
        'pr_review',
        'task-123',
        2,
        10,
      );

      expect(result).toEqual({
        reminders: [],
        total: 0,
        page: 2,
        limit: 10,
      });
      expect(service.getReminders).toHaveBeenCalledWith('test-user', {
        status: 'pending',
        type: 'pr_review',
        taskId: 'task-123',
        page: 2,
        limit: 10,
      });
    });

    it('should use "unknown" when user is missing', async () => {
      const reqNoUser = { user: {} } as any;
      mockRemindersService.getReminders.mockResolvedValue({
        reminders: [],
        total: 0,
      });

      await controller.getReminders(reqNoUser);

      expect(service.getReminders).toHaveBeenCalledWith(
        'unknown',
        expect.any(Object),
      );
    });
  });

  describe('getReminderSummary', () => {
    it('should return reminder summary for the current user', async () => {
      const mockSummary = {
        pending: 3,
        snoozed: 1,
        overdue: [
          {
            taskId: 'task-123',
            title: 'Fix payment bug',
            type: 'stuck_clarification',
            overdueSince: '2h',
            link: '/tasks/task-123',
          },
        ],
      };

      mockRemindersService.getReminderSummary.mockResolvedValue(mockSummary);

      const result = await controller.getReminderSummary(mockReq);

      expect(result).toEqual(mockSummary);
      expect(service.getReminderSummary).toHaveBeenCalledWith('test-user');
    });
  });

  describe('getPreferences', () => {
    it('should return user preferences', async () => {
      const mockPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: true, slack: true },
        reminders: {
          stuckClarification: true,
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
      };

      mockRemindersService.getOrCreatePreferences.mockResolvedValue(mockPrefs);

      const result = await controller.getPreferences(mockReq);

      expect(result).toEqual(mockPrefs);
      expect(service.getOrCreatePreferences).toHaveBeenCalledWith('test-user');
    });
  });

  describe('updatePreferences', () => {
    it('should update user preferences', async () => {
      const updates = {
        channels: { inApp: true, email: false, slack: true },
      };

      const updatedPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: false, slack: true },
      };

      mockRemindersService.updatePreferences.mockResolvedValue(updatedPrefs);

      const result = await controller.updatePreferences(mockReq, updates);

      expect(result).toEqual(updatedPrefs);
      expect(service.updatePreferences).toHaveBeenCalledWith(
        'test-user',
        updates,
      );
    });
  });

  describe('snoozeReminder', () => {
    it('should snooze a reminder and return formatted response', async () => {
      const snoozeUntil = new Date('2026-02-16T10:00:00.000Z');
      const mockReminder = {
        _id: { toString: () => 'rem-123' },
        status: 'snoozed',
        snoozeUntil,
      };

      mockRemindersService.snoozeReminder.mockResolvedValue(mockReminder);

      const result = await controller.snoozeReminder('rem-123', 4);

      expect(result).toEqual({
        id: 'rem-123',
        status: 'snoozed',
        snoozeUntil,
        message: `Reminder snoozed until ${snoozeUntil.toISOString()}`,
      });
      expect(service.snoozeReminder).toHaveBeenCalledWith('rem-123', 4);
    });
  });

  describe('dismissReminder', () => {
    it('should dismiss a reminder with a reason', async () => {
      const dismissedAt = new Date('2026-02-15T12:00:00.000Z');
      const mockReminder = {
        _id: { toString: () => 'rem-123' },
        status: 'dismissed',
        dismissedAt,
      };

      mockRemindersService.dismissReminder.mockResolvedValue(mockReminder);

      const result = await controller.dismissReminder(
        'rem-123',
        'not_applicable',
      );

      expect(result).toEqual({
        id: 'rem-123',
        status: 'dismissed',
        dismissedAt,
      });
      expect(service.dismissReminder).toHaveBeenCalledWith(
        'rem-123',
        'not_applicable',
      );
    });

    it('should dismiss a reminder without a reason', async () => {
      const dismissedAt = new Date();
      const mockReminder = {
        _id: { toString: () => 'rem-123' },
        status: 'dismissed',
        dismissedAt,
      };

      mockRemindersService.dismissReminder.mockResolvedValue(mockReminder);

      const result = await controller.dismissReminder('rem-123');

      expect(result.status).toBe('dismissed');
      expect(service.dismissReminder).toHaveBeenCalledWith(
        'rem-123',
        undefined,
      );
    });
  });

  describe('undoDismiss', () => {
    it('should undo dismiss and return formatted response', async () => {
      const mockReminder = {
        _id: { toString: () => 'rem-123' },
        status: 'pending',
        dismissedAt: undefined,
      };

      mockRemindersService.undoDismiss.mockResolvedValue(mockReminder);

      const result = await controller.undoDismiss('rem-123');

      expect(result).toEqual({
        id: 'rem-123',
        status: 'pending',
        dismissedAt: undefined,
      });
      expect(service.undoDismiss).toHaveBeenCalledWith('rem-123');
    });
  });

  describe('deleteReminder', () => {
    it('should delete a reminder', async () => {
      mockRemindersService.deleteReminder.mockResolvedValue(undefined);

      await controller.deleteReminder('rem-123');

      expect(service.deleteReminder).toHaveBeenCalledWith('rem-123');
    });
  });

  describe('createCustomReminder', () => {
    it('should create a custom reminder and return formatted response', async () => {
      const scheduledFor = new Date('2026-02-20T10:00:00.000Z');
      const mockReminder = {
        _id: { toString: () => 'rem-new' },
        taskId: 'task-123',
        type: 'custom',
        title: 'Review changes',
        status: 'pending',
        scheduledFor,
      };

      mockRemindersService.createReminder.mockResolvedValue(mockReminder);

      const result = await controller.createCustomReminder(mockReq, {
        taskId: 'task-123',
        title: 'Review changes',
        description: 'Check the PR for edge cases',
        scheduledFor: '2026-02-20T10:00:00.000Z',
        channels: ['in-app', 'email'],
      });

      expect(result).toEqual({
        id: 'rem-new',
        taskId: 'task-123',
        type: 'custom',
        title: 'Review changes',
        status: 'pending',
        scheduledFor,
      });
      expect(service.createReminder).toHaveBeenCalledWith({
        userId: 'test-user',
        taskId: 'task-123',
        type: 'custom',
        title: 'Review changes',
        description: 'Check the PR for edge cases',
        scheduledFor: new Date('2026-02-20T10:00:00.000Z'),
        maxRecurrences: 1,
        payload: {
          channels: ['in-app', 'email'],
        },
      });
    });

    it('should create a recurring reminder when recurring is enabled', async () => {
      const scheduledFor = new Date('2026-02-20T10:00:00.000Z');
      const mockReminder = {
        _id: { toString: () => 'rem-new' },
        taskId: 'task-123',
        type: 'custom',
        title: 'Daily check',
        status: 'pending',
        scheduledFor,
      };

      mockRemindersService.createReminder.mockResolvedValue(mockReminder);

      await controller.createCustomReminder(mockReq, {
        taskId: 'task-123',
        title: 'Daily check',
        scheduledFor: '2026-02-20T10:00:00.000Z',
        recurring: { enabled: true },
      });

      expect(service.createReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRecurrences: undefined,
        }),
      );
    });
  });
});
