import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = new AuthGuard();
  });

  it('should return true if request is authenticated', () => {
    const mockRequest = {
      isAuthenticated: jest.fn().mockReturnValue(true),
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(true);
    expect(mockRequest.isAuthenticated).toHaveBeenCalled();
  });

  it('should return false if request is not authenticated', () => {
    const mockRequest = {
      isAuthenticated: jest.fn().mockReturnValue(false),
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;

    expect(guard.canActivate(mockContext)).toBe(false);
    expect(mockRequest.isAuthenticated).toHaveBeenCalled();
  });
});
