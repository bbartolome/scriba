import { readFileSync } from 'node:fs';
import { RuleTester } from 'eslint';
import { parser as tsParser } from 'typescript-eslint';
import { describe, it } from 'vitest';
// The rule is plain ESM under tools/eslint, outside this workspace. It has no type declarations.
import moduleBoundaries from '../../../tools/eslint/module-boundaries.mjs';

// ESLint's RuleTester finds describe and it through globals, which Vitest does not set.
RuleTester.describe = describe;
RuleTester.it = it;

// The rule reads paths only. These files do not need to exist.
const API = '/repo/apps/api/src';
const WEB = '/repo/apps/web/src/app';

// Every subpath the contracts package exports must pass, so the rule's list cannot drift from it.
const contractsExports = JSON.parse(
  readFileSync(new URL('../../../packages/contracts/package.json', import.meta.url), 'utf8'),
).exports as Record<string, unknown>;
const contractsSubpathCases = Object.keys(contractsExports).map((key) => ({
  filename: `${API}/modules/platform/config/build-info.ts`,
  code: `import '@bbartolome/scriba-contracts/${key.replace(/^\.\//, '')}';`,
}));

const ruleTester = new RuleTester({ languageOptions: { parser: tsParser } });

ruleTester.run('module-boundaries', moduleBoundaries, {
  valid: [
    ...contractsSubpathCases,
    {
      // A contracts subpath is the one allowed channel for shared shapes.
      filename: `${API}/modules/platform/config/build-info.ts`,
      code: "import { SemverSchema } from '@bbartolome/scriba-contracts/platform';",
    },
    {
      // A relative import inside the same module is always allowed.
      filename: `${API}/modules/platform/boot/pre-listen.ts`,
      code: "import { parseScribaEnv } from '../config/env.js';",
    },
    {
      // Another module's index.ts is its public surface.
      filename: `${API}/modules/platform/controller/health.controller.ts`,
      code: "import { ProjectStore } from '../../project-store/index.js';",
    },
    {
      // Another module's index.ts reached through a dynamic import.
      filename: `${API}/modules/platform/index.ts`,
      code: "export const load = () => import('../project-store/index.js');",
    },
    {
      // Owner item 24: index.ts may export a DI token, a type and a test fake.
      filename: `${API}/modules/project-store/index.ts`,
      code: [
        "export { PROJECT_STORE } from './tokens.js';",
        "export type { ProjectStore } from './types.js';",
        "export { FakeProjectStore } from './testing/fake-project-store.js';",
      ].join('\n'),
    },
    {
      // The composition root is outside every module, so it may import a module through its index.
      filename: `${API}/app.module.ts`,
      code: "import { PlatformModule } from './modules/platform/index.js';",
    },
    {
      // The composition root is not checked. main.ts imports platform internals today, and that is
      // deliberately not flagged.
      filename: `${API}/main.ts`,
      code: "import { parseScribaEnv } from './modules/platform/config/env.js';",
    },
    {
      // agent-loop and graph-runner may use each other's contracts subpaths. Only module code is
      // barred.
      filename: `${API}/modules/agent-loop/run.ts`,
      code: "import type { GraphRunnerInput } from '@bbartolome/scriba-contracts/graph-runner';",
    },
    {
      // A web feature may import another feature through its index.
      filename: `${WEB}/features/shell/shell.ts`,
      code: "import { EditorPane } from '../editor/index';",
    },
    {
      // Angular imports a folder without a file name. The folder resolves to its index.
      filename: `${WEB}/features/shell/shell.ts`,
      code: "import { EditorPane } from '../editor';",
    },
    {
      // A feature may import its own internal files.
      filename: `${WEB}/features/shell/shell.ts`,
      code: "import { navItems } from './nav/items';",
    },
    {
      // Files outside every unit are not checked.
      filename: `${WEB}/app.ts`,
      code: "import { EditorView } from './features/editor/components/editor-view';",
    },
    {
      // Other packages are not restricted.
      filename: `${API}/modules/platform/events/publisher.ts`,
      code: "import { Injectable } from '@nestjs/common';\nimport { randomUUID } from 'node:crypto';",
    },
  ],

  invalid: [
    {
      filename: `${API}/modules/platform/controller/health.controller.ts`,
      // From modules/platform/controller, '../..' reaches modules/. A single '..' stays in platform.
      code: "import { foo } from '../../other/services/foo.js';",
      errors: [
        {
          messageId: 'internalFile',
          data: {
            file: 'apps/api/src/modules/platform/controller/health.controller.ts',
            source: 'module platform',
            target: 'module other',
            specifier: '../../other/services/foo.js',
          },
        },
      ],
    },
    {
      // A type-only import of an internal file is flagged too.
      filename: `${API}/modules/platform/controller/health.controller.ts`,
      code: "import type { Foo } from '../../other/types.js';",
      errors: [{ messageId: 'internalFile' }],
    },
    {
      // A dynamic import of an internal file is flagged.
      filename: `${API}/modules/platform/controller/health.controller.ts`,
      code: "export const load = () => import('../../other/services/foo.js');",
      errors: [{ messageId: 'internalFile' }],
    },
    {
      // A re-export of an internal file from another module is flagged.
      filename: `${API}/modules/platform/index.ts`,
      code: "export { foo } from '../other/services/foo.js';",
      errors: [{ messageId: 'internalFile' }],
    },
    {
      // agent-loop may not import graph-runner's index.ts.
      filename: `${API}/modules/agent-loop/run.ts`,
      code: "import { startGraph } from '../graph-runner/index.js';",
      errors: [
        {
          messageId: 'noImportsBetween',
          data: {
            file: 'apps/api/src/modules/agent-loop/run.ts',
            source: 'module agent-loop',
            target: 'module graph-runner',
            specifier: '../graph-runner/index.js',
          },
        },
      ],
    },
    {
      // graph-runner may not import agent-loop's index.ts.
      filename: `${API}/modules/graph-runner/run.ts`,
      code: "import { runLoop } from '../agent-loop/index.js';",
      errors: [
        {
          messageId: 'noImportsBetween',
          data: {
            file: 'apps/api/src/modules/graph-runner/run.ts',
            source: 'module graph-runner',
            target: 'module agent-loop',
            specifier: '../agent-loop/index.js',
          },
        },
      ],
    },
    {
      // The agent-loop and graph-runner pair is barred even for internal files.
      filename: `${API}/modules/agent-loop/run.ts`,
      code: "import { helper } from '../graph-runner/services/helper.js';",
      errors: [{ messageId: 'noImportsBetween' }],
    },
    {
      // The root barrel is forbidden.
      filename: `${API}/modules/platform/config/build-info.ts`,
      code: "import { AppVersionInfoSchema } from '@bbartolome/scriba-contracts';",
      errors: [
        {
          messageId: 'contractsRoot',
          data: {
            file: 'apps/api/src/modules/platform/config/build-info.ts',
            specifier: '@bbartolome/scriba-contracts',
          },
        },
      ],
    },
    {
      // The root barrel is forbidden in a re-export too.
      filename: `${API}/modules/project-store/index.ts`,
      code: "export * from '@bbartolome/scriba-contracts';",
      errors: [{ messageId: 'contractsRoot' }],
    },
    {
      // A subpath that is not one of the ten is forbidden.
      filename: `${API}/modules/platform/config/build-info.ts`,
      code: "import { parseScribaEnv } from '@bbartolome/scriba-contracts/platform/env';",
      errors: [{ messageId: 'contractsUnknown' }],
    },
    {
      // A web feature may not import another feature's internal file.
      filename: `${WEB}/features/shell/shell.ts`,
      code: "import { EditorView } from '../editor/components/editor-view';",
      errors: [
        {
          messageId: 'internalFile',
          data: {
            file: 'apps/web/src/app/features/shell/shell.ts',
            source: 'feature shell',
            target: 'feature editor',
            specifier: '../editor/components/editor-view',
          },
        },
      ],
    },
  ],
});
