import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PendingChange } from '@bbartolome/scriba-contracts/project-store';
import { ProjectStoreProvider } from '../../src/modules/project-store/index.js';
import { PendingValidators } from '../../src/modules/project-store/pending/validators.js';
import { SseClient } from '../support/sse-client.js';
import { call, makeProject, projectPath, startHarness, yamlFor, type Harness } from './support.js';

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const LINES = 'line one\nline two\nline three\nline four\nline five\nline six\n';

/**
 * phase:pending-review, survey 20 §3 acceptance 1–8, through HTTP and the in-process provider. Each test
 * works on its own files, so the tests do not depend on one another.
 */
describe('phase:pending-review acceptance (survey 20 §3)', () => {
  let h: Harness;
  const root = (): string => join(h.library.booksDir, 'book');
  const provider = (): ProjectStoreProvider => h.running.app.get(ProjectStoreProvider);

  beforeAll(async () => {
    h = await startHarness();
    await makeProject(h.library.booksDir, 'book', {
      'project.yaml': yamlFor('Book'),
      '.gitignore': '.scriba/\n',
      'sources/outline.md': 'Original outline.\n',
      'sources/fold.md': 'Fold base.\n',
      'sources/host.md': LINES,
      'sources/clash.md': LINES,
      'sources/anyway.md': 'Anyway original.\n',
      'drafts/ch01.md': 'Chapter one.\n',
      'drafts/ch02.md': 'Chapter two.\n',
      'drafts/ch03.md': 'Three.\n',
    });
    expect((await call(h, 'POST', projectPath('book', '/activate'), {})).status).toBe(200);
  });

  afterAll(async () => {
    await h.close();
  });

  async function openStream(): Promise<SseClient> {
    const stream = await SseClient.open(`${h.running.baseUrl}/events`, {
      headers: { cookie: h.running.cookie },
    });
    expect(await stream.nextEnvelope()).toMatchObject({ module: 'platform', type: 'hello' });
    return stream;
  }

  function propose(path: string, content: string, runId: string): Promise<ReturnType<typeof call>> {
    return call(h, 'POST', projectPath('book', '/files/propose'), {
      op: 'write',
      path,
      content,
      origin: { kind: 'agent-run', runId },
    });
  }

  function changeOf(answer: { body: unknown }): PendingChange {
    return (answer.body as { change: PendingChange }).change;
  }

  async function listed(targetPath: string): Promise<PendingChange[]> {
    return (await provider().listPending('book')).filter((c) => c.targetPath === targetPath);
  }

  // Acceptance 1 (the first test in survey 20 §3): propose leaves disk unchanged, captures the base, and
  // emits one pending-created.
  it('acceptance 1: propose on an existing file with no base leaves its bytes unchanged, captures the disk content as the base, and emits one pending-created', async () => {
    const stream = await openStream();
    try {
      const before = await readFile(join(root(), 'sources', 'outline.md'));
      const answer = await call(h, 'POST', projectPath('book', '/files/propose'), {
        op: 'write',
        path: 'sources/outline.md',
        content: 'Proposed outline.\n',
        origin: { kind: 'agent-run', runId: 'run-first' },
      });
      expect(answer.status).toBe(200);
      const change = changeOf(answer);
      expect(change).toMatchObject({
        projectId: 'book',
        targetPath: 'sources/outline.md',
        kind: 'modify',
        status: 'pending',
        conflict: null,
        proposed: 'Proposed outline.\n',
        capturedBase: { hash: sha('Original outline.\n'), content: 'Original outline.\n' },
        origin: { kind: 'agent-run', runId: 'run-first' },
      });

      expect(await readFile(join(root(), 'sources', 'outline.md'))).toEqual(before);
      expect(await stream.nextEnvelope()).toEqual({
        module: 'project-store',
        type: 'pending-created',
        data: { projectId: 'book', id: change.id },
      });
      await expect(stream.nextBlock(300)).rejects.toThrow();
    } finally {
      stream.close();
    }
  });

  // Acceptance 2: a second propose from the same run folds in and keeps its base; another run gets its own.
  it('acceptance 2: a second propose from the same run updates the change and keeps its base; a different run gets its own change', async () => {
    const first = changeOf(await propose('sources/fold.md', 'Fold, first.\n', 'run-a'));
    const second = changeOf(await propose('sources/fold.md', 'Fold, second.\n', 'run-a'));
    expect(second.id).toBe(first.id);
    expect(second.capturedBase).toEqual({ hash: sha('Fold base.\n'), content: 'Fold base.\n' });
    expect(second.proposed).toBe('Fold, second.\n');

    const edited = await call(h, 'POST', projectPath('book', '/files/propose'), {
      op: 'edit',
      path: 'sources/fold.md',
      old: 'second',
      new: 'third',
      origin: { kind: 'agent-run', runId: 'run-a' },
    });
    expect(changeOf(edited)).toMatchObject({
      id: first.id,
      proposed: 'Fold, third.\n',
      capturedBase: { hash: sha('Fold base.\n') },
    });

    const other = changeOf(await propose('sources/fold.md', 'Fold, from run B.\n', 'run-b'));
    expect(other.id).not.toBe(first.id);
    expect(other.capturedBase).toEqual({ hash: sha('Fold base.\n'), content: 'Fold base.\n' });
    expect((await listed('sources/fold.md')).map((c) => c.id).sort()).toEqual(
      [first.id, other.id].sort(),
    );

    // The read overlay: a run sees its own proposed text, another run sees the disk, and the disk never changes.
    const overlay = await call(
      h,
      'GET',
      `${projectPath('book', '/files/read')}?path=sources%2Ffold.md&runId=run-a`,
    );
    expect(overlay.body).toMatchObject({
      content: 'Fold, third.\n',
      origin: { kind: 'agent-run', runId: 'run-a' },
    });
    const unrelated = await call(
      h,
      'GET',
      `${projectPath('book', '/files/read')}?path=sources%2Ffold.md&runId=run-c`,
    );
    expect(unrelated.body).toMatchObject({ content: 'Fold base.\n' });
    expect(unrelated.body).not.toHaveProperty('origin');
    expect(await readFile(join(root(), 'sources', 'fold.md'), 'utf8')).toBe('Fold base.\n');
  });

  // Acceptance 3: apply writes the proposal; an existing top-level draft keeps its previous content as a version.
  it('acceptance 3: apply writes the proposal and saves the previous content of an existing top-level draft under drafts/.versions/', async () => {
    const stream = await openStream();
    try {
      const change = changeOf(
        await propose('drafts/ch01.md', 'Chapter one, revised.\n', 'run-draft'),
      );
      expect(await stream.nextEnvelope()).toMatchObject({ type: 'pending-created' });

      const applied = await call(
        h,
        'POST',
        projectPath('book', `/pending/${change.id}/accept`),
        {},
      );
      expect(applied.status).toBe(200);
      expect(changeOf(applied)).toMatchObject({ status: 'accepted', conflict: null });
      expect(await readFile(join(root(), 'drafts', 'ch01.md'), 'utf8')).toBe(
        'Chapter one, revised.\n',
      );

      expect(await stream.nextEnvelope()).toEqual({
        module: 'project-store',
        type: 'pending-resolved',
        data: { projectId: 'book', id: change.id, status: 'accepted' },
      });
      expect(await stream.nextEnvelope()).toEqual({
        module: 'project-store',
        type: 'files-changed',
        data: { projectId: 'book', paths: ['drafts/ch01.md'] },
      });
    } finally {
      stream.close();
    }

    const listing = await call(
      h,
      'GET',
      `${projectPath('book', '/versions')}?draftPath=drafts%2Fch01.md`,
    );
    expect(listing.status).toBe(200);
    const versions = (listing.body as { versions: { id: string; size: number }[] }).versions;
    expect(versions).toHaveLength(1);
    expect(versions[0]?.size).toBe(Buffer.byteLength('Chapter one.\n'));
    expect(await provider().readVersion('book', 'drafts/ch01.md', versions[0]?.id ?? '')).toBe(
      'Chapter one.\n',
    );
    const onDisk = await readdir(join(root(), 'drafts', '.versions', 'ch01.md'));
    expect(onDisk).toEqual([`${versions[0]?.id}.md`]);

    // A new draft has nothing to replace, so its apply writes no version.
    const created = changeOf(await propose('drafts/new.md', 'Brand new.\n', 'run-new'));
    expect(created.kind).toBe('create');
    expect(
      (await call(h, 'POST', projectPath('book', `/pending/${created.id}/accept`), {})).status,
    ).toBe(200);
    expect(
      (
        (await call(h, 'GET', `${projectPath('book', '/versions')}?draftPath=drafts%2Fnew.md`))
          .body as { versions: unknown[] }
      ).versions,
    ).toEqual([]);
  });

  // Acceptance 4: a host edit flags base-changed, apply is refused, refresh merges disjoint edits and keeps overlaps.
  it('acceptance 4: a host edit flags base-changed with pending-updated and refuses apply; refresh merges disjoint edits, and an overlap stays conflicted until reject', async () => {
    const stream = await openStream();
    try {
      const change = changeOf(
        await propose('sources/host.md', LINES.replace('line one', 'LINE ONE'), 'run-host'),
      );
      expect(await stream.nextEnvelope()).toMatchObject({ type: 'pending-created' });

      await writeFile(
        join(root(), 'sources', 'host.md'),
        LINES.replace('line six', 'line six host'),
      );

      const refused = await call(
        h,
        'POST',
        projectPath('book', `/pending/${change.id}/accept`),
        {},
      );
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({
        error: { code: 'PROJECT_PENDING_CONFLICT', details: { reason: 'base-changed' } },
      });
      expect(await stream.nextEnvelope()).toMatchObject({
        type: 'pending-updated',
        data: { id: change.id, conflict: { reason: 'base-changed' } },
      });

      const refreshed = await call(
        h,
        'POST',
        projectPath('book', `/pending/${change.id}/refresh`),
        {},
      );
      expect(refreshed.status).toBe(200);
      expect(changeOf(refreshed)).toMatchObject({
        conflict: null,
        proposed: LINES.replace('line one', 'LINE ONE').replace('line six', 'line six host'),
      });
      expect(await stream.nextEnvelope()).toMatchObject({
        type: 'pending-updated',
        data: { id: change.id, conflict: null },
      });
      expect(await readFile(join(root(), 'sources', 'host.md'), 'utf8')).toBe(
        LINES.replace('line six', 'line six host'),
      );

      const applied = await call(
        h,
        'POST',
        projectPath('book', `/pending/${change.id}/accept`),
        {},
      );
      expect(applied.status).toBe(200);
      expect(await readFile(join(root(), 'sources', 'host.md'), 'utf8')).toBe(
        LINES.replace('line one', 'LINE ONE').replace('line six', 'line six host'),
      );
    } finally {
      stream.close();
    }

    // An overlapping host edit: refresh keeps the conflict, and reject clears it from the queue.
    const clash = changeOf(
      await propose('sources/clash.md', LINES.replace('line one', 'CLASH ONE'), 'run-clash'),
    );
    await writeFile(join(root(), 'sources', 'clash.md'), LINES.replace('line one', 'HOST ONE'));
    expect(
      (await call(h, 'POST', projectPath('book', `/pending/${clash.id}/accept`), {})).status,
    ).toBe(409);
    const overlapping = await call(
      h,
      'POST',
      projectPath('book', `/pending/${clash.id}/refresh`),
      {},
    );
    expect(overlapping.status).toBe(409);
    expect(overlapping.body).toMatchObject({
      error: {
        code: 'PROJECT_PENDING_CONFLICT',
        details: { reason: 'base-changed', overlapping: true },
      },
    });
    const stillOpen = (await listed('sources/clash.md'))[0];
    expect(stillOpen?.conflict?.reason).toBe('base-changed');

    const rejected = await call(h, 'POST', projectPath('book', `/pending/${clash.id}/reject`), {});
    expect(rejected.status).toBe(200);
    expect(changeOf(rejected)).toMatchObject({ status: 'rejected' });
    expect(await listed('sources/clash.md')).toEqual([]);
    expect(
      (await call(h, 'POST', projectPath('book', `/pending/${clash.id}/accept`), {})).body,
    ).toMatchObject({ error: { code: 'PROJECT_PENDING_NOT_OPEN' } });
  });

  // Acceptance 5: accept-anyway needs the explicit confirmation and saves the overwritten content first.
  it('acceptance 5: accept-anyway needs confirm, and keeps the overwritten disk content as a version (a draft) or a backup (any other file)', async () => {
    const draft = changeOf(
      await propose('drafts/ch02.md', 'Chapter two, proposed.\n', 'run-any-draft'),
    );
    await writeFile(join(root(), 'drafts', 'ch02.md'), 'Chapter two, host edit.\n');
    expect(
      (await call(h, 'POST', projectPath('book', `/pending/${draft.id}/accept`), {})).status,
    ).toBe(409);

    const unconfirmed = await call(
      h,
      'POST',
      projectPath('book', `/pending/${draft.id}/accept-anyway`),
      {},
    );
    expect(unconfirmed.status).toBe(422);

    const forced = await call(
      h,
      'POST',
      projectPath('book', `/pending/${draft.id}/accept-anyway`),
      {
        confirm: true,
      },
    );
    expect(forced.status).toBe(200);
    expect(await readFile(join(root(), 'drafts', 'ch02.md'), 'utf8')).toBe(
      'Chapter two, proposed.\n',
    );
    const versions = (
      (await call(h, 'GET', `${projectPath('book', '/versions')}?draftPath=drafts%2Fch02.md`))
        .body as { versions: { id: string }[] }
    ).versions;
    expect(versions).toHaveLength(1);
    expect(await provider().readVersion('book', 'drafts/ch02.md', versions[0]?.id ?? '')).toBe(
      'Chapter two, host edit.\n',
    );

    const other = changeOf(
      await propose('sources/anyway.md', 'Anyway proposed.\n', 'run-any-file'),
    );
    await writeFile(join(root(), 'sources', 'anyway.md'), 'Anyway host edit.\n');
    expect(
      (
        await call(h, 'POST', projectPath('book', `/pending/${other.id}/accept-anyway`), {
          confirm: true,
        })
      ).status,
    ).toBe(200);
    expect(await readFile(join(root(), 'sources', 'anyway.md'), 'utf8')).toBe('Anyway proposed.\n');
    const backups = join(root(), '.scriba', 'backups');
    const stamps = await readdir(backups);
    const backedUp = await Promise.all(
      stamps.map((stamp) =>
        readFile(join(backups, stamp, 'sources', 'anyway.md'), 'utf8').catch(() => undefined),
      ),
    );
    expect(backedUp).toContain('Anyway host edit.\n');
  });

  // Acceptance 6: a proposed graphs/ file that fails the registered validator is refused.
  it('acceptance 6: a proposed graphs/ file that fails a registered validator is refused, and nothing is written', async () => {
    const validators = h.running.app.get(PendingValidators);
    const unregister = validators.register('graphs/', ({ content }) =>
      content.trimStart().startsWith('{') ? undefined : 'a graph must be a JSON object',
    );
    try {
      const refused = await propose('graphs/bad.json', 'not json', 'run-graph');
      expect(refused.status).toBe(422);
      expect(refused.body).toMatchObject({
        error: { code: 'PROJECT_VALIDATION_FAILED', message: 'a graph must be a JSON object' },
      });
      await expect(readFile(join(root(), 'graphs', 'bad.json'))).rejects.toThrow();

      const accepted = changeOf(
        await call(h, 'POST', projectPath('book', '/files/propose'), {
          op: 'write',
          path: 'graphs/good.json',
          content: '{"nodes":[]}\n',
          origin: { kind: 'recipe-run', runId: 'run-graph', nodeId: 'out' },
        }),
      );
      expect(accepted).toMatchObject({ kind: 'create', capturedBase: null, conflict: null });
    } finally {
      unregister();
    }
  });

  // Acceptance 8: restore saves the current content as a version before it writes the restored text.
  it('acceptance 8: restore saves the current content first, then writes the restored text', async () => {
    const change = changeOf(await propose('drafts/ch03.md', 'Three, revised.\n', 'run-restore'));
    expect(
      (await call(h, 'POST', projectPath('book', `/pending/${change.id}/accept`), {})).status,
    ).toBe(200);
    const [original] = (
      (await call(h, 'GET', `${projectPath('book', '/versions')}?draftPath=drafts%2Fch03.md`))
        .body as { versions: { id: string }[] }
    ).versions;
    expect(original).toBeDefined();

    await provider().restoreVersion('book', 'drafts/ch03.md', original?.id ?? '');
    expect(await readFile(join(root(), 'drafts', 'ch03.md'), 'utf8')).toBe('Three.\n');

    const after = (
      (await call(h, 'GET', `${projectPath('book', '/versions')}?draftPath=drafts%2Fch03.md`))
        .body as { versions: { id: string }[] }
    ).versions;
    expect(after).toHaveLength(2);
    const newest = after[0]?.id ?? '';
    expect(newest).not.toBe(original?.id);
    expect(await provider().readVersion('book', 'drafts/ch03.md', newest)).toBe(
      'Three, revised.\n',
    );
  });
});
