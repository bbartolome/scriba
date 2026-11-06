// Module-boundaries lint rule.
//
// A "unit" is an API module (apps/api/src/modules/<m>) or a web feature folder
// (apps/web/src/app/features/<f>). A unit may import another unit only through that unit's
// index.ts, and it may import contracts only through the ten @bbartolome/scriba-contracts/<module>
// subpaths. agent-loop and graph-runner may not import each other at all. Files outside a unit,
// such as the composition root, are not checked.

import path from 'node:path';

const CONTRACTS_PACKAGE = '@bbartolome/scriba-contracts';

/** The subpaths in packages/contracts/package.json "exports". The package has no root barrel. */
const CONTRACTS_SUBPATHS = [
  'platform',
  'setup-auth',
  'providers',
  'project-store',
  'tool-registry',
  'agent-loop',
  'graph-runner',
  'compile-export',
  'shell',
  'genre-packs',
];

/** Pairs of units that may not import each other in either direction, even through index.ts. */
const NO_IMPORTS_BETWEEN = [
  ['apps/api/src/modules/agent-loop', 'apps/api/src/modules/graph-runner'],
];

// Group 2 is the unit root. The lookahead stops it before the slash that follows, or at the end.
const UNIT_PATTERN =
  /(^|\/)((?:apps\/api\/src\/modules|apps\/web\/src\/app\/features)\/[^/]+)(?=\/|$)/;

// The rest of a path after its unit root is '' (the folder), or '/index', '/index.ts', ...
const INDEX_REST = /^(\/index(\.[cm]?[jt]s)?)?$/;

/**
 * Classifies an import specifier as a relative path, a contracts subpath, the root contracts
 * barrel, an unknown contracts subpath, or another package.
 */
function classifySpecifier(specifier) {
  if (specifier === CONTRACTS_PACKAGE) return 'contracts-root';
  if (specifier.startsWith(`${CONTRACTS_PACKAGE}/`)) {
    const subpath = specifier.slice(CONTRACTS_PACKAGE.length + 1);
    return CONTRACTS_SUBPATHS.includes(subpath) ? 'contracts-subpath' : 'contracts-unknown';
  }
  if (specifier.startsWith('.') || specifier.startsWith('/')) return 'relative';
  return 'package';
}

/**
 * Maps a file path to its unit. Returns null for files outside every unit. The repo path is the
 * part from apps/ on, so messages read the same on every machine.
 */
function locate(filename) {
  const normalized = filename.replace(/\\/g, '/');
  const match = UNIT_PATTERN.exec(normalized);
  if (!match) return null;
  const unit = match[2];
  const start = match.index + match[1].length;
  return {
    unit,
    repoPath: normalized.slice(start),
    isIndex: INDEX_REST.test(normalized.slice(start + unit.length)),
  };
}

function unitLabel(unit) {
  const name = unit.slice(unit.lastIndexOf('/') + 1);
  return unit.startsWith('apps/api/') ? `module ${name}` : `feature ${name}`;
}

function isForbiddenPair(a, b) {
  return NO_IMPORTS_BETWEEN.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

const moduleBoundaries = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Limit imports between API modules and web feature folders to their index.ts and to the contracts subpaths.',
    },
    schema: [],
    messages: {
      contractsRoot:
        "{{file}} imports the root contracts barrel '{{specifier}}'. The package has no root barrel. Import from @bbartolome/scriba-contracts/<module> instead.",
      contractsUnknown:
        "{{file}} imports '{{specifier}}', which is not one of the ten contracts subpaths (@bbartolome/scriba-contracts/<module>).",
      internalFile:
        "{{file}} (in {{source}}) imports '{{specifier}}', an internal file of {{target}}. Import from {{target}}'s index.ts instead.",
      noImportsBetween:
        "{{file}} (in {{source}}) imports '{{specifier}}' from {{target}}. {{source}} and {{target}} may not import each other, even through index.ts.",
    },
  },

  create(context) {
    const importer = locate(context.filename);
    if (!importer) return {};

    const file = importer.repoPath;
    const source = unitLabel(importer.unit);
    const importerDir = path.posix.dirname(context.filename.replace(/\\/g, '/'));

    function check(literal) {
      const specifier = literal.value;
      const kind = classifySpecifier(specifier);

      if (kind === 'contracts-root') {
        context.report({ node: literal, messageId: 'contractsRoot', data: { file, specifier } });
        return;
      }
      if (kind === 'contracts-unknown') {
        context.report({ node: literal, messageId: 'contractsUnknown', data: { file, specifier } });
        return;
      }
      if (kind !== 'relative') return;

      const target = locate(path.posix.resolve(importerDir, specifier));
      if (!target || target.unit === importer.unit) return;

      const data = { file, source, specifier, target: unitLabel(target.unit) };
      if (isForbiddenPair(importer.unit, target.unit)) {
        context.report({ node: literal, messageId: 'noImportsBetween', data });
      } else if (!target.isIndex) {
        context.report({ node: literal, messageId: 'internalFile', data });
      }
    }

    const isStringLiteral = (node) => node.type === 'Literal' && typeof node.value === 'string';

    return {
      ImportDeclaration(node) {
        check(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source);
      },
      ExportAllDeclaration(node) {
        check(node.source);
      },
      // Only a string literal can be resolved statically. Computed specifiers are skipped.
      ImportExpression(node) {
        if (isStringLiteral(node.source)) check(node.source);
      },
    };
  },
};

export default moduleBoundaries;
