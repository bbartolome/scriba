import { z } from 'zod';
import { readSection, registerSettingsSection, writeSection } from '../../platform/index.js';

/** This module's section of `settings.yaml`, keyed by tool name (spec, "Per-tool enable switch"). */
export const TOOLS_SECTION = 'tools';

// The section has no migration steps yet. Registering it names the owner, so Platform's startup
// hook knows the section exists when a later version adds a step.
registerSettingsSection({ name: TOOLS_SECTION });

const ToolsSectionSchema = z.record(z.string(), z.object({ enabled: z.boolean() }));

/**
 * The author's enable overrides, by tool name. A section that does not match the shape is read as
 * empty, so a hand-edited file cannot stop every tool from loading. Toggling never forks a copy.
 */
export async function readOverrides(booksDir: string): Promise<Map<string, boolean>> {
  const raw = await readSection<unknown>(booksDir, TOOLS_SECTION);
  const parsed = ToolsSectionSchema.safeParse(raw);
  const overrides = new Map<string, boolean>();
  if (!parsed.success) return overrides;
  for (const [name, entry] of Object.entries(parsed.data)) {
    overrides.set(name, entry.enabled);
  }
  return overrides;
}

/** Sets one override, keeping the other overrides and the other sections. */
export async function writeOverride(
  booksDir: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  const current = await readOverrides(booksDir);
  current.set(name, enabled);
  await writeSection(
    booksDir,
    TOOLS_SECTION,
    Object.fromEntries([...current].map(([key, value]) => [key, { enabled: value }])),
  );
}
