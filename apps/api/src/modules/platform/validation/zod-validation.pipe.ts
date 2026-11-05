import type { PipeTransform } from '@nestjs/common';
import { ApiException, PLATFORM_CODES } from '../errors/api-error.js';

/**
 * The part of a Zod schema the pipe uses. Zod 4 schemas from the contracts satisfy it. The API
 * does not import zod itself, so the contract schemas stay the only definition of a shape.
 */
export interface SafeParser {
  safeParse(input: unknown): SafeParseOutcome;
}

type SafeParseOutcome =
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false; readonly error: { readonly issues: readonly IssueLike[] } };

interface IssueLike {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/**
 * [proposed] Survey name `ZodValidationPipe`. Validates a request value with a contract schema.
 * A failure becomes a 400 with
 * `PLATFORM_VALIDATION_FAILED` in the base error shape. The details carry the issue paths and
 * messages only, not the input values.
 */
export class ZodValidationPipe implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: SafeParser) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new ApiException(
      400,
      PLATFORM_CODES.VALIDATION_FAILED,
      'The request body failed validation.',
      {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.map((segment) => String(segment)),
          message: issue.message,
        })),
      },
    );
  }
}
