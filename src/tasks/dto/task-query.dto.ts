import { IsOptional, IsInt, Min, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class TaskQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @IsIn([
    'received',
    'analyzing',
    'needs_clarification',
    'dispatched',
    'coding',
    'pr_open',
    'merged',
    'failed',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  repo?: string;
}
