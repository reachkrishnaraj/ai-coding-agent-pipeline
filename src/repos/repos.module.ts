import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReposController } from './repos.controller';
import { ReposService } from './repos.service';
import { UserRepo, UserRepoSchema } from '../common/schemas/user-repo.schema';
import { Task, TaskSchema } from '../common/schemas/task.schema';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: UserRepo.name, schema: UserRepoSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [ReposController],
  providers: [ReposService],
  exports: [ReposService],
})
export class ReposModule {}
