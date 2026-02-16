import { IsString, IsEnum, IsOptional, ValidateIf, IsNumber, IsBoolean } from 'class-validator';

export class AddDependencyDto {
  @IsEnum(['task', 'pr', 'external_issue'])
  type: 'task' | 'pr' | 'external_issue';

  // Task dependency
  @ValidateIf(o => o.type === 'task')
  @IsString()
  taskId?: string;

  // PR dependency
  @ValidateIf(o => o.type === 'pr')
  @IsString()
  repo?: string;

  @ValidateIf(o => o.type === 'pr')
  @IsNumber()
  prNumber?: number;

  // External issue dependency
  @ValidateIf(o => o.type === 'external_issue')
  @IsString()
  externalRepo?: string;

  @ValidateIf(o => o.type === 'external_issue')
  @IsNumber()
  externalIssueNumber?: number;

  @IsOptional()
  @IsString()
  requiredStatus?: string; // Default: 'merged' for task/pr, 'closed' for issue

  @IsOptional()
  @IsEnum(['hard', 'soft'])
  blockingBehavior?: 'hard' | 'soft'; // Default: 'hard'

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean; // Auto-start when dependency resolves
}
