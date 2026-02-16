import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    findAll: jest.fn(),
    findPending: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    approve: jest.fn(),
    deactivate: jest.fn(),
    makeAdmin: jest.fn(),
    makeDeveloper: jest.fn(),
  };

  const mockUser = {
    _id: 'user-123',
    githubId: '456',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://avatar.url/test',
    role: 'developer',
    status: 'active',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all users wrapped in users object', async () => {
      const mockUsers = [mockUser];
      mockUsersService.findAll.mockResolvedValue(mockUsers);

      const result = await controller.findAll();

      expect(result).toEqual({ users: mockUsers });
      expect(service.findAll).toHaveBeenCalledWith({
        status: undefined,
        role: undefined,
      });
    });

    it('should pass status filter to service', async () => {
      mockUsersService.findAll.mockResolvedValue([]);

      await controller.findAll('active');

      expect(service.findAll).toHaveBeenCalledWith({
        status: 'active',
        role: undefined,
      });
    });

    it('should pass role filter to service', async () => {
      mockUsersService.findAll.mockResolvedValue([]);

      await controller.findAll(undefined, 'admin');

      expect(service.findAll).toHaveBeenCalledWith({
        status: undefined,
        role: 'admin',
      });
    });

    it('should pass both status and role filters', async () => {
      mockUsersService.findAll.mockResolvedValue([]);

      await controller.findAll('pending', 'developer');

      expect(service.findAll).toHaveBeenCalledWith({
        status: 'pending',
        role: 'developer',
      });
    });
  });

  describe('findPending', () => {
    it('should return pending users', async () => {
      const pendingUsers = [{ ...mockUser, status: 'pending' }];
      mockUsersService.findPending.mockResolvedValue(pendingUsers);

      const result = await controller.findPending();

      expect(result).toEqual({ users: pendingUsers });
      expect(service.findPending).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);

      const result = await controller.findOne('user-123');

      expect(result).toEqual(mockUser);
      expect(service.findById).toHaveBeenCalledWith('user-123');
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updateDto = { role: 'admin' as const };
      const updatedUser = { ...mockUser, role: 'admin' };
      mockUsersService.update.mockResolvedValue(updatedUser);

      const result = await controller.update('user-123', updateDto);

      expect(result).toEqual(updatedUser);
      expect(service.update).toHaveBeenCalledWith('user-123', updateDto);
    });
  });

  describe('approve', () => {
    it('should approve a user', async () => {
      const approvedUser = { ...mockUser, status: 'active' };
      mockUsersService.approve.mockResolvedValue(approvedUser);

      const result = await controller.approve('user-123');

      expect(result).toEqual(approvedUser);
      expect(service.approve).toHaveBeenCalledWith('user-123');
    });
  });

  describe('deactivate', () => {
    it('should deactivate a user', async () => {
      const deactivatedUser = { ...mockUser, status: 'inactive' };
      mockUsersService.deactivate.mockResolvedValue(deactivatedUser);

      const result = await controller.deactivate('user-123');

      expect(result).toEqual(deactivatedUser);
      expect(service.deactivate).toHaveBeenCalledWith('user-123');
    });
  });

  describe('makeAdmin', () => {
    it('should make a user admin', async () => {
      const adminUser = { ...mockUser, role: 'admin' };
      mockUsersService.makeAdmin.mockResolvedValue(adminUser);

      const result = await controller.makeAdmin('user-123');

      expect(result).toEqual(adminUser);
      expect(service.makeAdmin).toHaveBeenCalledWith('user-123');
    });
  });

  describe('makeDeveloper', () => {
    it('should make a user developer', async () => {
      const devUser = { ...mockUser, role: 'developer' };
      mockUsersService.makeDeveloper.mockResolvedValue(devUser);

      const result = await controller.makeDeveloper('user-123');

      expect(result).toEqual(devUser);
      expect(service.makeDeveloper).toHaveBeenCalledWith('user-123');
    });
  });
});
