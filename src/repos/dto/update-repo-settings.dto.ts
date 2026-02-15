import { IsString, IsOptional } from 'class-validator';

export class UpdateRepoSettingsDto {
  @IsOptional()
  @IsString()
  defaultAgent?: string;

  @IsOptional()
  @IsString()
  customSystemPrompt?: string;
}
