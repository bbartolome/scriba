import { describe, expect, it } from 'vitest';
import {
  ActivateProjectRequestSchema,
  ImportProjectRequestSchema,
  NewProjectRequestSchema,
  ProjectIdSchema,
  ProjectListResponseSchema,
  ProjectRelativePathSchema,
  ProjectResponseSchema,
  ProjectSlugSchema,
  ProjectStatusSchema,
  ProjectSummarySchema,
  StartFromSampleRequestSchema,
} from '../../src/project-store/index.js';

/** Project summary, status and the library requests (survey §4, phase:contract). */

describe('project status and summary', () => {
  it('has exactly the four statuses from the spec', () => {
    for (const status of ['ok', 'invalid', 'too-new', 'importable']) {
      expect(ProjectStatusSchema.safeParse(status).success, status).toBe(true);
    }
    expect(ProjectStatusSchema.safeParse('broken').success).toBe(false);
  });

  it('describes an importable folder with no title, pack or schema version', () => {
    const summary = { id: 'manuscript', active: false, status: 'importable' };
    expect(ProjectSummarySchema.parse(summary)).toEqual(summary);
  });

  it('describes an ok project with its title, pack and active flag', () => {
    const summary = {
      id: 'demo-book',
      title: 'Demo book',
      genrePack: 'nonfiction',
      active: true,
      status: 'ok',
    };
    expect(ProjectSummarySchema.parse(summary)).toEqual(summary);
  });

  it('carries the schema problems on an invalid project and the version on a too-new one', () => {
    const invalid = {
      id: 'bad',
      active: false,
      status: 'invalid',
      issues: [{ path: 'schemaVersion', message: 'Required' }],
    };
    const tooNew = { id: 'future', active: false, status: 'too-new', schemaVersion: 9 };
    expect(ProjectSummarySchema.parse(invalid)).toEqual(invalid);
    expect(ProjectSummarySchema.parse(tooNew)).toEqual(tooNew);
  });

  it('round-trips the list and single-project response envelopes', () => {
    const summary = {
      id: 'demo-book',
      title: 'Demo',
      genrePack: 'nonfiction',
      active: true,
      status: 'ok',
    };
    expect(ProjectListResponseSchema.parse({ projects: [summary] })).toEqual({
      projects: [summary],
    });
    expect(ProjectResponseSchema.parse({ project: summary })).toEqual({ project: summary });
  });
});

describe('project identifiers', () => {
  it('takes any legal folder name as a project id, but never a dot-folder', () => {
    expect(ProjectIdSchema.safeParse('My Book (2026)').success).toBe(true);
    expect(ProjectIdSchema.safeParse('.scriba').success).toBe(false);
    expect(ProjectIdSchema.safeParse('.').success).toBe(false);
    expect(ProjectIdSchema.safeParse('..').success).toBe(false);
    expect(ProjectIdSchema.safeParse('a/b').success).toBe(false);
    expect(ProjectIdSchema.safeParse('a\\b').success).toBe(false);
    expect(ProjectIdSchema.safeParse('').success).toBe(false);
  });

  it('takes only lowercase letters, digits and hyphens for a new folder name', () => {
    expect(ProjectSlugSchema.safeParse('demo-book-2').success).toBe(true);
    expect(ProjectSlugSchema.safeParse('Demo Book').success).toBe(false);
    expect(ProjectSlugSchema.safeParse('-leading').success).toBe(false);
    expect(ProjectSlugSchema.safeParse('double--hyphen').success).toBe(false);
  });
});

describe('library requests', () => {
  it('takes a folder name and a title for New, with the pack and folder name optional', () => {
    expect(NewProjectRequestSchema.parse({ folderName: 'demo', title: 'Demo' })).toEqual({
      folderName: 'demo',
      title: 'Demo',
    });
    expect(NewProjectRequestSchema.safeParse({ title: 'Derived from title' }).success).toBe(true);
    expect(NewProjectRequestSchema.parse({ title: 'T', genrePack: 'fiction' }).genrePack).toBe(
      'fiction',
    );
    expect(NewProjectRequestSchema.safeParse({ folderName: 'demo' }).success).toBe(false);
    expect(
      NewProjectRequestSchema.safeParse({ folderName: 'Not A Slug', title: 'T' }).success,
    ).toBe(false);
  });

  it('takes a sample, a folder name and a title for Start from sample', () => {
    const request = { sampleId: 'nonfiction', folderName: 'demo-book', title: 'Demo book' };
    expect(StartFromSampleRequestSchema.parse(request)).toEqual(request);
    expect(
      StartFromSampleRequestSchema.safeParse({ sampleId: 'nonfiction', title: 'T' }).success,
    ).toBe(false);
  });

  it('has an empty body for Import and Activate, since the route names the project', () => {
    expect(ImportProjectRequestSchema.safeParse({}).success).toBe(true);
    expect(ImportProjectRequestSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(ActivateProjectRequestSchema.safeParse({}).success).toBe(true);
    expect(ActivateProjectRequestSchema.safeParse({ projectId: 'x' }).success).toBe(false);
  });

  it('keeps the project-relative path rules that the file API and New rely on', () => {
    for (const bad of ['/abs', '../up', 'a\\b', 'a\u0000b', 'a//b', 'a/']) {
      expect(ProjectRelativePathSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(ProjectRelativePathSchema.safeParse('drafts/ch03.md').success).toBe(true);
  });
});
