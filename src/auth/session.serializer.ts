import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { AuthService, SessionUser } from './auth.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly authService: AuthService) {
    super();
  }

  serializeUser(user: SessionUser, done: (err: any, id?: string) => void) {
    // Store user ID in session
    done(null, user.id);
  }

  async deserializeUser(id: string, done: (err: any, user?: SessionUser | null) => void) {
    try {
      const user = await this.authService.getUserById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
}
