import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ClarifyTaskDto } from './clarify-task.dto';

describe('ClarifyTaskDto', () => {
  it('should validate a valid DTO', async () => {
    const dto = plainToInstance(ClarifyTaskDto, {
      answers: ['Answer 1', 'Answer 2', 'Answer 3'],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should require answers array', async () => {
    const dto = plainToInstance(ClarifyTaskDto, {});

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('answers');
  });

  it('should reject empty answers array', async () => {
    const dto = plainToInstance(ClarifyTaskDto, {
      answers: [],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const answersError = errors.find((e) => e.property === 'answers');
    expect(answersError).toBeDefined();
  });

  it('should reject non-string array items', async () => {
    const dto = plainToInstance(ClarifyTaskDto, {
      answers: ['Valid answer', 123, true],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept single answer', async () => {
    const dto = plainToInstance(ClarifyTaskDto, {
      answers: ['Single answer'],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
