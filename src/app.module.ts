import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { TasksModule } from './tasks/tasks.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SlackModule } from './slack/slack.module';
import { TemplatesModule } from './templates/templates.module';
import { JobsModule } from './jobs/jobs.module';
import { ReposModule } from './repos/repos.module';
import { StatsModule } from './stats/stats.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'web', 'dist'),
      exclude: ['/api/(.*)'],
      serveRoot: '/',
    }),
    DatabaseModule,
    TasksModule,
    AuthModule,
    UsersModule,
    SlackModule,
    TemplatesModule,
    JobsModule,
    ReposModule,
    StatsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
