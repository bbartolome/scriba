import { describe, expectTypeOf, it } from 'vitest';
import type { ProjectYaml } from '@bbartolome/scriba-contracts/project-store';
import type { ModelChoice } from '@bbartolome/scriba-contracts/providers';

// The type test of phase:project-override (survey 19 §3): `ModelChoice` and the `model` field of
// `project.yaml` stay compatible in both directions. Vitest checks this file with tsc (see
// vitest.config.ts), so a change to either shape fails the suite. The runtime rules for the field
// (a non-empty model, no `auto`) are tested through the HTTP seam in project-override.test.ts.

type ProjectOverrideField = NonNullable<ProjectYaml['model']>;

describe('the project override shape', () => {
  it('lets a ModelChoice be written to project.yaml and read back as one', () => {
    expectTypeOf<ModelChoice>().toExtend<ProjectOverrideField>();
  });

  it('lets the project.yaml model field be used wherever a ModelChoice is', () => {
    expectTypeOf<ProjectOverrideField>().toExtend<ModelChoice>();
  });
});
