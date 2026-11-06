import { describe, expect, it } from 'vitest';
import {
  PROJECT_STORE_ROUTES,
  ProjectStoreErrorCodeSchema,
  ProjectYamlSchema,
} from '@bbartolome/scriba-contracts/project-store';

// phase:contract acceptance 1: the slice is importable from apps/api through its subpath.
describe('project-store contract slice in apps/api', () => {
  it('imports the project.yaml schema, the route constants and the error codes', () => {
    expect(
      ProjectYamlSchema.safeParse({ schemaVersion: 1, title: 'Book', genrePack: 'nonfiction' })
        .success,
    ).toBe(true);
    expect(PROJECT_STORE_ROUTES.list.path).toBe('/api/project-store/projects');
    expect(ProjectStoreErrorCodeSchema.safeParse('PROJECT_NOT_ACTIVE').success).toBe(true);
  });
});
