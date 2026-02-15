import { IsObject } from 'class-validator';

export class ApplyTemplateDto {
  @IsObject()
  variables: Record<string, any>;
}
