import type { LintSeverity } from '@bbartolome/scriba-contracts/tool-registry';
import { parseTemplate, TemplateError, type TemplateNode } from '../template/parser.js';

/** The facts the template check needs about one input. */
export interface TemplateField {
  readonly key: string;
  /** An `entity`-typed input: its ID is a valid target of `{{entity}}`. */
  readonly entity: boolean;
  /** A `style`-typed input: a valid target of `{{entity}}` too. */
  readonly style: boolean;
  /** Required in the envelope's `required`, and never a style field. */
  readonly required: boolean;
}

/** One finding in the prompt. `offset` counts characters from the start of the prompt text. */
export interface TemplateFinding {
  readonly offset: number;
  readonly rule: string;
  readonly severity: LintSeverity;
  readonly message: string;
}

/** The template check's result: its findings, and the required inputs the prompt never uses. */
export interface TemplateCheck {
  readonly findings: TemplateFinding[];
  readonly unusedRequired: readonly string[];
}

/**
 * The template rules (spec, "Lint rules": template syntax and variables, unused required inputs).
 * The parser is the renderer's, so a syntax error here is the one the renderer would raise. A
 * variable that is not an input is an error, and the message names the variable.
 */
export function checkTemplate(
  prompt: string,
  fields: ReadonlyMap<string, TemplateField>,
): TemplateCheck {
  let tree: TemplateNode[];
  try {
    tree = parseTemplate(prompt);
  } catch (error) {
    if (error instanceof TemplateError) {
      return {
        findings: [
          {
            offset: error.offset ?? 0,
            rule: 'template-syntax',
            severity: 'error',
            message: error.message,
          },
        ],
        unusedRequired: [],
      };
    }
    throw error;
  }

  const findings: TemplateFinding[] = [];
  const used = new Set<string>();
  walk(tree, { eachField: undefined }, fields, used, findings);
  const unusedRequired = [...fields.values()]
    .filter((field) => field.required && !used.has(field.key))
    .map((field) => field.key);
  return { findings, unusedRequired };
}

/** The scope a node sits in: the `{{#each}}` field, when there is one. */
interface Scope {
  readonly eachField: string | undefined;
}

function walk(
  nodes: readonly TemplateNode[],
  scope: Scope,
  fields: ReadonlyMap<string, TemplateField>,
  used: Set<string>,
  findings: TemplateFinding[],
): void {
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
      case 'catalog':
        break;
      case 'value':
        checkValue(node.name, node.offset, scope, fields, used, findings);
        break;
      case 'entity':
        checkEntity(node.name, node.offset, scope, fields, used, findings);
        break;
      case 'each':
        checkInput(node.name, node.offset, fields, used, findings);
        walk(node.body, { eachField: node.name }, fields, used, findings);
        break;
      case 'if':
        checkInput(node.name, node.offset, fields, used, findings);
        walk(node.then, scope, fields, used, findings);
        walk(node.otherwise, scope, fields, used, findings);
        break;
    }
  }
}

function checkValue(
  name: string,
  offset: number,
  scope: Scope,
  fields: ReadonlyMap<string, TemplateField>,
  used: Set<string>,
  findings: TemplateFinding[],
): void {
  if (name === 'this') {
    if (scope.eachField === undefined) {
      findings.push({
        offset,
        rule: 'template-scope',
        severity: 'error',
        message: '{{this}} is only valid inside {{#each}}.',
      });
    }
    return;
  }
  if (name === '@index') {
    if (scope.eachField === undefined) {
      findings.push({
        offset,
        rule: 'template-scope',
        severity: 'error',
        message: '{{@index}} is only valid inside {{#each}}.',
      });
    }
    return;
  }
  checkInput(name, offset, fields, used, findings);
}

function checkEntity(
  name: string,
  offset: number,
  scope: Scope,
  fields: ReadonlyMap<string, TemplateField>,
  used: Set<string>,
  findings: TemplateFinding[],
): void {
  if (name === 'this') {
    if (scope.eachField === undefined) {
      findings.push({
        offset,
        rule: 'template-scope',
        severity: 'error',
        message: '{{entity this}} is only valid inside {{#each}}.',
      });
      return;
    }
    const field = fields.get(scope.eachField);
    if (field !== undefined) used.add(field.key);
    if (field !== undefined && !field.entity && !field.style) {
      entityTargetError(scope.eachField, offset, findings);
    }
    return;
  }
  const field = fields.get(name);
  if (field === undefined) {
    checkInput(name, offset, fields, used, findings);
    return;
  }
  used.add(name);
  if (!field.entity && !field.style) {
    entityTargetError(name, offset, findings);
  }
}

function entityTargetError(name: string, offset: number, findings: TemplateFinding[]): void {
  findings.push({
    offset,
    rule: 'template-entity',
    severity: 'error',
    message: `{{entity}} needs an entity or style field, and "${name}" is not one.`,
  });
}

function checkInput(
  name: string,
  offset: number,
  fields: ReadonlyMap<string, TemplateField>,
  used: Set<string>,
  findings: TemplateFinding[],
): void {
  if (!fields.has(name)) {
    findings.push({
      offset,
      rule: 'template-variable',
      severity: 'error',
      message: `"${name}" is not an input of this tool.`,
    });
    return;
  }
  used.add(name);
}
