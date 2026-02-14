import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GitHubStrategy } from './github.strategy';

// Mock Octokit
const mockListForAuthenticatedUser = jest.fn();
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => ({
      rest: {
        orgs: {
          listForAuthenticatedUser: mockListForAuthenticatedUser,
        },
      },
    })),
  };
});

describe('GitHubStrategy', () => {
  let strategy: GitHubStrategy;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                GITHUB_OAUTH_CLIENT_ID: 'test-client-id',
                GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
                GITHUB_OAUTH_CALLBACK_URL:
                  'http://localhost:3000/api/auth/github/callback',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<GitHubStrategy>(GitHubStrategy);
    configService = module.get<ConfigService>(ConfigService);
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

    expect(result).toEqual({
      id: '123',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
      accessToken: 'test-token',
    });
  });
});
