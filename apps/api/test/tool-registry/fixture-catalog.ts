import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  ToolSpecSchema,
  type Origin,
  type ToolSpec,
} from '@bbartolome/scriba-contracts/tool-registry';
import type {
  ActiveProject,
  LoadedTool,
  ToolSource,
} from '../../src/modules/tool-registry/executor/index.js';

/**
 * DOCUMENTED FAKE for the catalog service. The loader and lint lane (phase:loader-validation) is
 * not on main, so the executor's tests load the fixture packs themselves. The fake reads each YAML
 * file, parses it with the contract's envelope schema, and marks a file that does not parse, or
 * whose name differs from its `name`, as invalid. It applies no lint, no migration and no
 * settings override. The loader replaces it when it lands.
 *
 * Origins are the folder names. Where two origins share a name, the later one wins, as user over
 * built-in does.
 */

/** Fixture packs for the executor, one folder per origin. Unit tests keep their own fixtures. */
export const FIXTURE_PACKS_DIR = fileURLToPath(
  new URL('../fixtures/packs/executor/', import.meta.url),
);

const FIXTURE_ORIGINS: readonly Origin[] = ['core', 'nonfiction', 'fiction', 'user'];

/** The project the fake active-project source reports: a nonfiction project. */
export const FIXTURE_PROJECT: ActiveProject = { id: 'fixture-project', genrePack: 'nonfiction' };

export async function loadFixtureCatalog(dir: string = FIXTURE_PACKS_DIR): Promise<ToolSource> {
  const tools = new Map<string, LoadedTool>();
  for (const origin of FIXTURE_ORIGINS) {
    const folder = join(dir, origin, 'tools');
    const files = (await readdir(folder)).filter((file) => file.endsWith('.yaml')).sort();
    for (const file of files) {
      const name = file.slice(0, -'.yaml'.length);
      const raw: unknown = parse(await readFile(join(folder, file), 'utf8'));
      const parsed = ToolSpecSchema.safeParse(raw);
      if (parsed.success && parsed.data.name === name) {
        tools.set(name, toValid(name, origin, parsed.data));
      } else {
        const enabled =
          typeof raw === 'object' && raw !== null && 'enabled' in raw
            ? (raw as { enabled: unknown }).enabled !== false
            : true;
        tools.set(name, { valid: false, name, origin, enabled });
      }
    }
  }
  return {
    find: async (name) => tools.get(name),
    list: async () => [...tools.values()],
  };
}

function toValid(name: string, origin: Origin, spec: ToolSpec): LoadedTool {
  return { valid: true, name, origin, enabled: spec.enabled, spec };
}
