import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import {
  TaskTemplate,
  TemplateSchema,
} from '../common/schemas/template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskTemplate.name, schema: TemplateSchema },
    ]),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService, MongooseModule],
})
export class TemplatesModule {}
