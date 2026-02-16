import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TaskTemplate } from '../common/schemas/template.schema';

describe('TemplatesService', () => {
  let service: TemplatesService;

  const createMockDocument = (data: any) => ({
    ...data,
    _id: data.id || data._id || '123',
    save: jest.fn().mockResolvedValue({ ...data, _id: data.id || data._id || '123' }),
    toJSON: () => ({ ...data, id: data.id || data._id || '123' }),
  });

  const mockTemplateModel = {
    find: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    findByIdAndUpdate: jest.fn().mockReturnThis(),
    findByIdAndDelete: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  // Mock constructor for creating new documents
  const MockTemplateModelConstructor: any = function (data: any) {
    return createMockDocument(data);
  };
  Object.assign(MockTemplateModelConstructor, mockTemplateModel);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        {
          provide: getModelToken(TaskTemplate.name),
          useValue: MockTemplateModelConstructor,
        },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a template with default values', async () => {
      const createDto = {
        name: 'Bug Fix Template',
        description: 'Template for fixing bugs',
        descriptionTemplate: 'Fix {{issue}} in {{file}}',
        variables: {
          issue: { label: 'Issue', description: 'The issue', example: 'bug', required: true },
          file: { label: 'File', description: 'The file', example: 'app.ts', required: true },
        },
      };

      const result = await service.create(createDto as any, 'test-user');

      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
    });

    it('should set ownerId and createdBy to the userId', async () => {
      const createDto = {
        name: 'My Template',
        description: 'Custom template',
        descriptionTemplate: 'Do {{task}}',
        variables: {
          task: { label: 'Task', description: 'The task', example: 'something', required: true },
        },
      };

      const result = await service.create(createDto as any, 'user123');

      // The mock constructor captures the data passed to it
      expect(result.ownerId).toBe('user123');
      expect(result.createdBy).toBe('user123');
    });

    it('should use provided templateType and visibility', async () => {
      const createDto = {
        name: 'Global Template',
        description: 'A global template',
        descriptionTemplate: 'Do {{task}}',
        templateType: 'global',
        visibility: 'public',
        variables: {
          task: { label: 'Task', description: 'The task', example: 'something', required: true },
        },
      };

      const result = await service.create(createDto as any, 'admin-user');

      expect(result.templateType).toBe('global');
      expect(result.visibility).toBe('public');
    });
  });

  describe('findAll', () => {
    it('should return paginated templates', async () => {
      const mockTemplates = [
        createMockDocument({ id: '1', name: 'Template 1', templateType: 'builtin' }),
        createMockDocument({ id: '2', name: 'Template 2', templateType: 'custom' }),
      ];

      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplates);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(2);

      const result = await service.findAll({}, 'test-user');

      expect(result.templates).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by type', async () => {
      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce([]);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(0);

      await service.findAll({ type: 'builtin' }, 'test-user');

      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ templateType: 'builtin' }),
      );
    });

    it('should filter by repo', async () => {
      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce([]);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(0);

      await service.findAll({ repo: 'mothership/finance-service' }, 'test-user');

      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ defaultRepo: 'mothership/finance-service' }),
      );
    });

    it('should include visibility filter for logged-in users', async () => {
      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce([]);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(0);

      await service.findAll({}, 'test-user');

      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { templateType: 'builtin' },
            { templateType: 'global' },
            { ownerId: 'test-user' },
          ],
        }),
      );
    });

    it('should restrict to builtin/global for anonymous users', async () => {
      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce([]);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(0);

      await service.findAll({});

      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          templateType: { $in: ['builtin', 'global'] },
        }),
      );
    });

    it('should apply search filter on name and description', async () => {
      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce([]);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(0);

      await service.findAll({ search: 'bug' }, 'test-user');

      expect(mockTemplateModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $and: [
            {
              $or: [
                { name: { $regex: 'bug', $options: 'i' } },
                { description: { $regex: 'bug', $options: 'i' } },
              ],
            },
          ],
        }),
      );
    });

    it('should sort by name when specified', async () => {
      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce([]);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(0);

      await service.findAll({ sort: 'name' }, 'test-user');

      expect(mockTemplateModel.sort).toHaveBeenCalledWith({ name: 1 });
    });

    it('should sort by usageCount when specified', async () => {
      mockTemplateModel.find.mockReturnThis();
      mockTemplateModel.sort.mockReturnThis();
      mockTemplateModel.skip.mockReturnThis();
      mockTemplateModel.limit.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce([]);
      mockTemplateModel.countDocuments.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(0);

      await service.findAll({ sort: 'usageCount' }, 'test-user');

      expect(mockTemplateModel.sort).toHaveBeenCalledWith({ usageCount: -1 });
    });
  });

  describe('findOne', () => {
    it('should return a template by id', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Bug Fix',
        templateType: 'builtin',
        ownerId: 'test-user',
        visibility: 'private',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      const result = await service.findOne('123', 'test-user');

      expect(result).toHaveProperty('id', '123');
      expect(mockTemplateModel.findById).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundException when template not found', async () => {
      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for private custom template of another user', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Private Template',
        templateType: 'custom',
        ownerId: 'other-user',
        visibility: 'private',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      await expect(service.findOne('123', 'test-user')).rejects.toThrow(ForbiddenException);
    });

    it('should allow access to builtin templates regardless of user', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Builtin Template',
        templateType: 'builtin',
        ownerId: 'system',
        visibility: 'private',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      const result = await service.findOne('123', 'any-user');

      expect(result).toHaveProperty('id', '123');
    });

    it('should allow access to own private custom template', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'My Template',
        templateType: 'custom',
        ownerId: 'test-user',
        visibility: 'private',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      const result = await service.findOne('123', 'test-user');

      expect(result).toHaveProperty('id', '123');
    });
  });

  describe('update', () => {
    it('should update a template owned by the user', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Old Name',
        templateType: 'custom',
        ownerId: 'test-user',
        isReadOnly: false,
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      const result = await service.update('123', { name: 'New Name' } as any, 'test-user');

      expect(mockTemplate.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when template not found', async () => {
      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(null);

      await expect(
        service.update('999', { name: 'New Name' } as any, 'test-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for read-only template (non-admin)', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Read Only',
        templateType: 'builtin',
        ownerId: 'system',
        isReadOnly: true,
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      await expect(
        service.update('123', { name: 'New Name' } as any, 'test-user', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to update read-only template', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Read Only',
        templateType: 'builtin',
        ownerId: 'system',
        isReadOnly: true,
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      const result = await service.update('123', { name: 'Updated' } as any, 'admin-user', true);

      expect(mockTemplate.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException when non-owner non-admin tries to update', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Other User Template',
        templateType: 'custom',
        ownerId: 'other-user',
        isReadOnly: false,
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      await expect(
        service.update('123', { name: 'Hacked' } as any, 'test-user', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should remove a template owned by the user', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'My Template',
        templateType: 'custom',
        ownerId: 'test-user',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndDelete.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      await service.remove('123', 'test-user');

      expect(mockTemplateModel.findByIdAndDelete).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundException when template not found', async () => {
      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(null);

      await expect(service.remove('999', 'test-user')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when trying to delete builtin template', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Builtin Template',
        templateType: 'builtin',
        ownerId: 'system',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      await expect(service.remove('123', 'test-user', true)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner non-admin tries to delete', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Other User Template',
        templateType: 'custom',
        ownerId: 'other-user',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      await expect(service.remove('123', 'test-user', false)).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to delete non-builtin template of another user', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Other User Template',
        templateType: 'custom',
        ownerId: 'other-user',
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndDelete.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      await service.remove('123', 'admin-user', true);

      expect(mockTemplateModel.findByIdAndDelete).toHaveBeenCalledWith('123');
    });
  });

  describe('apply', () => {
    it('should apply template and replace variables', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'Bug Fix Template',
        descriptionTemplate: 'Fix {{issue}} in {{file}}',
        filesHintTemplate: ['src/{{file}}'],
        acceptanceCriteriaTemplate: ['{{issue}} should be resolved'],
        defaultRepo: 'mothership/finance-service',
        defaultTaskType: 'bug_fix',
        defaultPriority: 'high',
        variables: {
          issue: { label: 'Issue', description: 'The issue', example: 'bug', required: true },
          file: { label: 'File', description: 'The file', example: 'app.ts', required: true },
        },
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndUpdate.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      const result = await service.apply('123', {
        variables: { issue: 'login bug', file: 'auth.ts' },
      });

      expect(result.templateId).toBe('123');
      expect(result.description).toBe('Fix login bug in auth.ts');
      expect(result.filesHint).toEqual(['src/auth.ts']);
      expect(result.acceptanceCriteria).toEqual(['login bug should be resolved']);
      expect(result.repo).toBe('mothership/finance-service');
      expect(result.taskType).toBe('bug_fix');
      expect(result.priority).toBe('high');
    });

    it('should increment usage count', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        descriptionTemplate: 'Do {{task}}',
        variables: {
          task: { label: 'Task', description: 'The task', example: 'something', required: true },
        },
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndUpdate.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      await service.apply('123', { variables: { task: 'test' } });

      expect(mockTemplateModel.findByIdAndUpdate).toHaveBeenCalledWith('123', { $inc: { usageCount: 1 } });
    });

    it('should throw NotFoundException when template not found', async () => {
      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(null);

      await expect(
        service.apply('999', { variables: {} }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for missing required variables', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        descriptionTemplate: 'Fix {{issue}} in {{file}}',
        variables: {
          issue: { label: 'Issue', description: 'The issue', example: 'bug', required: true },
          file: { label: 'File', description: 'The file', example: 'app.ts', required: true },
        },
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(mockTemplate);

      await expect(
        service.apply('123', { variables: { issue: 'test bug' } }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle array values in variables', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        descriptionTemplate: 'Steps:\n{{steps}}',
        variables: {
          steps: { label: 'Steps', description: 'Steps', example: 'step1', required: true },
        },
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndUpdate.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      const result = await service.apply('123', {
        variables: { steps: ['Step 1', 'Step 2', 'Step 3'] },
      });

      expect(result.description).toBe('Steps:\nStep 1\nStep 2\nStep 3');
    });
  });

  describe('favorite', () => {
    it('should favorite a template and increment count', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'My Template',
        favoriteCount: 4,
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndUpdate.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      const result = await service.favorite('123', 'test-user');

      expect(result.favorited).toBe(true);
      expect(result.favoriteCount).toBe(5);
      expect(mockTemplateModel.findByIdAndUpdate).toHaveBeenCalledWith('123', { $inc: { favoriteCount: 1 } });
    });

    it('should throw NotFoundException when template not found', async () => {
      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(null);

      await expect(service.favorite('999', 'test-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unfavorite', () => {
    it('should unfavorite a template and decrement count', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'My Template',
        favoriteCount: 3,
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndUpdate.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      const result = await service.unfavorite('123', 'test-user');

      expect(result.favorited).toBe(false);
      expect(result.favoriteCount).toBe(2);
      expect(mockTemplateModel.findByIdAndUpdate).toHaveBeenCalledWith('123', { favoriteCount: 2 });
    });

    it('should not go below zero favorite count', async () => {
      const mockTemplate = createMockDocument({
        id: '123',
        name: 'My Template',
        favoriteCount: 0,
      });

      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);
      mockTemplateModel.findByIdAndUpdate.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValueOnce(mockTemplate);

      const result = await service.unfavorite('123', 'test-user');

      expect(result.favoriteCount).toBe(0);
      expect(mockTemplateModel.findByIdAndUpdate).toHaveBeenCalledWith('123', { favoriteCount: 0 });
    });

    it('should throw NotFoundException when template not found', async () => {
      mockTemplateModel.findById.mockReturnThis();
      mockTemplateModel.exec.mockResolvedValue(null);

      await expect(service.unfavorite('999', 'test-user')).rejects.toThrow(NotFoundException);
    });
  });
});
