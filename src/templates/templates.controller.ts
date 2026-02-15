import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ApplyTemplateDto } from './dto/apply-template.dto';
import { TemplateQueryDto } from './dto/template-query.dto';
import { AuthenticatedGuard } from '../auth/auth.guard';

@Controller('api/templates')
@UseGuards(AuthenticatedGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  async findAll(@Query() query: TemplateQueryDto, @Request() req) {
    const userId = req.user?.username;
    return this.templatesService.findAll(query, userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const userId = req.user?.username;
    return this.templatesService.findOne(id, userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTemplateDto: CreateTemplateDto, @Request() req) {
    const userId = req.user.username;
    return this.templatesService.create(createTemplateDto, userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Request() req,
  ) {
    const userId = req.user.username;
    const isAdmin = req.user.role === 'admin';
    return this.templatesService.update(id, updateTemplateDto, userId, isAdmin);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req) {
    const userId = req.user.username;
    const isAdmin = req.user.role === 'admin';
    await this.templatesService.remove(id, userId, isAdmin);
  }

  @Post(':id/apply')
  async apply(@Param('id') id: string, @Body() applyTemplateDto: ApplyTemplateDto) {
    return this.templatesService.apply(id, applyTemplateDto);
  }

  @Post(':id/favorite')
  async favorite(@Param('id') id: string, @Request() req) {
    const userId = req.user.username;
    return this.templatesService.favorite(id, userId);
  }

  @Delete(':id/favorite')
  async unfavorite(@Param('id') id: string, @Request() req) {
    const userId = req.user.username;
    return this.templatesService.unfavorite(id, userId);
  }
}
