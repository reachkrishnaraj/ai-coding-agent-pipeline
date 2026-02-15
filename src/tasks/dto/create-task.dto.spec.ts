import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTaskDto } from './create-task.dto';

describe('CreateTaskDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      description: 'Fix the payment bug',
      type: 'bug-fix',
      repo: 'mothership/finance-service',
      priority: 'normal',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should require description', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      type: 'bug-fix',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('description');
  });

  it('should reject invalid task type', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      description: 'Test task',
      type: 'invalid-type',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const typeError = errors.find((e) => e.property === 'type');
    expect(typeError).toBeDefined();
  });

  it('should reject invalid priority', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      description: 'Test task',
      priority: 'critical',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const priorityError = errors.find((e) => e.property === 'priority');
    expect(priorityError).toBeDefined();
  });

  it('should accept valid priority values', async () => {
    const normalDto = plainToInstance(CreateTaskDto, {
      description: 'Test task',
      priority: 'normal',
    });

    const urgentDto = plainToInstance(CreateTaskDto, {
      description: 'Test task',
      priority: 'urgent',
    });

    const normalErrors = await validate(normalDto);
    const urgentErrors = await validate(urgentDto);

    expect(normalErrors).toHaveLength(0);
    expect(urgentErrors).toHaveLength(0);
  });

  it('should accept all valid task types', async () => {
    const types = ['bug-fix', 'feature', 'refactor', 'test-coverage'];

    for (const type of types) {
      const dto = plainToInstance(CreateTaskDto, {
        description: 'Test task',
        type,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('should make optional fields truly optional', async () => {
    const dto = plainToInstance(CreateTaskDto, {
      description: 'Minimal task',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
