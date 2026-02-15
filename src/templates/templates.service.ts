import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TaskTemplate,
  TemplateDocument,
} from '../common/schemas/template.schema';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ApplyTemplateDto } from './dto/apply-template.dto';
import { TemplateQueryDto } from './dto/template-query.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(TaskTemplate.name)
    private templateModel: Model<TemplateDocument>,
  ) {}

  async create(
    createTemplateDto: CreateTemplateDto,
    userId: string,
  ): Promise<TaskTemplate> {
    const template = new this.templateModel({
      ...createTemplateDto,
      templateType: createTemplateDto.templateType || 'custom',
      ownerId: userId,
      createdBy: userId,
      visibility: createTemplateDto.visibility || 'private',
    });

    return template.save();
  }

  async findAll(
    query: TemplateQueryDto,
    userId?: string,
  ): Promise<{ templates: TaskTemplate[]; total: number; page: number; limit: number }> {
    const { type, repo, search, sort, page = 1, limit = 20 } = query;

    const filter: any = {};

    // Filter by type
    if (type) {
      filter.templateType = type;
    }

    // Filter by repo
    if (repo) {
      filter.defaultRepo = repo;
    }

    // Filter by visibility - show builtin, global, and user's own templates
    if (userId) {
      filter.$or = [
        { templateType: 'builtin' },
        { templateType: 'global' },
        { ownerId: userId },
      ];
    } else {
      filter.templateType = { $in: ['builtin', 'global'] };
    }

    // Search by name or description
    if (search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ],
      });
    }

    // Sort
    let sortOption: any = { createdAt: -1 };
    if (sort === 'name') {
      sortOption = { name: 1 };
    } else if (sort === 'usageCount') {
      sortOption = { usageCount: -1 };
    }

    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      this.templateModel.find(filter).sort(sortOption).skip(skip).limit(limit).exec(),
      this.templateModel.countDocuments(filter).exec(),
    ]);

    return {
      templates: templates.map((t) => t.toJSON()),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, userId?: string): Promise<TaskTemplate> {
    const template = await this.templateModel.findById(id).exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Check access
    if (
      template.templateType === 'custom' &&
      template.ownerId !== userId &&
      template.visibility === 'private'
    ) {
      throw new ForbiddenException('You do not have access to this template');
    }

    return template.toJSON();
  }

  async update(
    id: string,
    updateTemplateDto: UpdateTemplateDto,
    userId: string,
    isAdmin: boolean = false,
  ): Promise<TaskTemplate> {
    const template = await this.templateModel.findById(id).exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Check permissions
    if (template.isReadOnly && !isAdmin) {
      throw new ForbiddenException('This template is read-only');
    }

    if (template.ownerId !== userId && !isAdmin) {
      throw new ForbiddenException('You do not have permission to edit this template');
    }

    Object.assign(template, updateTemplateDto);
    await template.save();

    return template.toJSON();
  }

  async remove(id: string, userId: string, isAdmin: boolean = false): Promise<void> {
    const template = await this.templateModel.findById(id).exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Cannot delete builtin templates
    if (template.templateType === 'builtin') {
      throw new ForbiddenException('Cannot delete builtin templates');
    }

    // Check permissions
    if (template.ownerId !== userId && !isAdmin) {
      throw new ForbiddenException('You do not have permission to delete this template');
    }

    await this.templateModel.findByIdAndDelete(id).exec();
  }

  async apply(
    id: string,
    applyTemplateDto: ApplyTemplateDto,
  ): Promise<{
    templateId: string;
    description: string;
    repo?: string;
    taskType?: string;
    priority?: string;
    filesHint?: string[];
    acceptanceCriteria?: string[];
  }> {
    const template = await this.templateModel.findById(id).exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Validate required variables
    this.validateVariables(template, applyTemplateDto.variables);

    // Replace variables in templates
    const description = this.replaceVariables(
      template.descriptionTemplate,
      applyTemplateDto.variables,
    );

    const filesHint = template.filesHintTemplate?.map((file) =>
      this.replaceVariables(file, applyTemplateDto.variables),
    );

    const acceptanceCriteria = template.acceptanceCriteriaTemplate?.map((criterion) =>
      this.replaceVariables(criterion, applyTemplateDto.variables),
    );

    // Increment usage count
    await this.templateModel
      .findByIdAndUpdate(id, { $inc: { usageCount: 1 } })
      .exec();

    return {
      templateId: id,
      description,
      repo: template.defaultRepo,
      taskType: template.defaultTaskType,
      priority: template.defaultPriority,
      filesHint,
      acceptanceCriteria,
    };
  }

  async favorite(id: string, userId: string): Promise<{ favorited: boolean; favoriteCount: number }> {
    const template = await this.templateModel.findById(id).exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Increment favorite count (simplified - not tracking individual users)
    await this.templateModel
      .findByIdAndUpdate(id, { $inc: { favoriteCount: 1 } })
      .exec();

    return {
      favorited: true,
      favoriteCount: template.favoriteCount + 1,
    };
  }

  async unfavorite(id: string, userId: string): Promise<{ favorited: boolean; favoriteCount: number }> {
    const template = await this.templateModel.findById(id).exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Decrement favorite count
    const newCount = Math.max(0, template.favoriteCount - 1);
    await this.templateModel
      .findByIdAndUpdate(id, { favoriteCount: newCount })
      .exec();

    return {
      favorited: false,
      favoriteCount: newCount,
    };
  }

  private validateVariables(
    template: TemplateDocument,
    variables: Record<string, any>,
  ): void {
    const missingRequired: string[] = [];

    for (const [key, varDef] of Object.entries(template.variables)) {
      if (varDef.required && !variables[key]) {
        missingRequired.push(key);
      }
    }

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Missing required variables: ${missingRequired.join(', ')}`,
      );
    }
  }

  private replaceVariables(template: string, variables: Record<string, any>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const replacement = Array.isArray(value) ? value.join('\n') : String(value);
      result = result.replace(regex, replacement);
    }

    return result;
  }
}
