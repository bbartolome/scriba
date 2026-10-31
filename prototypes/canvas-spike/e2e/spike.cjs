// PROTOTYPE, throwaway. Live checks for the canvas-library spike (ticket #8).
// Runs the same checks against both adapters, on a desktop viewport (mouse) and a tablet viewport (touch via CDP).
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:4300';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const record = (lib, mode, name, pass, detail = '') => {
  results.push({ lib, mode, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${lib} ${mode}] ${name}${detail ? ' :: ' + detail : ''}`);
};

async function center(page, selector) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'attached', timeout: 5000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Mouse drag: source point -> target point, with intermediate moves so libraries see a real gesture.
async function mouseDrag(page, fromSel, toSel) {
  const a = await center(page, fromSel);
  const b = await center(page, toSel);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 15 });
  await page.mouse.up();
}

// Touch drag via CDP Input.dispatchTouchEvent, which produces real pointerType=touch events in Chromium.
async function touchDrag(page, cdp, fromSel, toSel) {
  const a = await center(page, fromSel);
  const b = await center(page, toSel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
  for (let i = 1; i <= 15; i++) {
    const x = a.x + ((b.x - a.x) * i) / 15;
    const y = a.y + ((b.y - a.y) * i) / 15;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function snapshot(page) {
  return page.evaluate(() => window.__spike.snapshot());
}

async function edgeCount(page) {
  return Number((await page.getByTestId('edge-count').innerText()).split(' ')[0]);
}

async function resetView(page, lib, view) {
  await page.goto(`${BASE}/${lib}`);
  await page.getByTestId('flow').waitFor();
  await page.getByTestId(`view-${view}`).click();
  await page.waitForTimeout(400);
}

async function runDesktop(browser, lib) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  // 0. Auto-generated node: the expand node renders one port row per property in its spec (3 here).
  await resetView(page, lib, 'story');
  const rows = await page.locator('[data-node="exp"] .row').count();
  record(lib, 'desktop', 'auto-generated node: rows match spec properties', rows === 3, `rows=${rows}`);

  // 1. Typed ports: text output -> entity input must be refused by the library.
  const before = await edgeCount(page);
  await mouseDrag(page, '[data-port="src.text"]', '[data-port="exp.subject"]');
  await page.waitForTimeout(300);
  const afterWrong = await edgeCount(page);
  const snapWrong = await snapshot(page);
  record(lib, 'desktop', 'typed-port: text->entity refused', before === afterWrong && snapWrong.rejected.length === 0,
    `edges ${before}->${afterWrong}, app-rejected=${snapWrong.rejected.length}`);

  // 2. Positive control: text output -> text input connects, so the gate is not simply blocking everything.
  await mouseDrag(page, '[data-port="exp.text"]', '[data-port="out.text"]');
  await page.waitForTimeout(300);
  const afterRight = await edgeCount(page);
  record(lib, 'desktop', 'typed-port: text->text connects (control)', afterRight === before + 1, `edges ${afterWrong}->${afterRight}`);

  // 3. External drop onto a port: entity chip from the side list onto an entity input.
  await page.screenshot({ path: path.join(OUT, `${lib}-desktop-before-drop.png`) });
  await chipDrop(page, 'alice', '[data-port="exp.subject"]');
  await page.waitForTimeout(300);
  const bound = await page.getByTestId('bound-exp.subject').count();
  const boundText = bound ? await page.getByTestId('bound-exp.subject').innerText() : '';
  record(lib, 'desktop', 'external drop: chip -> entity port binds', bound === 1 && boundText.includes('Alice'), `bound text="${boundText}"`);

  // 4. Drop refused on a text port.
  await chipDrop(page, 'bob', '[data-port="exp.draft"]');
  await page.waitForTimeout(300);
  const snapDrop = await snapshot(page);
  record(lib, 'desktop', 'external drop: chip -> text port refused', snapDrop.rejected.some((r) => r.startsWith('drop bob')) && !snapDrop.bindings['exp.draft'], `rejected=${JSON.stringify(snapDrop.rejected)}`);

  // 5. Node run status and inline result, driven by signals.
  await page.getByTestId('run-exp').click();
  await page.getByTestId('result-exp').filter({ hasText: 'Expanded' }).waitFor({ timeout: 3000 }).catch(() => {});
  const resultText = await page.getByTestId('result-exp').innerText();
  record(lib, 'desktop', 'run: status + inline result from signals', resultText.includes('Alice'), `result="${resultText}"`);

  // 6. Two views from one JSON contract.
  await page.getByTestId('view-recipe').click();
  await page.waitForTimeout(400);
  const nodes = await page.locator('[data-node]').count();
  const edges = await edgeCount(page);
  record(lib, 'desktop', 'two views: recipe renders from same contract', nodes === 3 && edges === 2, `nodes=${nodes} edges=${edges}`);
  await page.screenshot({ path: path.join(OUT, `${lib}-desktop-recipe.png`) });

  record(lib, 'desktop', 'console: no page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();
}

// External drop with the mouse: the chip is pressed, then released over the port.
async function chipDrop(page, entity, portSel) {
  const chip = await center(page, `[data-testid="chip-${entity}"]`);
  const port = await center(page, portSel);
  await page.mouse.move(chip.x, chip.y);
  await page.mouse.down();
  await page.mouse.move(port.x, port.y, { steps: 12 });
  await page.mouse.up();
}

async function runTouch(browser, lib) {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // Touch: attempt a refused typed connection first (story view).
  await resetView(page, lib, 'story');
  const before = await edgeCount(page);
  await touchDrag(page, cdp, '[data-port="src.text"]', '[data-port="exp.subject"]');
  await page.waitForTimeout(300);
  const afterWrong = await edgeCount(page);
  record(lib, 'touch', 'typed-port: text->entity refused by touch', before === afterWrong, `edges ${before}->${afterWrong}`);

  // Touch: positive connection.
  await touchDrag(page, cdp, '[data-port="exp.text"]', '[data-port="out.text"]');
  await page.waitForTimeout(300);
  const afterRight = await edgeCount(page);
  record(lib, 'touch', 'typed-port: text->text connects by touch (control)', afterRight === before + 1, `edges ${afterWrong}->${afterRight}`);

  // Touch: external drop of an entity chip onto a port.
  const chip = await center(page, '[data-testid="chip-bob"]');
  const port = await center(page, '[data-port="exp.subject"]');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: chip.x, y: chip.y, id: 2 }] });
  for (let i = 1; i <= 15; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: chip.x + ((port.x - chip.x) * i) / 15, y: chip.y + ((port.y - chip.y) * i) / 15, id: 2 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  const boundText = (await page.getByTestId('bound-exp.subject').count()) ? await page.getByTestId('bound-exp.subject').innerText() : '';
  record(lib, 'touch', 'external drop by touch: chip -> entity port binds', boundText.includes('Bob'), `bound text="${boundText}"`);

  // Touch: node move on the header, measured from the node's box.
  const header = page.locator('[data-node="src"] header, [data-node="src"] .node header').first();
  const nodeBox = await page.locator('[data-node="src"]').first().boundingBox();
  const h = await header.boundingBox();
  if (h && nodeBox) {
    const sx = h.x + h.width / 2;
    const sy = h.y + h.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 3 }] });
    for (let i = 1; i <= 15; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + i * 6, y: sy + i * 2, id: 3 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const moved = await page.locator('[data-node="src"]').first().boundingBox();
    record(lib, 'touch', 'node move by touch', !!moved && Math.abs(moved.x - nodeBox.x) > 20, `dx=${moved ? (moved.x - nodeBox.x).toFixed(0) : 'n/a'}`);
  } else {
    record(lib, 'touch', 'node move by touch', false, 'header not found');
  }

  await page.screenshot({ path: path.join(OUT, `${lib}-tablet.png`) });
  record(lib, 'touch', 'console: no page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const lib of ['foblex', 'vflow']) {
    try {
      await runDesktop(browser, lib);
    } catch (e) {
      record(lib, 'desktop', 'run aborted', false, e.message.split('\n')[0]);
    }
    try {
      await runTouch(browser, lib);
    } catch (e) {
      record(lib, 'touch', 'run aborted', false, e.message.split('\n')[0]);
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
})();
