import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RemindersService } from './reminders.service';
import { Reminder } from '../common/schemas/reminder.schema';
import { ReminderPreference } from '../common/schemas/reminder-preference.schema';
import { Task } from '../common/schemas/task.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskStatus } from '../common/enums/task-status.enum';

describe('RemindersService', () => {
  let service: RemindersService;

  const mockReminderModel = {
    create: jest.fn(),
    find: jest.fn().mockReturnThis(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockReminderPreferenceModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const mockTaskModel = {
    findById: jest.fn(),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        {
          provide: getModelToken(Reminder.name),
          useValue: mockReminderModel,
        },
        {
          provide: getModelToken(ReminderPreference.name),
          useValue: mockReminderPreferenceModel,
        },
        {
          provide: getModelToken(Task.name),
          useValue: mockTaskModel,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReminder', () => {
    it('should create a new reminder', async () => {
      const params = {
        userId: 'test-user',
        taskId: 'task-123',
        type: 'pr_review',
        title: 'PR ready for review',
        scheduledFor: new Date('2026-02-16T10:00:00Z'),
        maxRecurrences: 5,
        payload: { prNumber: 42 },
      };

      const mockCreated = {
        _id: 'rem-123',
        ...params,
        status: 'pending',
        recurrenceCount: 0,
        snoozeCount: 0,
        failureCount: 0,
        sentVia: [],
      };

      mockReminderModel.create.mockResolvedValue(mockCreated);

      const result = await service.createReminder(params);

      expect(result).toEqual(mockCreated);
      expect(mockReminderModel.create).toHaveBeenCalledWith({
        userId: 'test-user',
        taskId: 'task-123',
        type: 'pr_review',
        title: 'PR ready for review',
        description: undefined,
        scheduledFor: params.scheduledFor,
        maxRecurrences: 5,
        payload: { prNumber: 42 },
        status: 'pending',
        recurrenceCount: 0,
        snoozeCount: 0,
        failureCount: 0,
        sentVia: [],
      });
    });

    it('should create a reminder with default payload', async () => {
      const params = {
        userId: 'test-user',
        taskId: 'task-123',
        type: 'custom',
        title: 'Check status',
        scheduledFor: new Date(),
      };

      mockReminderModel.create.mockResolvedValue({ _id: 'rem-new', ...params });

      await service.createReminder(params);

      expect(mockReminderModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {},
        }),
      );
    });
  });

  describe('findPending', () => {
    it('should find pending and snoozed reminders that are due', async () => {
      const mockReminders = [
        { _id: 'rem-1', status: 'pending', scheduledFor: new Date() },
        { _id: 'rem-2', status: 'snoozed', scheduledFor: new Date() },
      ];

      mockReminderModel.find.mockResolvedValue(mockReminders);

      const result = await service.findPending();

      expect(result).toEqual(mockReminders);
      expect(mockReminderModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $in: ['pending', 'snoozed'] },
        }),
      );
    });
  });

  describe('snoozeReminder', () => {
    it('should throw NotFoundException when reminder not found', async () => {
      mockReminderModel.findById.mockResolvedValue(null);

      await expect(service.snoozeReminder('rem-123', 4)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should snooze a reminder successfully', async () => {
      const mockReminder = {
        _id: 'rem-123',
        userId: 'test-user',
        status: 'pending',
        snoozeUntil: null,
        snoozeCount: 0,
        save: jest.fn().mockResolvedValue(undefined),
      };

      const mockPrefs = {
        snoozedReminders: [],
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);
      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);

      const result = await service.snoozeReminder('rem-123', 4);

      expect(result.status).toBe('snoozed');
      expect(result.snoozeUntil).toBeDefined();
      expect(result.snoozeCount).toBe(1);
      expect(mockReminder.save).toHaveBeenCalled();
      expect(mockPrefs.save).toHaveBeenCalled();
      expect(mockPrefs.snoozedReminders).toHaveLength(1);
      expect(mockPrefs.snoozedReminders[0].reminderId).toBe('rem-123');
      expect(mockPrefs.snoozedReminders[0].snoozeDurationHours).toBe(4);
    });
  });

  describe('dismissReminder', () => {
    it('should throw NotFoundException when reminder not found', async () => {
      mockReminderModel.findById.mockResolvedValue(null);

      await expect(service.dismissReminder('rem-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should dismiss a reminder with reason', async () => {
      const mockReminder = {
        _id: 'rem-123',
        status: 'pending',
        dismissedAt: undefined,
        dismissReason: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);

      const result = await service.dismissReminder('rem-123', 'not_applicable');

      expect(result.status).toBe('dismissed');
      expect(result.dismissedAt).toBeDefined();
      expect(result.dismissReason).toBe('not_applicable');
      expect(mockReminder.save).toHaveBeenCalled();
    });

    it('should dismiss a reminder without reason', async () => {
      const mockReminder = {
        _id: 'rem-123',
        status: 'pending',
        dismissedAt: undefined,
        dismissReason: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);

      const result = await service.dismissReminder('rem-123');

      expect(result.status).toBe('dismissed');
      expect(result.dismissReason).toBeUndefined();
    });
  });

  describe('undoDismiss', () => {
    it('should throw NotFoundException when reminder not found', async () => {
      mockReminderModel.findById.mockResolvedValue(null);

      await expect(service.undoDismiss('rem-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should undo dismiss and reset status to pending', async () => {
      const mockReminder = {
        _id: 'rem-123',
        status: 'dismissed',
        dismissedAt: new Date(),
        dismissReason: 'not_applicable',
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);

      const result = await service.undoDismiss('rem-123');

      expect(result.status).toBe('pending');
      expect(result.dismissedAt).toBeUndefined();
      expect(result.dismissReason).toBeUndefined();
      expect(mockReminder.save).toHaveBeenCalled();
    });
  });

  describe('deleteReminder', () => {
    it('should delete a reminder', async () => {
      mockReminderModel.findByIdAndDelete.mockResolvedValue(undefined);

      await service.deleteReminder('rem-123');

      expect(mockReminderModel.findByIdAndDelete).toHaveBeenCalledWith(
        'rem-123',
      );
    });
  });

  describe('getReminders', () => {
    it('should return paginated reminders with default filters', async () => {
      const mockReminders = [
        { _id: 'rem-1', title: 'Reminder 1' },
        { _id: 'rem-2', title: 'Reminder 2' },
      ];

      mockReminderModel.find.mockReturnThis();
      mockReminderModel.sort.mockReturnThis();
      mockReminderModel.skip.mockReturnThis();
      mockReminderModel.limit.mockReturnThis();
      mockReminderModel.exec.mockResolvedValue(mockReminders);
      mockReminderModel.countDocuments.mockResolvedValue(2);

      const result = await service.getReminders('test-user');

      expect(result.reminders).toEqual(mockReminders);
      expect(result.total).toBe(2);
      expect(mockReminderModel.find).toHaveBeenCalledWith({
        userId: 'test-user',
      });
    });

    it('should apply status, type, and taskId filters', async () => {
      mockReminderModel.find.mockReturnThis();
      mockReminderModel.sort.mockReturnThis();
      mockReminderModel.skip.mockReturnThis();
      mockReminderModel.limit.mockReturnThis();
      mockReminderModel.exec.mockResolvedValue([]);
      mockReminderModel.countDocuments.mockResolvedValue(0);

      await service.getReminders('test-user', {
        status: 'pending',
        type: 'pr_review',
        taskId: 'task-123',
        page: 2,
        limit: 10,
      });

      expect(mockReminderModel.find).toHaveBeenCalledWith({
        userId: 'test-user',
        status: 'pending',
        type: 'pr_review',
        taskId: 'task-123',
      });
    });
  });

  describe('getReminderSummary', () => {
    it('should return summary with counts and overdue items', async () => {
      const pastDate = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago

      mockReminderModel.countDocuments
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(2); // snoozed

      mockReminderModel.find.mockReturnThis();
      mockReminderModel.limit.mockReturnThis();
      mockReminderModel.exec.mockResolvedValue([
        {
          taskId: 'task-123',
          title: 'Fix the bug',
          type: 'stuck_clarification',
          scheduledFor: pastDate,
        },
      ]);

      const result = await service.getReminderSummary('test-user');

      expect(result.pending).toBe(5);
      expect(result.snoozed).toBe(2);
      expect(result.overdue).toHaveLength(1);
      expect(result.overdue[0].taskId).toBe('task-123');
      expect(result.overdue[0].overdueSince).toBe('3h');
      expect(result.overdue[0].link).toBe('/tasks/task-123');
    });

    it('should format overdue time as days when >= 24 hours', async () => {
      const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

      mockReminderModel.countDocuments
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      mockReminderModel.find.mockReturnThis();
      mockReminderModel.limit.mockReturnThis();
      mockReminderModel.exec.mockResolvedValue([
        {
          taskId: 'task-123',
          title: 'Old reminder',
          type: 'pr_overdue',
          scheduledFor: pastDate,
        },
      ]);

      const result = await service.getReminderSummary('test-user');

      expect(result.overdue[0].overdueSince).toBe('2d');
    });
  });

  describe('getOrCreatePreferences', () => {
    it('should return existing preferences', async () => {
      const existingPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: true, slack: true },
      };

      mockReminderPreferenceModel.findOne.mockResolvedValue(existingPrefs);

      const result = await service.getOrCreatePreferences('test-user');

      expect(result).toEqual(existingPrefs);
      expect(mockReminderPreferenceModel.create).not.toHaveBeenCalled();
    });

    it('should create default preferences when none exist', async () => {
      const createdPrefs = {
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

      mockReminderPreferenceModel.findOne.mockResolvedValue(null);
      mockReminderPreferenceModel.create.mockResolvedValue(createdPrefs);

      const result = await service.getOrCreatePreferences('test-user');

      expect(result).toEqual(createdPrefs);
      expect(mockReminderPreferenceModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          channels: { inApp: true, email: true, slack: true },
        }),
      );
    });
  });

  describe('updatePreferences', () => {
    it('should update existing preferences', async () => {
      const existingPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: true, slack: true },
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockReminderPreferenceModel.findOne.mockResolvedValue(existingPrefs);

      const updates = { channels: { inApp: true, email: false, slack: true } };
      const result = await service.updatePreferences('test-user', updates);

      expect(result.channels).toEqual({
        inApp: true,
        email: false,
        slack: true,
      });
      expect(existingPrefs.save).toHaveBeenCalled();
    });
  });

  describe('sendReminder', () => {
    it('should skip when reminder not found', async () => {
      mockReminderModel.findById.mockResolvedValue(null);

      await service.sendReminder('rem-nonexistent');

      expect(mockNotificationsService.sendNotification).not.toHaveBeenCalled();
    });

    it('should mark completed when task not found (invalid reminder)', async () => {
      const mockReminder = {
        _id: 'rem-123',
        userId: 'test-user',
        taskId: 'task-deleted',
        type: 'pr_review',
        status: 'pending',
        dismissedAt: undefined,
        snoozeUntil: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);
      mockTaskModel.findById.mockResolvedValue(null);

      await service.sendReminder('rem-123');

      expect(mockReminder.status).toBe('completed');
      expect(mockReminder.save).toHaveBeenCalled();
      expect(mockNotificationsService.sendNotification).not.toHaveBeenCalled();
    });

    it('should send notification when reminder is valid', async () => {
      const mockReminder = {
        _id: 'rem-123',
        userId: 'test-user',
        taskId: 'task-123',
        type: 'task_failed',
        title: 'Task failed',
        description: 'Something went wrong',
        status: 'pending',
        payload: { errorMessage: 'crash' },
        dismissedAt: undefined,
        snoozeUntil: undefined,
        recurrenceCount: 0,
        maxRecurrences: 3,
        failureCount: 0,
        sentVia: [],
        save: jest.fn().mockResolvedValue(undefined),
      };

      const mockTask = {
        _id: 'task-123',
        status: TaskStatus.FAILED,
        updatedAt: new Date(),
      };

      const mockPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: true, slack: false },
        reminders: {
          stuckClarification: true,
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        quietHours: { enabled: false },
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockNotificationsService.sendNotification.mockResolvedValue(undefined);

      await service.sendReminder('rem-123');

      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        'test-user',
        'reminder_task_failed',
        expect.objectContaining({
          taskId: 'task-123',
          reminderId: 'rem-123',
          reminderTitle: 'Task failed',
        }),
      );
      expect(mockReminder.recurrenceCount).toBe(1);
      expect(mockReminder.save).toHaveBeenCalled();
    });

    it('should mark completed when max recurrences reached', async () => {
      const mockReminder = {
        _id: 'rem-123',
        userId: 'test-user',
        taskId: 'task-123',
        type: 'custom',
        title: 'Custom reminder',
        description: undefined,
        status: 'pending',
        payload: {},
        dismissedAt: undefined,
        snoozeUntil: undefined,
        recurrenceCount: 0,
        maxRecurrences: 1,
        failureCount: 0,
        sentVia: [],
        sentAt: undefined,
        nextRecurrenceAt: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      };

      const mockTask = { _id: 'task-123', status: 'received' };

      const mockPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: false, slack: false },
        reminders: {
          stuckClarification: true,
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        quietHours: { enabled: false },
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockNotificationsService.sendNotification.mockResolvedValue(undefined);

      await service.sendReminder('rem-123');

      expect(mockReminder.status).toBe('completed');
      expect(mockReminder.recurrenceCount).toBe(1);
    });

    it('should skip when reminder type is disabled in preferences', async () => {
      const mockReminder = {
        _id: 'rem-123',
        userId: 'test-user',
        taskId: 'task-123',
        type: 'pr_review',
        title: 'PR review reminder',
        status: 'pending',
        payload: {},
        dismissedAt: undefined,
        snoozeUntil: undefined,
        recurrenceCount: 0,
        failureCount: 0,
        save: jest.fn().mockResolvedValue(undefined),
      };

      const mockTask = {
        _id: 'task-123',
        status: TaskStatus.PR_OPEN,
        githubPrStatus: 'open',
        updatedAt: new Date(),
      };

      const mockPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: true, slack: false },
        reminders: {
          stuckClarification: true,
          prReviewReady: false, // disabled
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        quietHours: { enabled: false },
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);

      await service.sendReminder('rem-123');

      expect(mockNotificationsService.sendNotification).not.toHaveBeenCalled();
      expect(mockReminder.status).toBe('completed');
    });

    it('should increment failureCount on send error and mark failed after 3', async () => {
      const mockReminder = {
        _id: 'rem-123',
        userId: 'test-user',
        taskId: 'task-123',
        type: 'task_failed',
        title: 'Task failed',
        status: 'pending',
        payload: {},
        dismissedAt: undefined,
        snoozeUntil: undefined,
        recurrenceCount: 0,
        failureCount: 2,
        sentVia: [],
        save: jest.fn().mockResolvedValue(undefined),
      };

      const mockTask = {
        _id: 'task-123',
        status: TaskStatus.FAILED,
        updatedAt: new Date(),
      };

      const mockPrefs = {
        userId: 'test-user',
        channels: { inApp: true, email: true, slack: false },
        reminders: {
          stuckClarification: true,
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        quietHours: { enabled: false },
      };

      mockReminderModel.findById.mockResolvedValue(mockReminder);
      mockTaskModel.findById.mockResolvedValue(mockTask);
      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockNotificationsService.sendNotification.mockRejectedValue(
        new Error('Send failed'),
      );

      await service.sendReminder('rem-123');

      expect(mockReminder.failureCount).toBe(3);
      expect(mockReminder.status).toBe('failed');
      expect(mockReminder.save).toHaveBeenCalled();
    });
  });

  describe('onTaskStatusChanged', () => {
    it('should create stuck_clarification reminder when task needs clarification', async () => {
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
        thresholds: {
          clarificationDelayHours: 24,
          prOpenDaysThreshold: 3,
          prReviewReminderIntervalHours: 48,
        },
      };

      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockReminderModel.create.mockResolvedValue({ _id: 'rem-new' });

      await service.onTaskStatusChanged({
        task: {
          _id: 'task-123',
          createdBy: 'test-user',
          llmSummary: 'Fix payment processing',
          description: 'Fix the payment bug',
          clarificationQuestions: ['What payment method?'],
        } as any,
        newStatus: TaskStatus.NEEDS_CLARIFICATION,
      });

      expect(mockReminderModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user',
          type: 'stuck_clarification',
          maxRecurrences: 7,
        }),
      );
    });

    it('should create pr_review reminder when PR opens', async () => {
      const mockPrefs = {
        userId: 'test-user',
        reminders: {
          stuckClarification: true,
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        thresholds: {
          clarificationDelayHours: 24,
          prOpenDaysThreshold: 3,
          prReviewReminderIntervalHours: 48,
        },
      };

      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockReminderModel.create.mockResolvedValue({ _id: 'rem-new' });

      await service.onTaskStatusChanged({
        task: {
          _id: 'task-123',
          createdBy: 'test-user',
          llmSummary: 'Fix payment',
          githubPrNumber: 42,
          githubPrUrl: 'https://github.com/org/repo/pull/42',
        } as any,
        newStatus: TaskStatus.PR_OPEN,
      });

      expect(mockReminderModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'pr_review',
          maxRecurrences: 5,
        }),
      );
    });

    it('should create task_failed reminder when task fails', async () => {
      const mockPrefs = {
        userId: 'test-user',
        reminders: {
          stuckClarification: true,
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        thresholds: {
          clarificationDelayHours: 24,
          prOpenDaysThreshold: 3,
          prReviewReminderIntervalHours: 48,
        },
      };

      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);
      mockReminderModel.create.mockResolvedValue({ _id: 'rem-new' });

      await service.onTaskStatusChanged({
        task: {
          _id: 'task-123',
          createdBy: 'test-user',
          llmSummary: 'Fix payment',
          description: 'Fix the payment bug',
          errorMessage: 'LLM API timeout',
        } as any,
        newStatus: TaskStatus.FAILED,
      });

      expect(mockReminderModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task_failed',
          maxRecurrences: 3,
        }),
      );
    });

    it('should not create reminder when preference is disabled', async () => {
      const mockPrefs = {
        userId: 'test-user',
        reminders: {
          stuckClarification: false, // disabled
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        thresholds: {
          clarificationDelayHours: 24,
          prOpenDaysThreshold: 3,
          prReviewReminderIntervalHours: 48,
        },
      };

      mockReminderPreferenceModel.findOne.mockResolvedValue(mockPrefs);

      await service.onTaskStatusChanged({
        task: {
          _id: 'task-123',
          createdBy: 'test-user',
          llmSummary: 'Fix payment',
          description: 'Fix the payment bug',
        } as any,
        newStatus: TaskStatus.NEEDS_CLARIFICATION,
      });

      expect(mockReminderModel.create).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      mockReminderPreferenceModel.findOne.mockRejectedValue(
        new Error('DB error'),
      );

      // Should not throw
      await service.onTaskStatusChanged({
        task: {
          _id: 'task-123',
          createdBy: 'test-user',
          description: 'Fix the bug',
        } as any,
        newStatus: TaskStatus.FAILED,
      });

      expect(mockReminderModel.create).not.toHaveBeenCalled();
    });
  });
});
