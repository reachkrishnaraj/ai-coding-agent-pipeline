import { IsOptional, IsIn } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsIn(['admin', 'developer'])
  role?: 'admin' | 'developer';

  @IsOptional()
  @IsIn(['pending', 'active', 'inactive'])
  status?: 'pending' | 'active' | 'inactive';
}
