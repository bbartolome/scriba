import { cp, mkdir, readFile, realpath, stat, writeFile, lstat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import {
  ProjectIdSchema,
  ProjectSlugSchema,
  type NewProjectRequest,
  type ProjectSummary,
  type StartFromSampleRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { ApiException, readSection } from '../platform/index.js';
import { ActiveProjectStore } from './active-project.service.js';
import { PROJECT_STORE_CONFIG, type ProjectStoreConfig, samplePath } from './config.js';
import { projectError } from './errors.js';
import {
  DEFAULT_GENRE_PACK,
  minimalProjectYaml,
  readProjectYaml,
  setTopLevelScalars,
  type ProjectYamlReading,
} from './project-yaml.document.js';
import { FileLocks } from './locks.js';
import { ProjectStoreEvents } from './events.js';
import { writeAtomically, sweepTempFiles } from './atomic-write.js';
import {
  guardProjectPath,
  isWithin,
  listNames,
  removeTree,
  type ProjectLocation,
} from './path-guard.js';

/** Folders a new project gets: the layout without `structure/` (spec, "Creating projects"). */
// provisional: survey 20 §7 item 3
export const NEW_PROJECT_FOLDERS = ['sources', 'entities', 'drafts', 'graphs', 'logs'] as const;

/** The line `.gitignore` must hold so that pending changes and state stay out of git (spec). */
export const GITIGNORE_LINE = '.scriba/';

/** Sample folders are named like project folder slugs. A sample id never carries a separator. */
const SAMPLE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Sample folders whose contents are not copied: app state, logs, snapshots and draft versions (spec). */
const SAMPLE_EXCLUDED_TOP = new Set(['.scriba', 'logs', 'snapshots']);

/** What a project folder holds: no `project.yaml` (importable), or what its `project.yaml` says. */
export type ProjectState = { readonly status: 'importable' } | ProjectYamlReading;

function toSummary(id: string, active: boolean, state: ProjectState): ProjectSummary {
  switch (state.status) {
    case 'importable':
      return { id, active, status: 'importable' };
    case 'too-new':
      return { id, active, status: 'too-new', schemaVersion: state.schemaVersion };
    case 'ok':
      return {
        id,
        active,
        status: 'ok',
        title: state.title,
        genrePack: state.genrePack,
        schemaVersion: state.schemaVersion,
      };
    case 'invalid':
      return {
        id,
        active,
        status: 'invalid',
        ...(state.title === undefined ? {} : { title: state.title }),
        ...(state.genrePack === undefined ? {} : { genrePack: state.genrePack }),
        ...(state.schemaVersion === undefined ? {} : { schemaVersion: state.schemaVersion }),
        issues: state.issues,
      };
  }
}

/** A folder name from a title: lowercase letters and digits, joined by single hyphens. [proposed] */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 0)
    .join('-');
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/**
 * Keeps a sample's own folders out of a copy. The rule matches the spec's exclusions, compared
 * case-insensitively, so a `.SCRIBA` folder is excluded as well.
 */
// provisional: survey 20 §7 item 14 (d): samples ship no .scriba/, logs/, snapshots/ or .versions/
function keepSampleEntry(sampleRoot: string, source: string): boolean {
  const rel = relative(sampleRoot, source);
  if (rel === '') {
    return true;
  }
  const segments = rel.split(sep).map((segment) => segment.toLowerCase());
  if (SAMPLE_EXCLUDED_TOP.has(segments[0] ?? '')) {
    return false;
  }
  return !(segments[0] === 'drafts' && segments[1] === '.versions');
}

/**
 * Discovery, statuses and the project lifecycle: New, Import, Start from sample and Activate (spec,
 * "Library and discovery", "Creating projects", "One active project"). Every path it touches goes
 * through the one path guard.
 */
@Injectable()
export class LibraryService {
  constructor(
    @Inject(PROJECT_STORE_CONFIG) private readonly config: ProjectStoreConfig,
    private readonly active: ActiveProjectStore,
    private readonly events: ProjectStoreEvents,
    private readonly locks: FileLocks,
  ) {}

  /** Every immediate, non-dot subfolder of the library, with its status. Never recurses. */
  async list(): Promise<ProjectSummary[]> {
    const activeId = await this.active.get();
    const summaries: ProjectSummary[] = [];
    // provisional: survey 20 §7 item 19 (the id is the folder name, read again on every list)
    for (const name of (await listNames(this.config.booksDir)).sort()) {
      if (name.startsWith('.') || !ProjectIdSchema.safeParse(name).success) {
        continue;
      }
      const location = await this.topLevelLocation(name);
      if (location === undefined) {
        continue;
      }
      summaries.push(toSummary(name, name === activeId, await this.readState(location)));
    }
    return summaries;
  }

  /** The project folder for an id, or PROJECT_NOT_FOUND. A folder that links out of the library is not a project. */
  async locate(projectId: string): Promise<ProjectLocation> {
    const location = ProjectIdSchema.safeParse(projectId).success
      ? await this.topLevelLocation(projectId)
      : undefined;
    if (location === undefined) {
      throw projectError('PROJECT_NOT_FOUND', 'No project has that id.');
    }
    return location;
  }

  /**
   * The gate every project-scoped request passes (spec, "One active project"). A request for a
   * project that is not active fails, so a run started before a switch cannot write into the new
   * active project.
   */
  async requireActive(projectId: string): Promise<ProjectLocation> {
    const activeId = await this.active.get();
    if (activeId === undefined) {
      throw projectError('PROJECT_NO_ACTIVE', 'No project is active. Activate a project first.');
    }
    // provisional: survey 20 §7 item 23 (the library-wide rule: a non-active project is refused, not switched to)
    if (activeId !== projectId) {
      throw projectError('PROJECT_NOT_ACTIVE', 'That project is not the active project.');
    }
    return this.locate(projectId);
  }

  /** New: a scaffold with the layout, `project.yaml` and `.gitignore`. Nothing is activated. */
  async create(request: NewProjectRequest): Promise<ProjectSummary> {
    const folderName = request.folderName ?? slugFromTitle(request.title);
    if (!ProjectSlugSchema.safeParse(folderName).success) {
      throw projectError(
        'PROJECT_VALIDATION_FAILED',
        'The folder name must be a slug of lowercase letters, digits and single hyphens.',
      );
    }
    const dir = join(this.config.booksDir, folderName);
    if (await exists(dir)) {
      throw projectError('PROJECT_EXISTS', 'A folder with that name already exists.');
    }
    // provisional: survey 20 §7 item 24 (the pack name is free text; the Tool registry warns on unknown names)
    const genrePack = request.genrePack ?? (await this.defaultGenrePack());

    await mkdir(dir).catch((error: unknown) => {
      throw existsOrRethrow(error);
    });
    try {
      for (const folder of NEW_PROJECT_FOLDERS) {
        await mkdir(join(dir, folder));
      }
      await writeFile(join(dir, 'project.yaml'), minimalProjectYaml(request.title, genrePack), {
        flag: 'wx',
      });
      await writeFile(join(dir, '.gitignore'), `${GITIGNORE_LINE}\n`, { flag: 'wx' });
    } catch (error) {
      await removeTree(dir);
      throw error;
    }
    return this.summaryOf(await this.locate(folderName));
  }

  /**
   * Import: validates `project.yaml`, or creates a minimal one for an importable folder. It appends
   * `.scriba/` to `.gitignore` only when that line is missing. An invalid or too-new folder is left
   * untouched (survey 20 §7 items 8 and 9).
   */
  async importProject(projectId: string): Promise<ProjectSummary> {
    const location = await this.locate(projectId);
    const state = await this.readState(location);
    if (state.status === 'invalid') {
      throw projectError(
        'PROJECT_INVALID',
        'project.yaml is not valid. Nothing was changed; fix the listed issues and import again.',
        { issues: state.issues },
      );
    }
    if (state.status === 'too-new') {
      throw projectError(
        'PROJECT_SCHEMA_TOO_NEW',
        `project.yaml has schemaVersion ${state.schemaVersion}, which this app does not support. Nothing was changed.`,
        { schemaVersion: state.schemaVersion },
      );
    }
    if (state.status === 'importable') {
      // provisional: survey 20 §7 item 9 (a minimal import writes the nonfiction pack)
      // provisional: survey 20 §7 item 8 (import writes project.yaml only when it is missing)
      const guarded = await guardProjectPath(location, 'project.yaml');
      await writeAtomically(
        guarded.realPath,
        Buffer.from(minimalProjectYaml(projectId, DEFAULT_GENRE_PACK), 'utf8'),
      );
    }
    await this.ensureGitignoreLine(location);
    return this.summaryOf(location);
  }

  /**
   * Start from sample: copies a sample folder under the chosen name and sets its title. Nothing is
   * copied at startup (spec, "Creating projects"). The copy skips app state, logs and snapshots.
   */
  async startFromSample(request: StartFromSampleRequest): Promise<ProjectSummary> {
    if (!SAMPLE_ID.test(request.sampleId)) {
      throw projectError('PROJECT_NOT_FOUND', 'No sample has that id.');
    }
    const sampleDir = samplePath(this.config, request.sampleId);
    const sampleInfo = await stat(sampleDir).catch(() => undefined);
    if (!sampleInfo?.isDirectory()) {
      throw projectError('PROJECT_NOT_FOUND', 'No sample has that id.');
    }
    const sample: ProjectLocation = {
      id: request.sampleId,
      dir: sampleDir,
      realDir: await realpath(sampleDir),
    };
    const sampleState = await this.readState(sample);
    if (sampleState.status !== 'ok') {
      throw projectError('PROJECT_INVALID', 'The sample project.yaml is not valid.');
    }

    const target = join(this.config.booksDir, request.folderName);
    if (await exists(target)) {
      throw projectError('PROJECT_EXISTS', 'A folder with that name already exists.');
    }
    try {
      await cp(sampleDir, target, {
        recursive: true,
        errorOnExist: true,
        force: false,
        dereference: false,
        filter: (source) => keepSampleEntry(sampleDir, source),
      });
      const yamlPath = join(target, 'project.yaml');
      const text = await readFile(yamlPath, 'utf8');
      await writeAtomically(
        yamlPath,
        Buffer.from(setTopLevelScalars(text, { title: request.title }), 'utf8'),
      );
    } catch (error) {
      await removeTree(target);
      throw error;
    }
    return this.summaryOf(await this.locate(request.folderName));
  }

  /**
   * Activate: the project must hold a valid, current `project.yaml`. A too-new file cannot be
   * activated. The switch is saved, and `project.switched` is published when the active project changes.
   */
  async activate(projectId: string): Promise<ProjectSummary> {
    const location = await this.locate(projectId);
    const state = await this.readState(location);
    if (state.status === 'too-new') {
      throw projectError(
        'PROJECT_SCHEMA_TOO_NEW',
        `project.yaml has schemaVersion ${state.schemaVersion}, which this app does not support. The project cannot be activated.`,
        { schemaVersion: state.schemaVersion },
      );
    }
    if (state.status === 'invalid') {
      throw projectError(
        'PROJECT_INVALID',
        'project.yaml is not valid. The project cannot be activated.',
        {
          issues: state.issues,
        },
      );
    }
    if (state.status === 'importable') {
      throw projectError(
        'PROJECT_INVALID',
        'The folder has no project.yaml. Import it before activating.',
        { status: 'importable' },
      );
    }
    // provisional: survey 20 §7 item 1 (activation is where a project's migrations run; none exist before phase:migrations)
    // provisional: survey 20 §7 item 17 (leftover temp files in drafts/ are swept on activation)
    await this.sweepDrafts(location);
    const previous = await this.active.get();
    await this.active.set(projectId);
    if (previous !== projectId) {
      this.events.projectSwitched(projectId);
    }
    return this.summaryOf(location);
  }

  /** The summary of one project as it now stands, with its active flag. */
  async summaryOf(location: ProjectLocation): Promise<ProjectSummary> {
    const activeId = await this.active.get();
    return toSummary(location.id, activeId === location.id, await this.readState(location));
  }

  /** The state of a project folder: importable, or what its `project.yaml` says. Reads only. */
  async readState(location: ProjectLocation): Promise<ProjectState> {
    let guarded;
    try {
      guarded = await guardProjectPath(location, 'project.yaml');
    } catch {
      return {
        status: 'invalid',
        issues: [{ path: '', message: 'project.yaml points outside the project folder' }],
      };
    }
    if (!guarded.exists) {
      return { status: 'importable' };
    }
    let text: string;
    try {
      text = await readFile(guarded.realPath, 'utf8');
    } catch {
      return { status: 'invalid', issues: [{ path: '', message: 'project.yaml cannot be read' }] };
    }
    return readProjectYaml(text);
  }

  private async topLevelLocation(id: string): Promise<ProjectLocation | undefined> {
    const dir = join(this.config.booksDir, id);
    const info = await stat(dir).catch(() => undefined);
    if (!info?.isDirectory()) {
      return undefined;
    }
    const realDir = await realpath(dir);
    const realBooks = await realpath(this.config.booksDir);
    if (realDir === realBooks || !isWithin(realBooks, realDir)) {
      return undefined;
    }
    return { id, dir, realDir };
  }

  /** The genre pack for New when the request names none (survey 20 §7 item 9). */
  private async defaultGenrePack(): Promise<string> {
    const preferences = await readSection<{ defaultGenrePack?: unknown }>(
      this.config.booksDir,
      'preferences',
    );
    const pack = preferences?.defaultGenrePack;
    return typeof pack === 'string' && pack.length > 0 ? pack : DEFAULT_GENRE_PACK;
  }

  /** Adds `.scriba/` to `.gitignore` when that line is missing. Creates the file when it is absent. */
  // provisional: survey 20 §7 item 8 (the only other file import may change)
  private async ensureGitignoreLine(location: ProjectLocation): Promise<void> {
    const guarded = await guardProjectPath(location, '.gitignore');
    const key = `gitignore:${guarded.realPath}`;
    await this.locks.run(key, async () => {
      const text = guarded.exists ? await readFile(guarded.realPath, 'utf8') : undefined;
      if (
        text !== undefined &&
        text.split(/\r?\n/).some((line) => line.trim() === GITIGNORE_LINE)
      ) {
        return;
      }
      const base = text ?? '';
      const separator = base.length === 0 || base.endsWith('\n') ? '' : '\n';
      await writeAtomically(
        guarded.realPath,
        Buffer.from(`${base}${separator}${GITIGNORE_LINE}\n`, 'utf8'),
      );
    });
  }

  private async sweepDrafts(location: ProjectLocation): Promise<void> {
    try {
      const drafts = await guardProjectPath(location, 'drafts');
      if (drafts.exists) {
        await sweepTempFiles(drafts.realPath);
      }
    } catch (error) {
      // A drafts folder that links out of the project is not swept. Anything else is a real failure.
      if (!(error instanceof ApiException)) {
        throw error;
      }
    }
  }
}

function existsOrRethrow(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'EEXIST') {
    return projectError('PROJECT_EXISTS', 'A folder with that name already exists.');
  }
  return error;
}
