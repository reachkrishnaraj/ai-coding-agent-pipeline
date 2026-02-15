import {
  IsString,
  IsOptional,
  IsObject,
  IsEnum,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateVariable } from '../../common/schemas/template.schema';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsEnum(['builtin', 'custom', 'global'])
  @IsOptional()
  templateType?: string;

  @IsString()
  @IsOptional()
  ownerId?: string;

  @IsString()
  @IsOptional()
  organizationId?: string;

  @IsBoolean()
  @IsOptional()
  isReadOnly?: boolean;

  @IsString()
  @IsOptional()
  defaultRepo?: string;

  @IsString()
  @IsOptional()
  defaultTaskType?: string;

  @IsString()
  @IsOptional()
  defaultPriority?: string;

  @IsString()
  descriptionTemplate: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  filesHintTemplate?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  acceptanceCriteriaTemplate?: string[];

  @IsObject()
  variables: Record<string, TemplateVariable>;

  @IsEnum(['private', 'organization', 'public'])
  @IsOptional()
  visibility?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedUsers?: string[];

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsNumber()
  @IsOptional()
  estimatedTimeMinutes?: number;
}
