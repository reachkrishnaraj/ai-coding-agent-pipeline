import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthService, GitHubProfile } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;

  const mockUsersService = {
    findOrCreate: jest.fn(),
    findById: jest.fn(),
    findByGithubId: jest.fn(),
  };

  const mockUserDocument = {
    _id: { toString: () => 'user-123' },
    githubId: '456',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://avatar.url/test',
    role: 'developer',
    status: 'active',
  };

  const mockProfile: GitHubProfile = {
    id: '456',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://avatar.url/test',
    accessToken: 'gho_test_token_123',
    hasRepoAccess: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should validate and return a session user for an active user', async () => {
      mockUsersService.findOrCreate.mockResolvedValue(mockUserDocument);

      const result = await service.validateUser(mockProfile);

      expect(result).toEqual({
        id: 'user-123',
        githubId: '456',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url/test',
        role: 'developer',
        status: 'active',
        accessToken: 'gho_test_token_123',
      });
      expect(mockUsersService.findOrCreate).toHaveBeenCalledWith({
        githubId: '456',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url/test',
        hasRepoAccess: true,
      });
    });

    it('should throw ForbiddenException for inactive user', async () => {
      mockUsersService.findOrCreate.mockResolvedValue({
        ...mockUserDocument,
        status: 'inactive',
      });

      await expect(service.validateUser(mockProfile)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.validateUser(mockProfile)).rejects.toThrow(
        'Your account has been deactivated. Contact an admin.',
      );
    });

    it('should allow pending users to pass validation', async () => {
      mockUsersService.findOrCreate.mockResolvedValue({
        ...mockUserDocument,
        status: 'pending',
      });

      const result = await service.validateUser(mockProfile);

      expect(result.status).toBe('pending');
    });

    it('should include the access token from the profile', async () => {
      mockUsersService.findOrCreate.mockResolvedValue(mockUserDocument);

      const customProfile = { ...mockProfile, accessToken: 'custom_token_xyz' };
      const result = await service.validateUser(customProfile);

      expect(result.accessToken).toBe('custom_token_xyz');
    });
  });

  describe('getUserById', () => {
    it('should return a session user when found', async () => {
      mockUsersService.findById.mockResolvedValue(mockUserDocument);

      const result = await service.getUserById('user-123');

      expect(result).toEqual({
        id: 'user-123',
        githubId: '456',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url/test',
        role: 'developer',
        status: 'active',
        accessToken: '',
      });
      expect(mockUsersService.findById).toHaveBeenCalledWith('user-123');
    });

    it('should return null when user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      const result = await service.getUserById('nonexistent');

      expect(result).toBeNull();
      expect(mockUsersService.findById).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('getUserByGithubId', () => {
    it('should return a session user when found', async () => {
      mockUsersService.findByGithubId.mockResolvedValue(mockUserDocument);

      const result = await service.getUserByGithubId('456');

      expect(result).toEqual({
        id: 'user-123',
        githubId: '456',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://avatar.url/test',
        role: 'developer',
        status: 'active',
        accessToken: '',
      });
      expect(mockUsersService.findByGithubId).toHaveBeenCalledWith('456');
    });

    it('should return null when user not found', async () => {
      mockUsersService.findByGithubId.mockResolvedValue(null);

      const result = await service.getUserByGithubId('nonexistent');

      expect(result).toBeNull();
      expect(mockUsersService.findByGithubId).toHaveBeenCalledWith(
        'nonexistent',
      );
    });
  });
});
