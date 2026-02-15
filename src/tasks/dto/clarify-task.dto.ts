import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class ClarifyTaskDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  answers: string[];
}
