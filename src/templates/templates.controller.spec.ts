import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: TemplatesService;

  const mockTemplatesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    apply: jest.fn(),
    favorite: jest.fn(),
    unfavorite: jest.fn(),
  };

  const mockReq = {
    user: { username: 'test-user', role: 'admin' },
  } as any;

  const mockNonAdminReq = {
    user: { username: 'regular-user', role: 'user' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: TemplatesService,
          useValue: mockTemplatesService,
        },
      ],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get<TemplatesService>(TemplatesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated templates', async () => {
      const query = { page: 1, limit: 20 };
      const mockResult = {
        templates: [
          { id: '1', name: 'Bug Fix', templateType: 'builtin' },
          { id: '2', name: 'Feature Request', templateType: 'custom' },
        ],
        total: 2,
        page: 1,
        limit: 20,
      };

      mockTemplatesService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(query as any, mockReq);

      expect(result).toEqual(mockResult);
      expect(service.findAll).toHaveBeenCalledWith(query, 'test-user');
    });

    it('should pass query filters to service', async () => {
      const query = { type: 'builtin', repo: 'mothership/finance-service', search: 'bug' };
      mockTemplatesService.findAll.mockResolvedValue({ templates: [], total: 0, page: 1, limit: 20 });

      await controller.findAll(query as any, mockReq);

      expect(service.findAll).toHaveBeenCalledWith(query, 'test-user');
    });
  });

  describe('findOne', () => {
    it('should return a template by id', async () => {
      const mockTemplate = {
        id: '123',
        name: 'Bug Fix',
        description: 'Template for bug fixes',
        templateType: 'builtin',
      };

      mockTemplatesService.findOne.mockResolvedValue(mockTemplate);

      const result = await controller.findOne('123', mockReq);

      expect(result).toEqual(mockTemplate);
      expect(service.findOne).toHaveBeenCalledWith('123', 'test-user');
    });
  });

  describe('create', () => {
    it('should create a template', async () => {
      const createDto = {
        name: 'My Template',
        description: 'A custom template',
        descriptionTemplate: 'Fix {{issue}} in {{file}}',
        variables: {
          issue: { label: 'Issue', description: 'The issue', example: 'bug', required: true },
          file: { label: 'File', description: 'The file', example: 'app.ts', required: true },
        },
      };

      const mockResult = {
        id: '456',
        ...createDto,
        templateType: 'custom',
        ownerId: 'test-user',
        createdBy: 'test-user',
        visibility: 'private',
      };

      mockTemplatesService.create.mockResolvedValue(mockResult);

      const result = await controller.create(createDto as any, mockReq);

      expect(result).toEqual(mockResult);
      expect(service.create).toHaveBeenCalledWith(createDto, 'test-user');
    });
  });

  describe('update', () => {
    it('should update a template as admin', async () => {
      const updateDto = { name: 'Updated Template' };
      const mockResult = {
        id: '123',
        name: 'Updated Template',
        templateType: 'builtin',
      };

      mockTemplatesService.update.mockResolvedValue(mockResult);

      const result = await controller.update('123', updateDto as any, mockReq);

      expect(result).toEqual(mockResult);
      expect(service.update).toHaveBeenCalledWith('123', updateDto, 'test-user', true);
    });

    it('should update a template as non-admin', async () => {
      const updateDto = { description: 'Updated description' };
      const mockResult = { id: '123', description: 'Updated description' };

      mockTemplatesService.update.mockResolvedValue(mockResult);

      const result = await controller.update('123', updateDto as any, mockNonAdminReq);

      expect(result).toEqual(mockResult);
      expect(service.update).toHaveBeenCalledWith('123', updateDto, 'regular-user', false);
    });
  });

  describe('remove', () => {
    it('should remove a template', async () => {
      mockTemplatesService.remove.mockResolvedValue(undefined);

      await controller.remove('123', mockReq);

      expect(service.remove).toHaveBeenCalledWith('123', 'test-user', true);
    });

    it('should pass isAdmin=false for non-admin users', async () => {
      mockTemplatesService.remove.mockResolvedValue(undefined);

      await controller.remove('123', mockNonAdminReq);

      expect(service.remove).toHaveBeenCalledWith('123', 'regular-user', false);
    });
  });

  describe('apply', () => {
    it('should apply a template with variables', async () => {
      const applyDto = {
        variables: { issue: 'login bug', file: 'auth.ts' },
      };

      const mockResult = {
        templateId: '123',
        description: 'Fix login bug in auth.ts',
        repo: 'mothership/finance-service',
        taskType: 'bug_fix',
      };

      mockTemplatesService.apply.mockResolvedValue(mockResult);

      const result = await controller.apply('123', applyDto as any);

      expect(result).toEqual(mockResult);
      expect(service.apply).toHaveBeenCalledWith('123', applyDto);
    });
  });

  describe('favorite', () => {
    it('should favorite a template', async () => {
      const mockResult = { favorited: true, favoriteCount: 5 };

      mockTemplatesService.favorite.mockResolvedValue(mockResult);

      const result = await controller.favorite('123', mockReq);

      expect(result).toEqual(mockResult);
      expect(service.favorite).toHaveBeenCalledWith('123', 'test-user');
    });
  });

  describe('unfavorite', () => {
    it('should unfavorite a template', async () => {
      const mockResult = { favorited: false, favoriteCount: 4 };

      mockTemplatesService.unfavorite.mockResolvedValue(mockResult);

      const result = await controller.unfavorite('123', mockReq);

      expect(result).toEqual(mockResult);
      expect(service.unfavorite).toHaveBeenCalledWith('123', 'test-user');
    });
  });
});
