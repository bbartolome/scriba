import { diffHunks, splitLines, type Hunk } from './diff.js';

/**
 * The three-way check of refresh (spec, "Conflict resolution"): base, proposed and disk. Each side is
 * compared with the base as hunks. When no hunk of one side overlaps a hunk of the other, both sets
 * apply to the base and the merge is clean. Overlapping hunks, or hunks that touch, leave the merge
 * unresolved. The rule is conservative, so a touching edit is never merged silently.
 */

/** A clean merge carries the merged text. An overlap carries nothing and leaves the change conflicted. */
export type MergeResult =
  { readonly clean: true; readonly text: string } | { readonly clean: false };

function touches(a: Hunk, b: Hunk): boolean {
  return a.baseStart <= b.baseEnd && b.baseStart <= a.baseEnd;
}

function sameHunk(a: Hunk, b: Hunk): boolean {
  return (
    a.baseStart === b.baseStart &&
    a.baseEnd === b.baseEnd &&
    a.lines.length === b.lines.length &&
    a.lines.every((line, i) => line === b.lines[i])
  );
}

/** Merges `ours` (the proposal) and `theirs` (the disk) against their common `base`. */
export function mergeThreeWay(base: string, ours: string, theirs: string): MergeResult {
  if (ours === theirs || theirs === base) {
    return { clean: true, text: ours };
  }
  if (ours === base) {
    return { clean: true, text: theirs };
  }
  const proposed = diffHunks(base, ours);
  const onDisk = diffHunks(base, theirs);
  const chosen: Hunk[] = [...proposed];
  for (const hunk of onDisk) {
    const identical = proposed.some((other) => sameHunk(other, hunk));
    if (identical) {
      continue;
    }
    if (proposed.some((other) => touches(other, hunk))) {
      return { clean: false };
    }
    chosen.push(hunk);
  }
  chosen.sort((a, b) => a.baseStart - b.baseStart || a.baseEnd - b.baseEnd);

  const baseLines = splitLines(base);
  const out: string[] = [];
  let at = 0;
  for (const hunk of chosen) {
    out.push(...baseLines.slice(at, hunk.baseStart), ...hunk.lines);
    at = hunk.baseEnd;
  }
  out.push(...baseLines.slice(at));
  return { clean: true, text: out.join('') };
}
