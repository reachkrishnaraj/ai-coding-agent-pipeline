import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

type UserRole = 'admin' | 'developer';
type UserStatus = 'pending' | 'active' | 'inactive';

@Controller('api/users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
  ) {
    const users = await this.usersService.findAll({ status, role });
    return { users };
  }

  @Get('pending')
  async findPending() {
    const users = await this.usersService.findPending();
    return { users };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    return this.usersService.update(id, updateDto);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string) {
    return this.usersService.approve(id);
  }

  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Post(':id/make-admin')
  async makeAdmin(@Param('id') id: string) {
    return this.usersService.makeAdmin(id);
  }

  @Post(':id/make-developer')
  async makeDeveloper(@Param('id') id: string) {
    return this.usersService.makeDeveloper(id);
  }
}
