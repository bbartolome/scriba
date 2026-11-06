import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectStoreProvider } from '../../src/modules/project-store/index.js';
import { call, startHarness, type Harness, ROUTES, projectPath } from './support.js';

/**
 * The in-process log methods the Agent loop uses (survey 23 §1): an append and a read limited to
 * `logs/`, and the project-switch hook. The file API's HTTP routes are unchanged.
 */
describe('project store: logs/ for the app, and the switch hook', () => {
  let harness: Harness;
  let provider: ProjectStoreProvider;

  beforeEach(async () => {
    harness = await startHarness();
    provider = harness.running.app.get(ProjectStoreProvider);
    await call(harness, 'POST', ROUTES.newProject.path, { title: 'Logs', folderName: 'logs-book' });
    await call(harness, 'POST', projectPath('logs-book', '/activate'), {});
  });

  afterEach(async () => {
    await harness.close();
  });

  it('appends and reads a file under logs/, creating its folder', async () => {
    await provider.appendLog('logs-book', 'logs/agent-runs/a.jsonl', '{"n":1}\n');
    await provider.appendLog('logs-book', 'logs/agent-runs/a.jsonl', '{"n":2}\n');
    expect(await provider.readLog('logs-book', 'logs/agent-runs/a.jsonl')).toBe(
      '{"n":1}\n{"n":2}\n',
    );
    expect(
      await readFile(
        join(harness.library.booksDir, 'logs-book', 'logs', 'agent-runs', 'a.jsonl'),
        'utf8',
      ),
    ).toBe('{"n":1}\n{"n":2}\n');
    expect(await provider.readLog('logs-book', 'logs/agent-runs/missing.jsonl')).toBeUndefined();
  });

  it('refuses any path that is not inside logs/, and any escape from it', async () => {
    for (const path of [
      'drafts/ch01.md',
      'logs',
      '../logs/x.jsonl',
      'logs/../drafts/x.md',
      '.scriba/x.jsonl',
    ]) {
      await expect(provider.appendLog('logs-book', path, 'x')).rejects.toMatchObject({
        status: expect.any(Number),
      });
      await expect(provider.readLog('logs-book', path)).rejects.toBeDefined();
    }
  });

  it('calls a switch listener once per activation, and stops calling it after it is removed', async () => {
    const seen: string[] = [];
    const remove = provider.onProjectSwitched((projectId) => seen.push(projectId));
    await call(harness, 'POST', ROUTES.newProject.path, {
      title: 'Other',
      folderName: 'other-book',
    });
    await call(harness, 'POST', projectPath('other-book', '/activate'), {});
    remove();
    await call(harness, 'POST', projectPath('logs-book', '/activate'), {});
    expect(seen).toEqual(['other-book']);
  });
});
