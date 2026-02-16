import { Test, TestingModule } from '@nestjs/testing';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

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

describe('JobsController', () => {
  let controller: JobsController;
  let jobsService: JobsService;

  const mockJobsService = {
    getJobs: jest.fn(),
    getJobById: jest.fn(),
    runJobNow: jest.fn(),
    getAgenda: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
    jobsService = module.get<JobsService>(JobsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listJobs', () => {
    it('should return list of jobs with default limit', async () => {
      const mockJobs = [
        {
          _id: '1',
          jobName: 'test-job',
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 1000,
        },
      ];

      mockJobsService.getJobs.mockResolvedValue(mockJobs);

      const result = await controller.listJobs();

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.jobs).toHaveLength(1);
      expect(mockJobsService.getJobs).toHaveBeenCalledWith(50, undefined);
    });

    it('should apply custom limit and status filter', async () => {
      mockJobsService.getJobs.mockResolvedValue([]);

      const result = await controller.listJobs('10', 'failed');

      expect(mockJobsService.getJobs).toHaveBeenCalledWith(10, 'failed');
      expect(result.success).toBe(true);
    });

    it('should transform job data correctly', async () => {
      const mockDate = new Date();
      const mockJobs = [
        {
          _id: '123',
          jobName: 'test-job',
          status: 'completed',
          startedAt: mockDate,
          completedAt: mockDate,
          durationMs: 1000,
          result: { tasksProcessed: 5 },
          error: null,
          retryCount: 0,
        },
      ];

      mockJobsService.getJobs.mockResolvedValue(mockJobs);

      const result = await controller.listJobs();

      expect(result.jobs[0]).toEqual({
        id: '123',
        jobName: 'test-job',
        status: 'completed',
        startedAt: mockDate,
        completedAt: mockDate,
        durationMs: 1000,
        result: { tasksProcessed: 5 },
        error: null,
        retryCount: 0,
      });
    });
  });

  describe('getJob', () => {
    it('should return job details when found', async () => {
      const mockJob = {
        _id: '123',
        jobName: 'test-job',
        jobId: 'job-123',
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 1000,
        result: { tasksProcessed: 5 },
        error: null,
        retryCount: 0,
        progress: 100,
        logs: [],
      };

      mockJobsService.getJobById.mockResolvedValue(mockJob);

      const result = await controller.getJob('123');

      expect(result.success).toBe(true);
      expect(result.job).toBeDefined();
      expect(result.job!.id).toBe('123');
      expect(mockJobsService.getJobById).toHaveBeenCalledWith('123');
    });

    it('should return error when job not found', async () => {
      mockJobsService.getJobById.mockResolvedValue(null);

      const result = await controller.getJob('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job not found');
    });
  });

  describe('runJob', () => {
    it('should trigger job successfully', async () => {
      const mockJob = {
        attrs: {
          _id: '123',
          name: 'test-job',
        },
      };

      mockJobsService.runJobNow.mockResolvedValue(mockJob);

      const result = await controller.runJob('test-job');

      expect(result.success).toBe(true);
      expect(result.message).toContain('test-job');
      expect(result.jobId).toBe('123');
      expect(mockJobsService.runJobNow).toHaveBeenCalledWith('test-job');
    });

    it('should handle job trigger failure', async () => {
      mockJobsService.runJobNow.mockRejectedValue(new Error('Job not found'));

      const result = await controller.runJob('invalid-job');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job not found');
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status information', async () => {
      const mockAgenda = {
        jobs: jest.fn().mockResolvedValue([
          {
            attrs: {
              name: 'test-job-1',
              lockedAt: new Date(),
              failedAt: null,
              lastFinishedAt: null,
            },
          },
          {
            attrs: {
              name: 'test-job-2',
              lockedAt: null,
              failedAt: new Date(),
              lastFinishedAt: null,
            },
          },
          {
            attrs: {
              name: 'session-cleanup',
              lockedAt: null,
              failedAt: null,
              lastFinishedAt: new Date(),
              nextRunAt: new Date(),
              lastRunAt: new Date(),
            },
          },
        ]),
      };

      mockJobsService.getAgenda.mockReturnValue(mockAgenda);

      const result = await controller.getQueueStatus();

      expect(result.success).toBe(true);
      expect(result.statusCounts).toBeDefined();
      expect(result.statusCounts.active).toBe(1);
      expect(result.statusCounts.failed).toBe(1);
      expect(result.statusCounts.completed).toBe(1);
      expect(result.statusCounts.total).toBe(3);
      expect(result.queues).toHaveLength(6);
    });
  });
});
