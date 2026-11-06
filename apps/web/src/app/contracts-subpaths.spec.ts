import { describe, expect, it } from 'vitest';
// Static imports on purpose: the Angular build must resolve each of the ten subpaths at compile
// time. The package has no root barrel, so none of these may be imported from the package root.
import * as platform from '@bbartolome/scriba-contracts/platform';
import * as setupAuth from '@bbartolome/scriba-contracts/setup-auth';
import * as providers from '@bbartolome/scriba-contracts/providers';
import * as projectStore from '@bbartolome/scriba-contracts/project-store';
import * as toolRegistry from '@bbartolome/scriba-contracts/tool-registry';
import * as agentLoop from '@bbartolome/scriba-contracts/agent-loop';
import * as graphRunner from '@bbartolome/scriba-contracts/graph-runner';
import * as compileExport from '@bbartolome/scriba-contracts/compile-export';
import * as shell from '@bbartolome/scriba-contracts/shell';
import * as genrePacks from '@bbartolome/scriba-contracts/genre-packs';

describe('contracts subpaths in the Angular build', () => {
  it('resolves all ten subpaths to modules', () => {
    for (const mod of [
      platform,
      setupAuth,
      providers,
      projectStore,
      toolRegistry,
      agentLoop,
      graphRunner,
      compileExport,
      shell,
      genrePacks,
    ]) {
      expect(typeof mod).toBe('object');
    }
  });

  it('exposes the Platform stream route from the platform subpath', () => {
    expect(platform.EVENTS_ROUTE).toBe('/events');
  });
});
