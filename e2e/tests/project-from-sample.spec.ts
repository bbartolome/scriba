import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The journey's "project from sample" step (phase:files, demo steps 1, 2 and 5). The author signs in
 * through the setup link, starts a project from the nonfiction sample, activates it, browses its
 * outline and runs a `..` path through the API. It runs on the dev stack with the library in the run's temp folder.
 */
const RUN_ROOT = process.env['SCRIBA_E2E_RUN_ROOT'] ?? '';
const BOOKS = join(RUN_ROOT, 'books');
const SAMPLE_SECTION = 'section[aria-labelledby="sample-heading"]';

test('project from sample: start, activate, browse, and reject a parent path', async ({
  page,
  baseURL,
}) => {
  // Sign in with the setup link the API wrote, as the setup leg does.
  const link = new URL((await readFile(join(BOOKS, '.scriba', 'setup-url'), 'utf8')).trim());
  await page.goto(new URL(`${link.pathname}${link.search}`, baseURL).toString());
  await expect(page).toHaveURL(/\/setup$/);

  // Demo step 1: the picker starts the nonfiction sample under the chosen name.
  await page.goto('/projects');
  await expect(page.locator('h1')).toHaveText('Projects');
  const sample = page.locator(SAMPLE_SECTION);
  await sample.getByLabel('Folder name').fill('demo-book');
  await sample.getByLabel('Title').fill('Demo Book');
  await sample.getByRole('button', { name: 'Start from Nonfiction' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Copied the sample. Activate it to open its files.',
  );

  const row = page.locator('ul.projects > li', { hasText: 'demo-book' });
  await expect(row).toContainText('Demo Book');
  await row.getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByTestId('active-project')).toContainText('Active project: Demo Book');

  // Demo step 2: the copy on the host has no structure/ folder and a .gitignore that covers .scriba/.
  const folder = join(BOOKS, 'demo-book');
  const entries = (await readdir(folder)).sort();
  expect(entries).toEqual(['.gitignore', 'drafts', 'entities', 'project.yaml', 'sources']);
  expect(await readFile(join(folder, '.gitignore'), 'utf8')).toContain('.scriba/');

  // The files view lists the outline. On desktop it opens in the editor (phase:pending-review), where a save
  // is base-checked. Phones stay read-only, through the device gate.
  await row.getByRole('link', { name: 'Open files' }).click();
  await expect(page).toHaveURL(/\/projects\/demo-book\/files$/);
  await page.getByRole('button', { name: 'outline.md' }).click();
  await expect(page.locator('.viewer textarea.editor')).toHaveValue(/Outline notes/);

  // Demo step 5: a parent-folder path is refused by the API, and the response names the code.
  const refused = await page.request.get(
    '/api/project-store/projects/demo-book/files/read?path=..%2Fsecret.md',
  );
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toMatchObject({ error: { code: 'PROJECT_PATH_INVALID' } });
});
