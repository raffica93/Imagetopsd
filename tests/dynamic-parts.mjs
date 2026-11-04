import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPsd } from 'ag-psd';
import JSZip from 'jszip';

export async function checkDynamicParts({ browser, url, artifacts }) {
  const page = await browser.newPage({
    viewport: { width: 1194, height: 834 },
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const shape = {
    Elmo: [[70, 20, 130, 70]],
    Spada: [[165, 60, 175, 210]],
    'Armatura superiore': [[60, 80, 140, 150]],
    'Armatura inferiore': [[60, 160, 140, 215]],
    Armatura: [
      [60, 80, 140, 150],
      [60, 160, 140, 215],
    ],
    Spallacci: [[60, 80, 80, 100]],
  };
  const profiles = {
    essential: ['Elmo', 'Spada', 'Armatura'],
    balanced: ['Elmo', 'Spada', 'Armatura superiore', 'Armatura inferiore'],
    detailed: [
      'Elmo',
      'Spada',
      'Spallacci',
      'Armatura superiore',
      'Armatura inferiore',
    ],
  };
  const calls = [];
  let discovery = 0,
    failSword = true,
    expectedKey = 'fixture-session-key';
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: { status: 'ok', hasApiKey: true, model: 'gemini-3.5-flash-lite' },
    }),
  );
  await page.route('**/api/segment-semantic', async (route) => {
    const request = route.request().postDataJSON();
    assert.equal(request.consent, true);
    assert.equal(request.userApiKey, expectedKey);
    assert.equal(
      request.modelId,
      undefined,
      'the server owns the single model configuration',
    );
    calls.push({
      stage: request.stage,
      partId: request.partId,
      complexity: request.complexity || request.inventory.complexity,
    });
    if (request.stage === 'identify') {
      assert.ok(profiles[request.complexity]);
      const parts = profiles[request.complexity].map((name, i) => {
        const rects = shape[name];
        return {
          id: 'part:' + (i + 1),
          name,
          description: 'Parte di prova ' + name,
          box_2d: [
            (Math.min(...rects.map((r) => r[1])) / 240) * 1000,
            (Math.min(...rects.map((r) => r[0])) / 200) * 1000,
            (Math.max(...rects.map((r) => r[3])) / 240) * 1000,
            (Math.max(...rects.map((r) => r[2])) / 200) * 1000,
          ],
        };
      });
      await route.fulfill({
        json: {
          isMock: false,
          modelUsed: 'Fixture, senza AI',
          inventory: {
            id: 'auto-soldier-' + ++discovery,
            subject: 'Soldato sintetico',
            complexity: request.complexity,
            parts,
          },
        },
      });
      return;
    }
    const part = request.inventory.parts.find((p) => p.id === request.partId);
    if (
      request.inventory.complexity === 'balanced' &&
      part.name === 'Spada' &&
      failSword
    ) {
      failSword = false;
      await route.fulfill({
        status: 429,
        json: { error: 'Quota di prova esaurita.' },
      });
      return;
    }
    const b = part.box_2d;
    const padX = Math.max(8, ((b[3] - b[1]) / 1000) * 200 * 0.08);
    const padY = Math.max(8, ((b[2] - b[0]) / 1000) * 240 * 0.08);
    const left = Math.max(0, Math.floor((b[1] / 1000) * 200 - padX));
    const top = Math.max(0, Math.floor((b[0] / 1000) * 240 - padY));
    const png = Buffer.from(request.image.split(',')[1], 'base64');
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    assert.ok(width < 200 || height < 240, 'selection must use a focused crop');
    const parts = shape[part.name].map(([x1, y1, x2, y2]) => {
      const x = (v) => ((v - left) / width) * 1000,
        y = (v) => ((v - top) / height) * 1000;
      return {
        label: part.id,
        box_2d: [y(y1), x(x1), y(y2), x(x2)],
        polygon: [
          [y(y1), x(x1)],
          [y(y1), x(x2)],
          [y(y2), x(x2)],
          [y(y2), x(x1)],
        ],
      };
    });
    await route.fulfill({
      json: {
        isMock: false,
        modelUsed: 'Fixture, senza AI',
        maskFormat: 'polygons',
        parts,
      },
    });
  });
  try {
    await page.goto(url);
    await page
      .getByRole('heading', { name: 'Un’immagine. Tutti i tuoi livelli.' })
      .waitFor();
    await button('Impostazioni AI').click();
    await expect(page.locator('dialog').getByRole('status')).toContainText(
      'chiave del sito è configurata',
    );
    await expect(
      page.getByText('gemini-3.5-flash-lite', { exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.getByRole('combobox').count(),
      0,
      'no duplicated model menu',
    );
    await page
      .getByLabel('Chiave Google per questa sessione', { exact: true })
      .fill(expectedKey);
    await button('Usa questa chiave').click();
    const fixture = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 240;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, 200, 240);
      x.fillStyle = '#8796a4';
      x.fillRect(70, 20, 60, 50);
      x.fillRect(60, 80, 80, 70);
      x.fillRect(60, 160, 80, 55);
      x.fillStyle = '#c5cdd3';
      x.fillRect(165, 60, 10, 150);
      x.strokeStyle = '#111';
      x.strokeRect(70, 20, 60, 50);
      return {
        image: c.toDataURL().split(',')[1],
        pixels: [...x.getImageData(0, 0, 200, 240).data],
      };
    });
    await page
      .getByLabel('Carica immagini', { exact: true })
      .setInputFiles({
        name: 'Soldato.png',
        mimeType: 'image/png',
        buffer: Buffer.from(fixture.image, 'base64'),
      });
    await button('Separa in livelli').click();
    for (const [width, height] of [
      [1194, 834],
      [834, 1194],
      [768, 1024],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      for (const name of ['Essenziale', 'Bilanciata', 'Dettagliata'])
        await expect(button('Avvia analisi ' + name)).toBeInViewport();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: artifacts + '/complexity-' + width + '.png',
      });
    }
    await page.setViewportSize({ width: 1194, height: 834 });
    assert.equal(await page.locator('dialog').getByRole('combobox').count(), 0);
    assert.equal(
      await page
        .locator('.precision-studio, .discovered-parts, .consent-box')
        .count(),
      0,
    );
    await button('Avvia analisi Bilanciata').click();
    await expect(page.locator('dialog [role="alert"]')).toContainText(
      'Quota di prova',
    );
    assert.equal(
      await page.locator('.layer-row').count(),
      1,
      'partial results must not replace the source',
    );
    assert.deepEqual(
      calls.map((c) => c.stage),
      ['identify', 'segment-part', 'segment-part'],
    );
    await button('Riprendi analisi').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    assert.deepEqual(
      calls.filter((c) => c.stage === 'segment-part').map((c) => c.partId),
      ['part:1', 'part:2', 'part:2', 'part:3', 'part:4'],
      'retry must skip completed parts',
    );
    for (const name of profiles.balanced)
      await expect(button('Seleziona ' + name)).toBeVisible();
    await expect(button('Seleziona Tratto / Contorni (Lineart)')).toBeVisible();
    await expect(button('Seleziona Sfondo')).toBeVisible();
    await page.screenshot({ path: artifacts + '/automatic-layers.png' });
    await button('Esporta').click();
    await button('Prepara PSD').click();
    await button('Scarica file').waitFor();
    let download = page.waitForEvent('download');
    await button('Scarica file').click();
    const output = artifacts + '/automatic-soldier.psd';
    await (await download).saveAs(output);
    const psd = readPsd(await readFile(output), {
      useImageData: true,
      skipThumbnail: true,
    });
    assert.deepEqual(
      [...psd.children]
        .reverse()
        .map((l) => l.name)
        .filter((name) => profiles.balanced.includes(name)),
      profiles.balanced,
    );
    assert.deepEqual(
      [...psd.imageData.data],
      fixture.pixels,
      'PSD composite must preserve every source pixel',
    );
    await page.getByRole('button', { name: /Progetto riapribile/ }).click();
    await button('Prepara progetto').click();
    await button('Scarica file').waitFor();
    download = page.waitForEvent('download');
    await button('Scarica file').click();
    const projectFile = artifacts + '/automatic.frescolayers';
    await (await download).saveAs(projectFile);
    const zip = await JSZip.loadAsync(await readFile(projectFile));
    const text = await zip.file('project.json').async('string');
    assert.equal(text.includes(expectedKey), false);
    assert.equal(
      JSON.parse(text).layers.find((l) => l.semanticInventory).semanticInventory
        .complexity,
      'balanced',
    );
    await button('Chiudi finestra').click();
    await expect(page.locator('.save-state')).toHaveClass(/saved/);
    expectedKey = undefined;
    await page.reload();
    await page.locator('.layer-row').first().waitFor();
    await button('Impostazioni AI').click();
    await expect(page.locator('dialog').getByRole('status')).toContainText(
      'chiave del sito è configurata',
    );
    await expect(
      page.getByLabel('Chiave Google per questa sessione', { exact: true }),
    ).toHaveValue('');
    await button('Chiudi finestra').click();
    for (const [profile, title] of [
      ['essential', 'Essenziale'],
      ['detailed', 'Dettagliata'],
    ]) {
      await button('Separa in livelli').click();
      await button('Avvia analisi ' + title).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      for (const name of profiles[profile])
        await expect(button('Seleziona ' + name)).toBeVisible();
      assert.equal(
        await page
          .locator('.layer-row')
          .filter({ hasText: 'Originale' })
          .count(),
        1,
        'reanalysis replaces the group without duplicate originals',
      );
    }
    assert.equal(calls.filter((c) => c.stage === 'identify').length, 3);
    assert.deepEqual(errors, []);
    console.log(
      'PASS one-tap profiles, automatic two-pass selection/order, quota resume, focused crops, automatic background/ink, session-only key, group replacement, metadata, exact PSD pixels and four touch layouts',
    );
  } catch (error) {
    await page.screenshot({ path: artifacts + '/failure.png', fullPage: true });
    console.log(
      'FAILURE_UI',
      await page
        .locator('dialog[open]')
        .innerText()
        .catch(() => 'No dialog'),
    );
    console.log('BROWSER_ERRORS', errors);
    throw error;
  } finally {
    await page.close();
  }
}
