import { Injectable } from '@nestjs/common';
import {
  type Origin,
  type ToolDetail,
  type ValidateRequest,
  type ValidateResponse,
} from '@bbartolome/scriba-contracts/tool-registry';
import { toolError } from '../errors.js';
import { COLD_OPEN_FIXTURE_SOURCE } from './cold-open.fixture.js';
import { type LoadedTool, loadTool } from './load-tool.js';

/**
 * The origin the fixture reports. It stands in for the nonfiction workhorse until the loader reads
 * the real packs, so the fixture is not Genre packs content.
 */
const FIXTURE_ORIGIN: Origin = 'nonfiction';

/**
 * The in-process catalog (survey 21 §2). The Agent loop and the Graph runner inject it, and the
 * routes call it. In phase:form-renderer it serves the registry-owned cold-open fixture. The loader
 * replaces the fixture source in phase:loader-validation.
 */
@Injectable()
export class ToolCatalogService {
  private readonly tools: ReadonlyMap<string, LoadedTool>;

  constructor() {
    const loaded = [loadTool(COLD_OPEN_FIXTURE_SOURCE, FIXTURE_ORIGIN)];
    this.tools = new Map(loaded.map((tool) => [tool.name, tool]));
  }

  /** The detail of one tool, or `TOOL_NOT_FOUND`. */
  detail(name: string): ToolDetail {
    return this.find(name).detail;
  }

  /**
   * Validates arguments against one tool. A success returns the arguments with defaults applied and
   * the entity IDs to resolve. A failure is `TOOL_ARGS_INVALID`, with a model-readable message that
   * names the tool and one line per issue, and the structured issues for a form.
   */
  validate(name: string, request: ValidateRequest): ValidateResponse {
    const tool = this.find(name);
    const result = tool.args.check(request.mode, request.arguments);
    if (!result.ok) {
      const lines = result.issues.map(
        (issue) =>
          `- ${issue.path === '/' ? '(arguments)' : issue.path.slice(1)}: ${issue.message}`,
      );
      throw toolError(
        'TOOL_ARGS_INVALID',
        [`${tool.name}: the arguments do not match the tool's inputs.`, ...lines].join('\n'),
        { issues: result.issues },
      );
    }
    return { arguments: result.arguments, entities: result.entities };
  }

  private find(name: string): LoadedTool {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      throw toolError('TOOL_NOT_FOUND', `No tool named ${name}.`);
    }
    return tool;
  }
}
