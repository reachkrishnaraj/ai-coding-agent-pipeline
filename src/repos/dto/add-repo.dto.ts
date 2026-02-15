import { IsString, IsOptional } from 'class-validator';

export class AddRepoDto {
  @IsString()
  repoName: string;

  @IsOptional()
  @IsString()
  defaultAgent?: string;
}
