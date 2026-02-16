import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService, CreateUserInput } from './users.service';
import { User } from '../common/schemas/user.schema';

describe('UsersService', () => {
  let service: UsersService;

  const createMockUserDocument = (data: any) => ({
    ...data,
    _id: data._id || 'user-123',
    save: jest.fn().mockResolvedValue(data),
  });

  const mockUserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  // Constructor function for creating new user documents
  const MockUserModelConstructor: any = function (data: any) {
    return createMockUserDocument(data);
  };
  Object.assign(MockUserModelConstructor, mockUserModel);

  const mockConfigService = {
    get: jest.fn().mockReturnValue('admin-user,super-admin'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: MockUserModelConstructor,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreate', () => {
    const createUserInput: CreateUserInput = {
      githubId: '456',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      avatarUrl: 'https://avatar.url/test',
      hasRepoAccess: false,
    };

    it('should update and return existing user on login', async () => {
      const existingUser = createMockUserDocument({
        _id: 'user-123',
        githubId: '456',
        username: 'testuser',
        displayName: 'Old Name',
        email: 'old@example.com',
        avatarUrl: 'https://old.avatar',
        role: 'developer',
        status: 'active',
        lastLoginAt: new Date('2024-01-01'),
      });

      mockUserModel.findOne.mockResolvedValue(existingUser);

      const result = await service.findOrCreate(createUserInput);

      expect(result.displayName).toBe('Test User');
      expect(result.email).toBe('test@example.com');
      expect(result.avatarUrl).toBe('https://avatar.url/test');
      expect(existingUser.save).toHaveBeenCalled();
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ githubId: '456' });
    });

    it('should auto-activate pending user if they now have repo access', async () => {
      const pendingUser = createMockUserDocument({
        _id: 'user-123',
        githubId: '456',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url/test',
        role: 'developer',
        status: 'pending',
      });

      mockUserModel.findOne.mockResolvedValue(pendingUser);

      const result = await service.findOrCreate({
        ...createUserInput,
        hasRepoAccess: true,
      });

      expect(result.status).toBe('active');
      expect(pendingUser.save).toHaveBeenCalled();
    });

    it('should not auto-activate pending user without repo access', async () => {
      const pendingUser = createMockUserDocument({
        _id: 'user-123',
        githubId: '456',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url/test',
        role: 'developer',
        status: 'pending',
      });

      mockUserModel.findOne.mockResolvedValue(pendingUser);

      const result = await service.findOrCreate({
        ...createUserInput,
        hasRepoAccess: false,
      });

      expect(result.status).toBe('pending');
    });

    it('should create first user as admin with active status', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.countDocuments.mockResolvedValue(0);

      const result = await service.findOrCreate(createUserInput);

      expect(result.role).toBe('admin');
      expect(result.status).toBe('active');
      expect(result.save).toHaveBeenCalled();
    });

    it('should create admin username as admin with active status', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.countDocuments.mockResolvedValue(5);

      const result = await service.findOrCreate({
        ...createUserInput,
        username: 'admin-user',
      });

      expect(result.role).toBe('admin');
      expect(result.status).toBe('active');
    });

    it('should create regular user as developer with pending status', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.countDocuments.mockResolvedValue(5);

      const result = await service.findOrCreate({
        ...createUserInput,
        hasRepoAccess: false,
      });

      expect(result.role).toBe('developer');
      expect(result.status).toBe('pending');
    });

    it('should create user with active status if they have repo access', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.countDocuments.mockResolvedValue(5);

      const result = await service.findOrCreate({
        ...createUserInput,
        hasRepoAccess: true,
      });

      expect(result.role).toBe('developer');
      expect(result.status).toBe('active');
    });
  });

  describe('findByGithubId', () => {
    it('should return a user by GitHub ID', async () => {
      const mockUser = createMockUserDocument({ githubId: '456' });
      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await service.findByGithubId('456');

      expect(result).toEqual(mockUser);
      expect(mockUserModel.findOne).toHaveBeenCalledWith({ githubId: '456' });
    });

    it('should return null when user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      const result = await service.findByGithubId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should return a user by username', async () => {
      const mockUser = createMockUserDocument({ username: 'testuser' });
      mockUserModel.findOne.mockResolvedValue(mockUser);

      const result = await service.findByUsername('testuser');

      expect(result).toEqual(mockUser);
      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        username: 'testuser',
      });
    });

    it('should return null when user not found', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      const result = await service.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return a user by MongoDB ID', async () => {
      const mockUser = createMockUserDocument({ _id: 'user-123' });
      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.findById('user-123');

      expect(result).toEqual(mockUser);
      expect(mockUserModel.findById).toHaveBeenCalledWith('user-123');
    });

    it('should return null when user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      const result = await service.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all users with no filters', async () => {
      const mockUsers = [
        createMockUserDocument({ username: 'user1' }),
        createMockUserDocument({ username: 'user2' }),
      ];

      const sortMock = jest.fn().mockResolvedValue(mockUsers);
      mockUserModel.find.mockReturnValue({ sort: sortMock });

      const result = await service.findAll();

      expect(result).toEqual(mockUsers);
      expect(mockUserModel.find).toHaveBeenCalledWith({});
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should filter by status', async () => {
      const sortMock = jest.fn().mockResolvedValue([]);
      mockUserModel.find.mockReturnValue({ sort: sortMock });

      await service.findAll({ status: 'active' });

      expect(mockUserModel.find).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should filter by role', async () => {
      const sortMock = jest.fn().mockResolvedValue([]);
      mockUserModel.find.mockReturnValue({ sort: sortMock });

      await service.findAll({ role: 'admin' });

      expect(mockUserModel.find).toHaveBeenCalledWith({ role: 'admin' });
    });

    it('should filter by both status and role', async () => {
      const sortMock = jest.fn().mockResolvedValue([]);
      mockUserModel.find.mockReturnValue({ sort: sortMock });

      await service.findAll({ status: 'active', role: 'developer' });

      expect(mockUserModel.find).toHaveBeenCalledWith({
        status: 'active',
        role: 'developer',
      });
    });
  });

  describe('findPending', () => {
    it('should return pending users sorted by creation date', async () => {
      const mockUsers = [createMockUserDocument({ status: 'pending' })];

      const sortMock = jest.fn().mockResolvedValue(mockUsers);
      mockUserModel.find.mockReturnValue({ sort: sortMock });

      const result = await service.findPending();

      expect(result).toEqual(mockUsers);
      expect(mockUserModel.find).toHaveBeenCalledWith({ status: 'pending' });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('update', () => {
    it('should update user role', async () => {
      const mockUser = createMockUserDocument({
        _id: 'user-123',
        username: 'testuser',
        role: 'developer',
        status: 'active',
      });

      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.update('user-123', { role: 'admin' });

      expect(result.role).toBe('admin');
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should update user status', async () => {
      const mockUser = createMockUserDocument({
        _id: 'user-123',
        username: 'testuser',
        role: 'developer',
        status: 'pending',
      });

      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.update('user-123', { status: 'active' });

      expect(result.status).toBe('active');
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { role: 'admin' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve', () => {
    it('should set user status to active', async () => {
      const mockUser = createMockUserDocument({
        _id: 'user-123',
        username: 'testuser',
        role: 'developer',
        status: 'pending',
      });

      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.approve('user-123');

      expect(result.status).toBe('active');
    });
  });

  describe('deactivate', () => {
    it('should set user status to inactive', async () => {
      const mockUser = createMockUserDocument({
        _id: 'user-123',
        username: 'testuser',
        role: 'developer',
        status: 'active',
      });

      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.deactivate('user-123');

      expect(result.status).toBe('inactive');
    });
  });

  describe('makeAdmin', () => {
    it('should set user role to admin', async () => {
      const mockUser = createMockUserDocument({
        _id: 'user-123',
        username: 'testuser',
        role: 'developer',
        status: 'active',
      });

      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.makeAdmin('user-123');

      expect(result.role).toBe('admin');
    });
  });

  describe('makeDeveloper', () => {
    it('should set user role to developer', async () => {
      const mockUser = createMockUserDocument({
        _id: 'user-123',
        username: 'testuser',
        role: 'admin',
        status: 'active',
      });

      mockUserModel.findById.mockResolvedValue(mockUser);

      const result = await service.makeDeveloper('user-123');

      expect(result.role).toBe('developer');
    });
  });
});
