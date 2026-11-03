import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { readPsd, initializeCanvas } from 'ag-psd';
const url = process.env.TEST_BASE_URL || 'http://127.0.0.1:4175',
  artifacts = process.env.TEST_ARTIFACTS || '/tmp/fresco-semantic-test';
await mkdir(artifacts, { recursive: true });
let server;
if (!process.env.TEST_BASE_URL) {
  server = spawn(
    process.execPath,
    ['--import', 'tsx', 'server.ts', '--port', '4175'],
    {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw Error('Test server unavailable');
  }
}
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(
  engine === chromium
    ? {
        executablePath:
          process.env.CHROMIUM_PATH ||
          (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
        args: ['--no-sandbox'],
      }
    : {},
);
const context = await browser.newContext({
    viewport: { width: 1194, height: 834 },
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
  }),
  page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const choose = async (name) =>
  page.getByRole('button', { name, exact: true }).click();
const count = async (label) =>
  Number(
    (
      await page
        .getByRole('button', { name: `Seleziona parte ${label}`, exact: true })
        .locator('small')
        .innerText()
    ).replace(/\D/g, ''),
  );
function hash(data) {
  let h = 2166136261;
  for (const n of data) h = Math.imul(h ^ n, 16777619);
  return h >>> 0;
}
initializeCanvas(
  () => {
    throw Error('Read raw PSD pixels');
  },
  (width, height) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  }),
);
try {
  await page.goto(url);
  await page
    .getByRole('heading', { name: 'Un’immagine. Tutti i tuoi livelli.' })
    .waitFor();
  // Deterministic, synthetic fixture. These masks test the editor and are not AI inference results.
  const fixture = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 100;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 120, 100);
    x.fillStyle = '#b48c6e';
    x.fillRect(22, 20, 76, 68);
    x.fillStyle = '#5a4529';
    x.fillRect(20, 6, 80, 23);
    x.fillStyle = '#d9d9d9';
    x.fillRect(35, 40, 15, 7);
    x.fillRect(72, 40, 15, 7);
    x.fillStyle = '#bfa35d';
    x.fillRect(100, 49, 5, 22);
    const mask = (paint) => {
      const m = document.createElement('canvas');
      m.width = 120;
      m.height = 100;
      const ctx = m.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 120, 100);
      ctx.fillStyle = '#fff';
      paint(ctx);
      return m.toDataURL('image/png').split(',')[1];
    };
    const parts = [
      { label: 'Pelle', mask: mask((ctx) => ctx.fillRect(22, 20, 76, 68)) },
      { label: 'Capelli', mask: mask((ctx) => ctx.fillRect(20, 6, 80, 23)) },
      {
        label: 'Occhi',
        mask: mask((ctx) => {
          ctx.fillRect(35, 40, 15, 7);
          ctx.fillRect(72, 40, 15, 7);
        }),
      },
    ].map((p) => ({ ...p, box_2d: [0, 0, 1000, 1000] }));
    return {
      image: c.toDataURL('image/png').split(',')[1],
      pixels: [...x.getImageData(0, 0, 120, 100).data],
      parts,
    };
  });
  await page.getByLabel('Carica immagini', { exact: true }).setInputFiles({
    name: 'Selection-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixture.image, 'base64'),
  });
  let calls = 0,
    fail = true;
  await page.route('**/api/segment-semantic', async (route) => {
    calls++;
    await route.fulfill({
      status: fail ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        fail
          ? { error: 'Google occupato: nessuna sagoma applicata.' }
          : {
              isMock: false,
              modelUsed: 'Fixture di test, senza AI',
              maskFormat: 'png',
              discardedParts: 1,
              parts: fixture.parts,
            },
      ),
    });
  });
  await choose('Separa in livelli');
  assert.equal(
    await page
      .getByRole('button', { name: 'Avvia Separazione Anatomica', exact: true })
      .isDisabled(),
    true,
    'consent must be explicit',
  );
  await page.locator('.consent-box input').check();
  await choose('Avvia Separazione Anatomica');
  await expect(page.getByRole('alert')).toContainText('nessuna sagoma');
  assert.equal(await page.locator('.precision-studio').count(), 0);
  assert.equal(await page.locator('.layer-row').count(), 1);
  fail = false;
  await choose('Avvia Separazione Anatomica');
  await expect(
    page.getByRole('heading', { name: 'Rifinisci le selezioni', exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('fresco_gemini_key')),
    null,
  );
  assert.equal(
    await count('Occhi'),
    210,
    'disconnected eye masks must survive PNG decoding',
  );
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'contorni non validi scartati' }),
  ).toBeVisible();
  console.log(
    'PASS failed API is visible; real PNG-mask protocol and explicit consent',
  );
  async function at(x, y) {
    const b = await page.locator('.precision-paper').boundingBox();
    return { x: b.x + (x * b.width) / 120, y: b.y + (y * b.height) / 100 };
  }
  async function tap(x, y) {
    const p = await at(x, y);
    await page.mouse.click(p.x, p.y);
  }
  async function stroke(x0, y0, x1, y1) {
    const a = await at(x0, y0),
      b = await at(x1, y1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  }
  await tap(40, 43);
  await expect(
    page.getByRole('button', { name: 'Seleziona parte Occhi', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const eyeBefore = await count('Occhi');
  await choose('Aumenta zoom selezione');
  await choose('Aumenta zoom selezione');
  assert.equal(await count('Occhi'), eyeBefore);
  await choose('Pennello');
  await stroke(55, 65, 65, 65);
  const eyePaint = await count('Occhi');
  assert.ok(eyePaint > eyeBefore);
  await choose('Annulla correzione');
  assert.equal(await count('Occhi'), eyeBefore);
  await choose('Ripristina correzione');
  assert.equal(await count('Occhi'), eyePaint);
  const unassigned = await count('Da assegnare');
  await choose('Togli');
  await stroke(58, 65, 61, 65);
  assert.ok((await count('Da assegnare')) > unassigned);
  await choose('Annulla correzione');
  await choose('Annulla correzione');
  await choose('Aggiungi');
  await choose('Adatta immagine selezione');
  console.log(
    'PASS tap-to-pick, zoom, brush transfer, non-destructive removal, undo/redo',
  );
  await choose('Seleziona parte Accessori');
  await choose('Zona');
  await tap(102, 60);
  await expect(
    page.getByRole('button', { name: 'Assegna a Accessori', exact: true }),
  ).toBeVisible();
  const accessoryBefore = await count('Accessori');
  await choose('Assegna a Accessori');
  assert.equal((await count('Accessori')) - accessoryBefore, 110);
  await choose('Annulla correzione');
  assert.equal(await count('Accessori'), accessoryBefore);
  await choose('Ripristina correzione');
  await choose('Seleziona parte Bocca');
  await choose('Lazo');
  const a = await at(52, 68),
    b = await at(68, 68),
    c = await at(68, 75),
    d = await at(52, 75);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.move(c.x, c.y, { steps: 5 });
  await page.mouse.move(d.x, d.y, { steps: 5 });
  await page.mouse.move(a.x, a.y, { steps: 5 });
  await page.mouse.up();
  await choose('Assegna a Bocca');
  assert.ok((await count('Bocca')) > 0);
  console.log('PASS zone selection preview and lasso assignment');
  if (engine === chromium) {
    await choose('Pennello');
    const before = await count('Bocca'),
      session = await context.newCDPSession(page),
      b = await page.locator('.precision-viewport').boundingBox(),
      cx = b.x + b.width / 2,
      cy = b.y + b.height / 2;
    const zoomBefore = await page
      .locator('.precision-bottom output')
      .innerText();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: cx - 40, y: cy },
        { id: 2, x: cx + 40, y: cy },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: cx - 75, y: cy },
        { id: 2, x: cx + 75, y: cy },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.equal(
      await count('Bocca'),
      before,
      'pinch must not paint a first-finger dot',
    );
    assert.notEqual(
      await page.locator('.precision-bottom output').innerText(),
      zoomBefore,
    );
    await choose('Adatta immagine selezione');
  }
  const expectedCount = await page
    .locator('.precision-part-pick small')
    .evaluateAll((els) =>
      els.reduce((n, el) => n + Number(el.textContent.replace(/\D/g, '')), 0),
    );
  assert.equal(expectedCount, 12000, 'all source pixels have one owner');
  for (const [width, height] of [
    [1194, 834],
    [834, 1194],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole('button', { name: 'Applica selezioni', exact: true }),
    ).toBeVisible();
    const bounds = await page.locator('.precision-viewport').boundingBox();
    assert.ok(
      bounds.width >= 200 && bounds.height >= 150,
      `usable editor at ${width}`,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: `${artifacts}/refinement-${width}.png` });
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  await choose('Applica selezioni');
  const layerCount = await page.locator('.layer-row').count();
  assert.ok(layerCount >= 6);
  await page.getByLabel('Nome', { exact: true }).fill('Tratto corretto');
  await page.getByLabel('Nome', { exact: true }).press('Enter');
  await choose('Separa in livelli');
  assert.equal(
    await page.locator('.precision-studio').count(),
    1,
    'reopening must directly restore masks',
  );
  assert.equal(calls, 2, 'reopening must not resend image');
  await choose('Applica selezioni');
  assert.equal(
    await page.getByLabel('Nome', { exact: true }).inputValue(),
    'Tratto corretto',
  );
  assert.equal(
    await page.locator('.layer-row').count(),
    layerCount,
    'reapplying must replace the group without duplicates',
  );
  await expect(page.locator('.save-state')).toHaveClass(/saved/, {
    timeout: 15000,
  });
  await page.reload();
  await page.locator('.layer-row').first().waitFor();
  await choose('Separa in livelli');
  await expect(page.locator('.precision-studio')).toBeVisible();
  assert.equal(calls, 2);
  await choose('Applica selezioni');
  assert.equal(await page.locator('.layer-row').count(), layerCount);
  console.log(
    'PASS group re-edit, no duplicate extraction, and saved group metadata',
  );
  await choose('Esporta');
  await choose('Prepara PSD');
  await page
    .getByRole('button', { name: 'Scarica file', exact: true })
    .waitFor();
  const event = page.waitForEvent('download');
  await choose('Scarica file');
  const download = await event;
  const out = `${artifacts}/selection-result.psd`;
  await download.saveAs(out);
  const psd = readPsd(await readFile(out), {
    useImageData: true,
    skipThumbnail: true,
  });
  assert.equal(
    psd.children.filter((l) => l.name === 'Originale (Recupero)').length,
    1,
  );
  assert.equal(
    hash(psd.imageData.data),
    hash(fixture.pixels),
    'PSD recomposition must preserve source pixels',
  );
  assert.deepEqual(errors, []);
  const manual = await browser.newPage();
  let manualCalls = 0;
  await manual.route('**/api/segment-semantic', (route) => {
    manualCalls++;
    return route.abort();
  });
  await manual.goto(url);
  await manual
    .getByRole('heading', { name: 'Un’immagine. Tutti i tuoi livelli.' })
    .waitFor();
  await manual.getByLabel('Carica immagini', { exact: true }).setInputFiles({
    name: 'Manual.png',
    mimeType: 'image/png',
    buffer: Buffer.from(fixture.image, 'base64'),
  });
  await manual
    .getByRole('button', { name: 'Separa in livelli', exact: true })
    .click();
  await manual
    .getByRole('button', { name: 'Seleziona le parti a mano', exact: true })
    .click();
  await expect(manual.locator('.precision-studio')).toBeVisible();
  assert.equal(
    manualCalls,
    0,
    'manual correction requires neither an API call nor a key',
  );
  await manual.close();
  console.log(
    `ALL SEMANTIC EDITOR CHECKS PASSED (${process.env.TEST_BROWSER || 'chromium'}). Fixtures are synthetic, not an AI quality benchmark.`,
  );
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
