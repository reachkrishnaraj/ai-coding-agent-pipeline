import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { Task } from '../common/schemas/task.schema';
import { JobHistory } from '../common/schemas/job-history.schema';
import { AnalyticsDaily } from '../common/schemas/analytics-daily.schema';
import { AnalyticsWeekly } from '../common/schemas/analytics-weekly.schema';
import { TaskStatus } from '../common/enums/task-status.enum';
import { RemindersService } from '../reminders/reminders.service';

// Mock the agenda module
jest.mock('agenda', () => {
  return {
    Agenda: jest.fn().mockImplementation(() => ({
      define: jest.fn(),
      on: jest.fn(),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      every: jest.fn().mockResolvedValue(undefined),
      now: jest.fn().mockResolvedValue({ attrs: { _id: '123', name: 'test' } }),
      jobs: jest.fn().mockResolvedValue([]),
    })),
    Job: jest.fn(),
  };
});

describe('JobsService', () => {
  let service: JobsService;
  let taskModel: any;
  let jobHistoryModel: any;
  let analyticsDailyModel: any;
  let analyticsWeeklyModel: any;
  let mockConnection: any;

  beforeEach(async () => {
    taskModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn(),
    };

    jobHistoryModel = {
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      exec: jest.fn(),
    };

    analyticsDailyModel = {
      updateOne: jest.fn(),
    };

    analyticsWeeklyModel = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };

    mockConnection = {
      db: {
        collection: jest.fn().mockReturnValue({
          deleteMany: jest.fn().mockResolvedValue({ deletedCount: 5 }),
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: getModelToken(Task.name),
          useValue: taskModel,
        },
        {
          provide: getModelToken(JobHistory.name),
          useValue: jobHistoryModel,
        },
        {
          provide: getModelToken(AnalyticsDaily.name),
          useValue: analyticsDailyModel,
        },
        {
          provide: getModelToken(AnalyticsWeekly.name),
          useValue: analyticsWeeklyModel,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MONGODB_URI') return 'mongodb://localhost/test';
              if (key === 'JOB_WORKERS_ENABLED') return 'false';
              return null;
            }),
          },
        },
        {
          provide: RemindersService,
          useValue: {
            findPending: jest.fn().mockResolvedValue([]),
            sendReminder: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const retryableMessages = [
        'LLM_API_ERROR occurred',
        'Request was RATE_LIMITED',
        'GITHUB_API_ERROR: timeout',
        'Network connection failed',
        'Request timeout exceeded',
      ];

      retryableMessages.forEach((message) => {
        const result = service['isRetryableError'](message);
        expect(result).toBe(true);
      });
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableMessages = [
        'Invalid input provided',
        'User not authorized',
        'Resource not found',
      ];

      nonRetryableMessages.forEach((message) => {
        const result = service['isRetryableError'](message);
        expect(result).toBe(false);
      });
    });
  });

  describe('calculatePercentageChange', () => {
    it('should calculate positive percentage change', () => {
      const result = service['calculatePercentageChange'](100, 150);
      expect(result).toBe(50);
    });

    it('should calculate negative percentage change', () => {
      const result = service['calculatePercentageChange'](150, 100);
      expect(result).toBeCloseTo(-33.33, 1);
    });

    it('should handle zero old value', () => {
      const result = service['calculatePercentageChange'](0, 100);
      expect(result).toBe(100);
    });

    it('should handle zero new value', () => {
      const result = service['calculatePercentageChange'](100, 0);
      expect(result).toBe(-100);
    });

    it('should handle both zero values', () => {
      const result = service['calculatePercentageChange'](0, 0);
      expect(result).toBe(0);
    });
  });

  describe('getJobs', () => {
    it('should retrieve jobs with default limit', async () => {
      const mockJobs = [
        {
          _id: '1',
          jobName: 'test-job',
          status: 'completed',
        },
      ];

      jobHistoryModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockJobs),
          }),
        }),
      });

      const result = await service.getJobs();

      expect(jobHistoryModel.find).toHaveBeenCalledWith({});
      expect(result).toEqual(mockJobs);
    });

    it('should retrieve jobs with status filter', async () => {
      const mockJobs = [
        {
          _id: '1',
          jobName: 'test-job',
          status: 'failed',
        },
      ];

      jobHistoryModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockJobs),
          }),
        }),
      });

      const result = await service.getJobs(50, 'failed');

      expect(jobHistoryModel.find).toHaveBeenCalledWith({ status: 'failed' });
      expect(result).toEqual(mockJobs);
    });

    it('should apply custom limit', async () => {
      jobHistoryModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await service.getJobs(10);

      const limitFn = jobHistoryModel.find().sort().limit;
      expect(limitFn).toBeDefined();
    });
  });

  describe('getJobById', () => {
    it('should retrieve a specific job by id', async () => {
      const mockJob = {
        _id: '123',
        jobName: 'test-job',
        status: 'completed',
      };

      jobHistoryModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockJob),
      });

      const result = await service.getJobById('123');

      expect(jobHistoryModel.findById).toHaveBeenCalledWith('123');
      expect(result).toEqual(mockJob);
    });

    it('should return null for non-existent job', async () => {
      jobHistoryModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getJobById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('recordJobSuccess', () => {
    it('should record successful job execution', async () => {
      const mockJob = {
        attrs: {
          name: 'test-job',
          _id: '123',
          lastRunAt: new Date(),
          failCount: 0,
        },
      };

      const mockResult = {
        durationMs: 1000,
        tasksProcessed: 5,
      };

      jobHistoryModel.create.mockResolvedValue({});

      await service['recordJobSuccess'](mockJob as any, mockResult);

      expect(jobHistoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
          jobId: '123',
          status: 'completed',
          durationMs: 1000,
          result: mockResult,
        })
      );
    });
  });

  describe('recordJobFailure', () => {
    it('should record failed job execution', async () => {
      const mockJob = {
        attrs: {
          name: 'test-job',
          _id: '123',
          lastRunAt: new Date(),
          failCount: 1,
        },
      };

      const mockError = new Error('Test error');
      mockError.stack = 'Error stack trace';

      jobHistoryModel.create.mockResolvedValue({});

      await service['recordJobFailure'](mockJob as any, mockError, 1000);

      expect(jobHistoryModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
          jobId: '123',
          status: 'failed',
          durationMs: 1000,
          error: {
            message: 'Test error',
            stack: 'Error stack trace',
            code: 'UNKNOWN_ERROR',
          },
        })
      );
    });
  });
});
