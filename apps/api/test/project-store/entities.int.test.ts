import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EntityListResponseSchema,
  ResolveEntitiesResponseSchema,
} from '@bbartolome/scriba-contracts/project-store';
import { call, makeProject, projectPath, startHarness, yamlFor, type Harness } from './support.js';

/** phase:files acceptance (g): resolution returns contents for IDs in entities/ and sources/, and reports unknown and duplicate IDs. */
describe('phase:files acceptance (g): entity resolution', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
    await makeProject(h.library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      'entities/alice.md': '---\nid: alice-id\ntype: person\n---\nAlice is a person.\n',
      'entities/dup.md': '---\nid: outline\ntype: place\n---\nA place with a clashing ID.\n',
      'sources/outline.md': '---\nid: outline\ntype: source\n---\nOutline.\n',
      'sources/notes.md': 'Plain notes with no front matter.\n',
      'drafts/ch01.md': '---\nid: draft-only\ntype: person\n---\nDrafts are never indexed.\n',
    });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
  });

  afterAll(async () => {
    await h.close();
  });

  it('resolves IDs to their file and content, and reports unknown and duplicate IDs in request order', async () => {
    const answer = await call(h, 'POST', projectPath('book', '/entities/resolve'), {
      ids: ['alice-id', 'notes', 'missing', 'outline', 'draft-only'],
    });

    expect(answer.status).toBe(200);
    expect(ResolveEntitiesResponseSchema.safeParse(answer.body).success).toBe(true);
    expect(answer.body).toEqual({
      results: [
        {
          ok: true,
          id: 'alice-id',
          type: 'person',
          path: 'entities/alice.md',
          content: '---\nid: alice-id\ntype: person\n---\nAlice is a person.\n',
        },
        {
          ok: true,
          id: 'notes',
          type: 'source',
          path: 'sources/notes.md',
          content: 'Plain notes with no front matter.\n',
        },
        { ok: false, id: 'missing', code: 'PROJECT_ENTITY_NOT_FOUND' },
        {
          ok: false,
          id: 'outline',
          code: 'PROJECT_ENTITY_DUPLICATE_ID',
          paths: ['entities/dup.md', 'sources/outline.md'],
        },
        { ok: false, id: 'draft-only', code: 'PROJECT_ENTITY_NOT_FOUND' },
      ],
    });
  });

  it('lists entities, filtered by type', async () => {
    const all = await call(h, 'GET', projectPath('book', '/entities'));
    expect(all.status).toBe(200);
    expect(EntityListResponseSchema.safeParse(all.body).success).toBe(true);
    expect((all.body as { entities: unknown[] }).entities).toHaveLength(4);

    const people = await call(h, 'GET', `${projectPath('book', '/entities')}?type=person`);
    expect(people.body).toEqual({
      entities: [{ id: 'alice-id', type: 'person', path: 'entities/alice.md' }],
    });
  });

  it('a resolution never writes: the folder is unchanged after it', async () => {
    const { readdir } = await import('node:fs/promises');
    const before = await readdir(join(h.library.booksDir, 'book', 'entities'));
    await call(h, 'POST', projectPath('book', '/entities/resolve'), { ids: ['alice-id'] });
    expect(await readdir(join(h.library.booksDir, 'book', 'entities'))).toEqual(before);
  });
});
