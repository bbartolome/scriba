import type { PipeTransform } from '@nestjs/common';
import type { SafeParser } from '../platform/index.js';
import { pathInvalid, projectError } from './errors.js';

/**
 * Validates a request value with a contract schema, and maps the failures to this module's codes.
 * A failure at a `path` field is `PROJECT_PATH_INVALID` (spec, "Path safety"). Any other failure is
 * `PROJECT_VALIDATION_FAILED`. The details carry the issue paths and messages, never the values.
 */
export class ProjectRequestPipe implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: SafeParser) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map((segment) => String(segment)),
      message: issue.message,
    }));
    if (issues.some((issue) => issue.path[0] === 'path')) {
      throw pathInvalid();
    }
    throw projectError('PROJECT_VALIDATION_FAILED', 'The request failed validation.', { issues });
  }
}
