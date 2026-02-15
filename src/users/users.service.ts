import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../common/schemas/user.schema';

export interface CreateUserInput {
  githubId: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  hasRepoAccess?: boolean;
}

export interface UpdateUserInput {
  role?: UserRole;
  status?: UserStatus;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly adminUsernames: string[];

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {
    // Parse admin usernames from env
    const adminConfig =
      this.configService.get<string>('ADMIN_GITHUB_USERNAMES') || '';
    this.adminUsernames = adminConfig
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter((u) => u.length > 0);

    this.logger.log(`Admin usernames configured: ${this.adminUsernames.join(', ') || 'none'}`);
  }

  /**
   * Find or create user on OAuth login
   */
  async findOrCreate(input: CreateUserInput): Promise<UserDocument> {
    let user = await this.userModel.findOne({ githubId: input.githubId });

    if (user) {
      // Update last login and any changed profile info
      user.lastLoginAt = new Date();
      user.displayName = input.displayName;
      user.email = input.email;
      user.avatarUrl = input.avatarUrl;

      // Auto-activate if they now have repo access but were pending
      if (user.status === 'pending' && input.hasRepoAccess) {
        user.status = 'active';
        this.logger.log(`User ${user.username} auto-activated (has repo access)`);
      }

      await user.save();
      this.logger.log(`User logged in: ${user.username} (${user.role}, ${user.status})`);
      return user;
    }

    // Check if this is the first user or an admin username
    const userCount = await this.userModel.countDocuments();
    const isAdminUsername = this.adminUsernames.includes(
      input.username.toLowerCase(),
    );
    const isFirstUser = userCount === 0;

    // Determine role - admin for first user or configured admin usernames
    const role: UserRole = isFirstUser || isAdminUsername ? 'admin' : 'developer';

    // Determine status:
    // - active if: first user, admin username, OR has access to allowed repos
    // - pending otherwise (needs admin approval)
    const shouldAutoActivate = isFirstUser || isAdminUsername || input.hasRepoAccess;
    const status: UserStatus = shouldAutoActivate ? 'active' : 'pending';

    user = new this.userModel({
      githubId: input.githubId,
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      avatarUrl: input.avatarUrl,
      role,
      status,
      lastLoginAt: new Date(),
    });

    await user.save();
    this.logger.log(
      `New user created: ${user.username} (role: ${role}, status: ${status}, hasRepoAccess: ${input.hasRepoAccess})`,
    );

    return user;
  }

  async findByGithubId(githubId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ githubId });
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username });
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id);
  }

  async findAll(filters?: {
    status?: UserStatus;
    role?: UserRole;
  }): Promise<UserDocument[]> {
    const query: Record<string, any> = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.role) query.role = filters.role;

    return this.userModel.find(query).sort({ createdAt: -1 });
  }

  async findPending(): Promise<UserDocument[]> {
    return this.userModel.find({ status: 'pending' }).sort({ createdAt: -1 });
  }

  async update(id: string, input: UpdateUserInput): Promise<UserDocument> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }

    if (input.role !== undefined) {
      user.role = input.role;
    }
    if (input.status !== undefined) {
      user.status = input.status;
    }

    await user.save();
    this.logger.log(
      `User updated: ${user.username} (role: ${user.role}, status: ${user.status})`,
    );

    return user;
  }

  async approve(id: string): Promise<UserDocument> {
    return this.update(id, { status: 'active' });
  }

  async deactivate(id: string): Promise<UserDocument> {
    return this.update(id, { status: 'inactive' });
  }

  async makeAdmin(id: string): Promise<UserDocument> {
    return this.update(id, { role: 'admin' });
  }

  async makeDeveloper(id: string): Promise<UserDocument> {
    return this.update(id, { role: 'developer' });
  }
}
