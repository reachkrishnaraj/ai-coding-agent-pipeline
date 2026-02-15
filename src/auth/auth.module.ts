import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GitHubStrategy } from './github.strategy';
import { SessionSerializer } from './session.serializer';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    ConfigModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, GitHubStrategy, SessionSerializer, AuthGuard, RolesGuard],
  exports: [AuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
