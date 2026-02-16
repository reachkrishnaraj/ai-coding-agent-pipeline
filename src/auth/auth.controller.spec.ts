import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import type { SessionUser } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockSessionUser: SessionUser = {
    id: 'user-123',
    githubId: '456',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://avatar.url/test',
    role: 'developer',
    status: 'active',
    accessToken: 'gho_test_token',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('githubLogin', () => {
    it('should initiate GitHub OAuth flow (guard handles redirect)', async () => {
      // This method is empty; the PassportAuthGuard handles the redirect.
      // We just verify it does not throw.
      const result = await controller.githubLogin();
      expect(result).toBeUndefined();
    });
  });

  describe('githubCallback', () => {
    it('should redirect active user to frontend URL', async () => {
      mockConfigService.get.mockReturnValue('https://app.example.com');

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn(),
      } as any;

      const mockReq = {
        user: { ...mockSessionUser, status: 'active' },
        login: jest.fn((user, cb) => cb(null)),
        session: {
          save: jest.fn((cb) => cb(null)),
        },
      } as any;

      await controller.githubCallback(mockReq, mockRes);

      expect(mockReq.login).toHaveBeenCalled();
      expect(mockReq.session.save).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith('https://app.example.com');
    });

    it('should redirect pending user to /pending page', async () => {
      mockConfigService.get.mockReturnValue('https://app.example.com');

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn(),
      } as any;

      const mockReq = {
        user: { ...mockSessionUser, status: 'pending' },
        login: jest.fn((user, cb) => cb(null)),
        session: {
          save: jest.fn((cb) => cb(null)),
        },
      } as any;

      await controller.githubCallback(mockReq, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        'https://app.example.com/pending',
      );
    });

    it('should use default frontend URL when FRONTEND_URL is not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn(),
      } as any;

      const mockReq = {
        user: { ...mockSessionUser, status: 'active' },
        login: jest.fn((user, cb) => cb(null)),
        session: {
          save: jest.fn((cb) => cb(null)),
        },
      } as any;

      await controller.githubCallback(mockReq, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('should return 500 if login fails', async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        redirect: jest.fn(),
      } as any;

      const mockReq = {
        user: mockSessionUser,
        login: jest.fn((user, cb) => cb(new Error('Login failed'))),
        session: {
          save: jest.fn((cb) => cb(null)),
        },
      } as any;

      await controller.githubCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Login failed' });
    });
  });

  describe('getMe', () => {
    it('should return authenticated user info', async () => {
      const mockReq = {
        isAuthenticated: jest.fn().mockReturnValue(true),
        user: mockSessionUser,
      } as any;

      const result = await controller.getMe(mockReq);

      expect(result).toEqual({
        authenticated: true,
        user: {
          id: 'user-123',
          githubId: '456',
          username: 'testuser',
          displayName: 'Test User',
          email: 'test@example.com',
          avatarUrl: 'https://avatar.url/test',
          role: 'developer',
          status: 'active',
        },
      });
    });

    it('should return unauthenticated when user is not logged in', async () => {
      const mockReq = {
        isAuthenticated: jest.fn().mockReturnValue(false),
      } as any;

      const result = await controller.getMe(mockReq);

      expect(result).toEqual({ authenticated: false });
    });
  });

  describe('logout', () => {
    it('should log out the user successfully', async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      const mockReq = {
        logout: jest.fn((cb) => cb(null)),
      } as any;

      await controller.logout(mockReq, mockRes);

      expect(mockReq.logout).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Logged out successfully',
      });
    });

    it('should return 500 if logout fails', async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      const mockReq = {
        logout: jest.fn((cb) => cb(new Error('Logout error'))),
      } as any;

      await controller.logout(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Logout failed' });
    });
  });
});
