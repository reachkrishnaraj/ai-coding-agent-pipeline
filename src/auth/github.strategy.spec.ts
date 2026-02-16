import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GitHubStrategy } from './github.strategy';
import { AuthService } from './auth.service';

// Mock Octokit
const mockListForAuthenticatedUser = jest.fn();
const mockCheckMembershipForUser = jest.fn();
const mockGetCollaboratorPermissionLevel = jest.fn();
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => ({
      rest: {
        orgs: {
          listForAuthenticatedUser: mockListForAuthenticatedUser,
          checkMembershipForUser: mockCheckMembershipForUser,
        },
        repos: {
          getCollaboratorPermissionLevel: mockGetCollaboratorPermissionLevel,
        },
      },
    })),
  };
});

describe('GitHubStrategy', () => {
  let strategy: GitHubStrategy;
  let authService: AuthService;

  const mockSessionUser = {
    id: 'mongo-id-123',
    githubId: '123',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.jpg',
    role: 'developer',
    status: 'active',
    accessToken: 'test-token',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
                GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
                GITHUB_OAUTH_CALLBACK_URL:
                  'http://localhost:3000/api/auth/github/callback',
                GITHUB_REQUIRED_ORG: 'mothership',
                ALLOWED_REPOS: '',
              };
              return config[key] ?? null;
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn().mockResolvedValue(mockSessionUser),
          },
        },
      ],
    }).compile();

    strategy = module.get<GitHubStrategy>(GitHubStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should reject users not in mothership org', async () => {
    const mockProfile = {
      id: '123',
      username: 'testuser',
      displayName: 'Test User',
      emails: [{ value: 'test@example.com' }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
    };

    // Mock Octokit to return non-mothership orgs
    mockListForAuthenticatedUser.mockResolvedValue({
      data: [{ login: 'other-org' }],
    });

    await expect(
      strategy.validate('test-token', 'refresh-token', mockProfile),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should accept users in mothership org', async () => {
    const mockProfile = {
      id: '123',
      username: 'testuser',
      displayName: 'Test User',
      emails: [{ value: 'test@example.com' }],
      photos: [{ value: 'https://example.com/avatar.jpg' }],
    };

    // Mock Octokit to return mothership org
    mockListForAuthenticatedUser.mockResolvedValue({
      data: [{ login: 'mothership' }, { login: 'other-org' }],
    });

    const result = await strategy.validate(
      'test-token',
      'refresh-token',
      mockProfile,
    );

    expect(result).toEqual(mockSessionUser);
    expect(authService.validateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '123',
        username: 'testuser',
        accessToken: 'test-token',
      }),
    );
  });
});
