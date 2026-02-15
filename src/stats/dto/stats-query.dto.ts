import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

export enum TimeRange {
  TODAY = 'today',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
  ALL_TIME = 'alltime',
  CUSTOM = 'custom',
}

export class StatsQueryDto {
  @IsOptional()
  @IsString()
  repo?: string = 'all';

  @IsOptional()
  @IsString()
  agent?: string = 'all';

  @IsOptional()
  @IsEnum(TimeRange)
  timeRange?: TimeRange = TimeRange.SEVEN_DAYS;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  taskType?: string = 'all';

  @IsOptional()
  @IsString()
  status?: string = 'all';
}
