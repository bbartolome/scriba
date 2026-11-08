import { Injectable } from '@nestjs/common';
import { projectError } from '../errors.js';
import { validateWrite } from '../file-api.service.js';

/**
 * Per-path validators (spec, "Validation on propose"). Other modules register a check for a path
 * pattern, so the Project store never imports their code. The Graph runner, for example, registers
 * the graph schema for `graphs/`, and an invalid proposed graph is then refused. A check returns the
 * failure message, or undefined when the content is valid.
 */
export type PendingContentCheck = (input: {
  readonly path: string;
  readonly content: string;
}) => string | undefined;

interface Rule {
  readonly pattern: string;
  readonly check: PendingContentCheck;
}

/**
 * The pattern is a project-relative folder prefix such as `graphs/`, or a full file path. A rule applies
 * to a path when the path equals the pattern or lies under it. The rules run in registration order, and
 * the first failure wins.
 */
// This phase's choice, not a survey default: a pattern ending in `/` matches by folder prefix.
@Injectable()
export class PendingValidators {
  private readonly rules: Rule[] = [];

  /** Registers a check. Returns the function that removes it again. */
  register(pattern: string, check: PendingContentCheck): () => void {
    const rule: Rule = { pattern, check };
    this.rules.push(rule);
    return () => {
      const at = this.rules.indexOf(rule);
      if (at !== -1) {
        this.rules.splice(at, 1);
      }
    };
  }

  /** The first failure message for the content at the path, or undefined when every rule passes. */
  check(path: string, content: string): string | undefined {
    for (const rule of this.rules) {
      if (!matches(rule.pattern, path)) {
        continue;
      }
      const message = rule.check({ path, content });
      if (message !== undefined) {
        return message;
      }
    }
    return undefined;
  }
}

function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith('/')) {
    return path.startsWith(pattern);
  }
  return path === pattern;
}

/**
 * The checks a proposed text must pass before it is stored or written: the same write rules as an author
 * save (text, NUL, size, `project.yaml`'s schema), then every registered validator for the path. A failure
 * is `PROJECT_VALIDATION_FAILED` for the validator, and the write rules keep their own codes. Returns the
 * bytes the text would write.
 */
export function checkPendingContent(
  validators: PendingValidators,
  path: string,
  content: string,
): Buffer {
  const bytes = validateWrite(path, content);
  const message = validators.check(path, content);
  if (message !== undefined) {
    throw projectError('PROJECT_VALIDATION_FAILED', message, { path });
  }
  return bytes;
}
