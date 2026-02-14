import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GitHubStrategy } from './github.strategy';
import { SessionSerializer } from './session.serializer';

@Module({
  imports: [PassportModule.register({ session: true }), ConfigModule],
  controllers: [AuthController],
  providers: [AuthService, GitHubStrategy, SessionSerializer],
  exports: [AuthService],
})
export class AuthModule {}
