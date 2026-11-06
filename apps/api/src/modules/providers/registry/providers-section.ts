import {
  ProvidersSectionSchema,
  SEEDED_PROVIDERS_SECTION,
  type ProvidersSection,
} from '@bbartolome/scriba-contracts/providers';
import { readSection, writeSection } from '../../platform/index.js';

/** The top-level key of this module's section in `settings.yaml` (spec #19 "Registry and storage"). */
export const PROVIDERS_SECTION_NAME = 'providers';

/**
 * Reads the section, validated against the contract. Returns undefined when the section is absent.
 * Settings are read through Platform's helper, which refuses a file from a newer version.
 */
export async function readProvidersSection(
  booksDir: string,
): Promise<ProvidersSection | undefined> {
  const raw = await readSection<unknown>(booksDir, PROVIDERS_SECTION_NAME);
  if (raw === undefined) return undefined;
  const parsed = ProvidersSectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('The providers section in settings.yaml does not match its schema.');
  }
  return parsed.data;
}

/** Writes the section, keeping the other sections. The caller has validated it. */
export function writeProvidersSection(booksDir: string, section: ProvidersSection): Promise<void> {
  return writeSection(booksDir, PROVIDERS_SECTION_NAME, section);
}

/**
 * First-start seeding (spec #19 "First-start seeding"). When the section is absent, it is written
 * once, with the Ollama preset as `ollama` and the app default set to it. An existing section, even
 * an empty provider list, is left as it is, so a second boot changes no bytes. Returns whether it
 * wrote the section.
 */
export async function seedProvidersSection(booksDir: string): Promise<boolean> {
  const existing = await readSection<unknown>(booksDir, PROVIDERS_SECTION_NAME);
  if (existing !== undefined) return false;
  await writeSection(booksDir, PROVIDERS_SECTION_NAME, structuredClone(SEEDED_PROVIDERS_SECTION));
  return true;
}
