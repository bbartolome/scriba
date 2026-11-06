import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The setup leg (survey 18 §5, the e2e setup leg): the author opens the setup URL the API wrote, and
 * lands on the setup page with no token left in the address. It sits beside the journey, because the
 * journey's setup step is Platform's; it runs on the same dev stack.
 */
const RUN_ROOT = process.env['SCRIBA_E2E_RUN_ROOT'] ?? '';

test('the setup URL signs the author in and lands on /setup with no token in the address', async ({
  page,
  baseURL,
}) => {
  const link = new URL(
    (await readFile(join(RUN_ROOT, 'books', '.scriba', 'setup-url'), 'utf8')).trim(),
  );
  // The API writes its own port into the link. The browser reaches the app through the dev server,
  // so the same path and token are opened on the web origin.
  const target = new URL(`${link.pathname}${link.search}`, baseURL);

  await page.goto(target.toString());

  await expect(page).toHaveURL(/\/setup$/);
  expect(page.url()).not.toContain('token=');
  await expect(page.locator('h1')).toHaveText('Set up Scriba');
});
