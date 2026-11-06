import { expect, test } from '@playwright/test';

/**
 * The one journey test that modules grow. Its five steps are placeholders, and each owning module
 * turns its step on at its milestone [provisional §7 item 22]. Module-only gesture tests belong in
 * their own folder, outside this journey.
 */
const JOURNEY_STEPS = [
  { name: 'setup', owner: 'Setup & auth' },
  { name: 'project from sample', owner: 'Project store' },
  { name: 'agent run', owner: 'Agent loop' },
  { name: 'accept change', owner: 'Project store review' },
  { name: 'manuscript', owner: 'Compile & export' },
] as const;

test('app loads through the dev proxy', async ({ page, request }) => {
  // The dev server proxies /healthz to the API, so this checks the proxy as well as the API.
  const health = await request.get('/healthz');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok' });

  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');
  await expect(page.locator('mat-toolbar')).toHaveText('Scriba');
  expect(pageErrors).toEqual([]);
});

test('journey', async () => {
  for (const [index, step] of JOURNEY_STEPS.entries()) {
    await test.step(`${index + 1}. ${step.name} (pending, ${step.owner})`, () => {
      // Playwright has no pending status. The PENDING line shows in the run output, and the
      // annotation is kept for reports that read it.
      console.log(
        `PENDING ${index + 1}/${JOURNEY_STEPS.length} ${step.name} (owner: ${step.owner})`,
      );
      test.info().annotations.push({
        type: 'pending',
        description: `${step.name}: owned by ${step.owner}, turned on at its milestone`,
      });
    });
  }
});
