import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { GitHubUser } from './github.strategy';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  serializeUser(user: GitHubUser, done: (err: Error, user: any) => void): void {
    done(null, user);
  }

  deserializeUser(payload: any, done: (err: Error, user: any) => void): void {
    done(null, payload);
  }
}
