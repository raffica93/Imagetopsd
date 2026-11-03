import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { readPsd, initializeCanvas } from 'ag-psd';

const url = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const artifacts = process.env.TEST_ARTIFACTS || '/tmp/frescolayers-test';
await mkdir(artifacts, { recursive: true });
let server;
if (!process.env.TEST_BASE_URL) {
  server = spawn(
    process.execPath,
    ['--import', 'tsx', 'server.ts', '--port', '4173'],
    { stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
  );
  let logs = '';
  server.stdout.on('data', (s) => (logs += s));
  server.stderr.on('data', (s) => (logs += s));
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i === 99) throw new Error(`Preview unavailable: ${logs}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
initializeCanvas(
  () => {
    throw Error('Tests read raw image data');
  },
  (width, height) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  }),
);
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const executable =
  process.env.CHROMIUM_PATH ||
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await engine.launch(
  engine === chromium
    ? { executablePath: executable, args: ['--no-sandbox'] }
    : {},
);
const context = await browser.newContext({
  viewport: { width: 1194, height: 834 },
  hasTouch: true,
  isMobile: true,
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const count = async (n) => expect(page.locator('.layer-row')).toHaveCount(n);
const choose = async (name) =>
  page.getByRole('button', { name, exact: true }).click();
async function saveDownload(filename) {
  const event = page.waitForEvent('download');
  await choose('Scarica file');
  const download = await event;
  await download.saveAs(`${artifacts}/${filename}`);
  return `${artifacts}/${filename}`;
}
async function openExport() {
  await choose('Esporta');
}
async function noOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    'horizontal page overflow',
  );
}
async function compositeSamples() {
  return page.locator('.paper canvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    return [
      [0, 0],
      [295, 275],
      [855, 283],
      [850, 650],
    ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  });
}
try {
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Un’immagine. Tutti i tuoi livelli.' }),
  ).toBeVisible();
  await noOverflow();
  await page.screenshot({ path: `${artifacts}/welcome.png` });
  await page.getByLabel('Carica immagini', { exact: true }).setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(page.getByRole('alert')).toContainText(
    'contenuto non è un’immagine',
  );
  await choose('Chiudi messaggio');
  await choose('Prova con sticker botanici');
  await count(1);
  await choose('Separa in livelli');
  await page.getByRole('button', { name: /Oggetti separati/ }).click();
  await choose('Trova i livelli');
  await expect(
    page.getByText('4 livelli rilevati', { exact: true }),
  ).toBeVisible();
  await choose('Usa questi livelli');
  await count(4);
  console.log('PASS import validation + worker extraction');

  await page.getByLabel('Nome', { exact: true }).fill('Fiore');
  await page.getByLabel('Nome', { exact: true }).press('Enter');
  await choose('Nascondi Fiore');
  await expect(
    page.getByRole('button', { name: 'Mostra Fiore', exact: true }),
  ).toBeVisible();
  await choose('Annulla ultima modifica');
  await expect(
    page.getByRole('button', { name: 'Nascondi Fiore', exact: true }),
  ).toBeVisible();
  await choose('Ripristina modifica');
  await choose('Mostra Fiore');
  await page.getByLabel('Opacità', { exact: true }).press('End');
  await page.getByLabel('Opacità', { exact: true }).press('ArrowLeft');
  await choose('Duplica livello');
  await count(5);
  await choose('Elimina livello');
  await count(4);
  await choose('Annulla ultima modifica');
  await count(5);
  await choose('Ripristina modifica');
  await count(4);
  console.log('PASS layer edits + undo/redo');

  await choose('Seleziona Elemento 2');
  const beforeCut = await compositeSamples();
  const bounds = await page.locator('.paper').boundingBox();
  const scale = bounds.width / 1200;
  await choose('Ritaglia');
  await page.mouse.move(bounds.x + 240 * scale, bounds.y + 220 * scale);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 340 * scale, bounds.y + 320 * scale, {
    steps: 8,
  });
  await page.mouse.up();
  await count(5);
  assert.deepEqual(
    await compositeSamples(),
    beforeCut,
    'cut must move pixels, preserving composite',
  );
  await choose('Annulla ultima modifica');
  await count(4);
  const beforeMove = await page.locator('.layer-meta').innerText();
  await page.mouse.move(bounds.x + 295 * scale, bounds.y + 275 * scale);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 345 * scale, bounds.y + 305 * scale, {
    steps: 8,
  });
  await page.mouse.up();
  assert.notEqual(await page.locator('.layer-meta').innerText(), beforeMove);
  await choose('Annulla ultima modifica');
  assert.equal(await page.locator('.layer-meta').innerText(), beforeMove);
  await choose('Blocca livello');
  await page.mouse.move(bounds.x + 295 * scale, bounds.y + 275 * scale);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 345 * scale, bounds.y + 305 * scale, {
    steps: 6,
  });
  await page.mouse.up();
  assert.equal(
    await page.locator('.layer-meta').innerText(),
    beforeMove,
    'locked layer must not move',
  );
  await choose('Sblocca livello');
  console.log('PASS manual cut + pointer movement + locks');

  await page
    .getByRole('button', { name: 'Piccole cose belle', exact: true })
    .click();
  await page
    .getByLabel('Nome del progetto', { exact: true })
    .fill('Prova iPad');
  await page.getByLabel('Risoluzione', { exact: true }).selectOption('150');
  await page.getByLabel('Sfondo', { exact: true }).selectOption('white');
  await choose('Salva modifiche');
  await choose('Nascondi Elemento 4');
  const expectedPixels = await compositeSamples();
  await openExport();
  await choose('Prepara PSD');
  await expect(page.getByText('File pronto', { exact: true })).toBeVisible();
  const psdFile = await saveDownload('test.psd');
  const psd = readPsd(await readFile(psdFile), {
    useImageData: true,
    skipThumbnail: true,
  });
  assert.equal(psd.width, 1200);
  assert.equal(psd.height, 900);
  assert.equal(psd.children.length, 5);
  assert.deepEqual(
    psd.children.map((l) => l.name),
    ['Sfondo', 'Elemento 4', 'Elemento 3', 'Elemento 2', 'Fiore'],
  );
  assert.equal(psd.children[1].hidden, true);
  assert.ok(Math.abs(psd.children[4].opacity - 0.99) < 0.005);
  assert.equal(psd.imageResources.resolutionInfo.horizontalResolution, 150);
  assert.ok(psd.children.slice(1).every((l) => l.imageData.data.length > 0));
  const actualPixels = [
    [0, 0],
    [295, 275],
    [855, 283],
    [850, 650],
  ].map(([x, y]) => [
    ...psd.imageData.data.slice((y * 1200 + x) * 4, (y * 1200 + x) * 4 + 4),
  ]);
  assert.deepEqual(
    actualPixels,
    expectedPixels,
    'PSD composite must match the preview',
  );
  console.log(
    'PASS PSD round trip: pixels, order, hidden layers, opacity, ppi, background',
  );

  await page.getByRole('button', { name: /Immagine PNG/ }).click();
  await choose('Prepara PNG');
  const png = await readFile(await saveDownload('test.png'));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 900);
  await page.getByRole('button', { name: /Progetto riapribile/ }).click();
  await choose('Prepara progetto');
  const projectFile = await saveDownload('test.frescolayers');
  await choose('Chiudi finestra');
  await expect(page.locator('.save-state')).toHaveClass(/saved/);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Prova iPad', exact: true }),
  ).toBeVisible();
  await count(4);
  await expect(
    page.getByRole('button', { name: 'Mostra Elemento 4', exact: true }),
  ).toBeVisible();
  assert.deepEqual(await compositeSamples(), expectedPixels);
  console.log('PASS PNG + portable project + IndexedDB recovery');

  await page
    .getByLabel('Apri progetto FrescoLayers', { exact: true })
    .setInputFiles(projectFile);
  await choose('Sostituisci progetto');
  await count(4);
  assert.deepEqual(await compositeSamples(), expectedPixels);
  await page
    .getByLabel('Apri progetto FrescoLayers', { exact: true })
    .setInputFiles({
      name: 'broken.frescolayers',
      mimeType: 'application/zip',
      buffer: Buffer.from('broken'),
    });
  await expect(page.getByRole('alert')).toContainText('Impossibile aprire');
  await count(4);
  await choose('Chiudi messaggio');
  console.log('PASS project reopen + corrupt-file protection');

  if (engine === chromium) {
    const session = await context.newCDPSession(page),
      b = await page.locator('.viewport').boundingBox();
    const cx = b.x + b.width / 2,
      cy = b.y + b.height / 2;
    const before = await page.locator('.zoom-controls output').innerText();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: cx - 50, y: cy },
        { id: 2, x: cx + 50, y: cy },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: cx - 95, y: cy },
        { id: 2, x: cx + 95, y: cy },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.notEqual(
      await page.locator('.zoom-controls output').innerText(),
      before,
      'two finger pinch must change zoom',
    );
    await choose('Adatta tela');
    console.log('PASS actual touch pinch');
  }
  for (const [width, height] of [
    [1194, 834],
    [834, 1194],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await noOverflow();
    await expect(
      page.getByRole('button', { name: 'Esporta', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Separa in livelli', exact: true }),
    ).toBeVisible();
    const controls = await page
      .locator('.app-header, .project-strip, .layer-actions')
      .evaluateAll((els) =>
        els
          .flatMap((el) => [...el.querySelectorAll('button')])
          .filter((b) => b.getBoundingClientRect().width > 0)
          .map((b) => ({
            name: b.getAttribute('aria-label') || b.textContent,
            box: b.getBoundingClientRect().toJSON(),
          })),
      );
    assert.ok(
      controls.every((c) => c.box.left >= 0 && c.box.right <= width + 1),
      `clipped controls at ${width}`,
    );
    if (width >= 768)
      assert.ok(
        controls.every((c) => c.box.width >= 44 && c.box.height >= 42),
        `small touch targets at ${width}`,
      );
    await page.screenshot({ path: `${artifacts}/editor-${width}.png` });
  }
  console.log('PASS iPad landscape, portrait, Split View layouts');
  assert.deepEqual(errors, [], 'unhandled browser errors');
  console.log(
    `ALL BROWSER CHECKS PASSED (${process.env.TEST_BROWSER || 'chromium'})`,
  );
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
