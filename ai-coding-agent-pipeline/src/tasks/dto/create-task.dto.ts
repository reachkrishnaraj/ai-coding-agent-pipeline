import { IsString, IsOptional, IsIn, IsNotEmpty } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  @IsIn(['bug-fix', 'feature', 'refactor', 'test-coverage'])
  type?: string;

  @IsString()
  @IsOptional()
  repo?: string;

  @IsString()
  @IsOptional()
  files?: string;

  @IsString()
  @IsOptional()
  acceptanceCriteria?: string;

  @IsString()
  @IsOptional()
  @IsIn(['normal', 'urgent'])
  priority?: 'normal' | 'urgent';

  @IsString()
  @IsOptional()
  @IsIn(['web', 'slack', 'api', 'asana'])
  source?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}
