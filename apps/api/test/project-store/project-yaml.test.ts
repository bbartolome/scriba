import { describe, expect, it } from 'vitest';
import { ProjectYamlSchema } from '@bbartolome/scriba-contracts/project-store';
import {
  minimalProjectYaml,
  readProjectYaml,
  setTopLevelScalars,
} from '../../src/modules/project-store/project-yaml.document.js';

/** The `project.yaml` reading rules and the comment-preserving edit (spec, "File API" and "project.yaml schema"). */
describe('project.yaml document', () => {
  it('reads ok, too-new and invalid files by their version and schema', () => {
    expect(readProjectYaml('schemaVersion: 1\ntitle: A\ngenrePack: nonfiction\n')).toEqual({
      status: 'ok',
      schemaVersion: 1,
      title: 'A',
      genrePack: 'nonfiction',
    });
    expect(readProjectYaml('schemaVersion: 3\ntitle: A\n')).toEqual({
      status: 'too-new',
      schemaVersion: 3,
    });
    expect(readProjectYaml('schemaVersion: 0\ntitle: A\ngenrePack: x\n').status).toBe('invalid');
    expect(readProjectYaml('- a\n- b\n').status).toBe('invalid');
  });

  it('keeps unknown keys on a round trip through the schema', () => {
    const reading = readProjectYaml(
      'schemaVersion: 1\ntitle: A\ngenrePack: nonfiction\nfuture: { flag: true }\n',
    );
    expect(reading.status).toBe('ok');
    const parsed = ProjectYamlSchema.parse({
      schemaVersion: 1,
      title: 'A',
      genrePack: 'nonfiction',
      future: { flag: true },
    });
    expect(parsed).toHaveProperty('future', { flag: true });
  });

  it('sets the title and keeps comments and key order', () => {
    const text =
      '# keep me\nschemaVersion: 1\ntitle: Old Title # trailing\n# above pack\ngenrePack: nonfiction\norder: []\n';
    const edited = setTopLevelScalars(text, { title: 'New Title' });
    expect(edited).toBe(
      '# keep me\nschemaVersion: 1\ntitle: New Title # trailing\n# above pack\ngenrePack: nonfiction\norder: []\n',
    );
  });

  it('minimal text is a valid current project.yaml', () => {
    expect(readProjectYaml(minimalProjectYaml('Book', 'nonfiction')).status).toBe('ok');
  });
});
