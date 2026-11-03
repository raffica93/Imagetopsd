// Synthetic responses exercise the two-pass workflow, not AI recognition quality.
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPsd } from 'ag-psd';
export async function checkDynamicParts({ browser, url, artifacts }) {
  const page = await browser.newPage({
    viewport: { width: 1194, height: 834 },
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
  });
  try {
    const button = (name) => page.getByRole('button', { name, exact: true });
    await page.goto(url);
    await page
      .getByRole('heading', { name: 'Un’immagine. Tutti i tuoi livelli.' })
      .waitFor();
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
      x.fillStyle = '#111';
      x.strokeRect(70, 20, 60, 50);
      return {
        image: c.toDataURL('image/png').split(',')[1],
        pixels: [...x.getImageData(0, 0, 200, 240).data],
      };
    });
    const inventory = {
      id: 'soldier-workflow',
      subject: 'Soldato sintetico, senza AI',
      parts: [
        {
          id: 'part:1',
          name: 'Spada',
          description: 'Arma in primo piano',
          box_2d: [180, 750, 950, 930],
        },
        {
          id: 'part:2',
          name: 'Elmo',
          description: 'Copricapo di metallo',
          box_2d: [70, 300, 300, 700],
        },
        {
          id: 'part:3',
          name: 'Armatura superiore',
          description: 'Corazza del busto',
          box_2d: [300, 250, 650, 750],
        },
        {
          id: 'part:4',
          name: 'Armatura inferiore',
          description: 'Protezioni delle gambe',
          box_2d: [650, 250, 920, 750],
        },
        {
          id: 'part:5',
          name: 'Stivali',
          description: 'Calzature',
          box_2d: [880, 250, 1000, 750],
        },
      ],
    };
    const calls = [];
    let failSword = true;
    await page.route('**/api/segment-semantic', async (route) => {
      const request = route.request().postDataJSON();
      calls.push({ stage: request.stage, partId: request.partId });
      let status = 200,
        data;
      if (request.stage === 'identify')
        data = {
          isMock: false,
          modelUsed: 'Fixture soldato, senza AI',
          inventory,
        };
      else if (request.partId === 'part:1' && failSword) {
        failSword = false;
        status = 429;
        data = {
          error:
            'Quota di prova esaurita. Le selezioni pronte restano disponibili.',
        };
      } else {
        const png = Buffer.from(request.image.split(',')[1], 'base64');
        assert.ok(
          png.readUInt32BE(16) < 200 || png.readUInt32BE(20) < 240,
          'second pass must send a focused crop',
        );
        assert.equal(
          request.inventory.parts.some((p) => p.id === 'part:5'),
          false,
          'excluded parts must not be segmented',
        );
        data = {
          isMock: false,
          modelUsed: 'Fixture soldato, senza AI',
          maskFormat: 'polygons',
          parts: [
            {
              label: request.partId,
              box_2d: [100, 100, 900, 900],
              polygon: [
                [100, 100],
                [100, 900],
                [900, 900],
                [900, 100],
              ],
            },
          ],
        };
      }
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    });
    await page.getByLabel('Carica immagini', { exact: true }).setInputFiles({
      name: 'Soldato-fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from(fixture.image, 'base64'),
    });
    await button('Separa in livelli').click();
    await page.locator('.consent-box input').check();
    await button('Identifica le parti').click();
    await expect(
      page.getByRole('heading', { name: inventory.subject }),
    ).toBeVisible();
    assert.equal(
      await page.locator('.layer-row').count(),
      1,
      'discovery boxes must leave project pixels untouched',
    );
    await button('Aggiungi una parte mancante').click();
    await page.getByLabel('Nome parte 6', { exact: true }).fill('Scudo');
    await page.getByLabel('Includi Scudo', { exact: true }).uncheck();
    await page.getByLabel('Includi Stivali', { exact: true }).uncheck();
    await page
      .getByLabel('Nome parte 4', { exact: true })
      .fill('Protezioni gambe');
    await button('Sposta sopra Elmo').click();
    assert.equal(
      await page.getByLabel('Nome parte 1', { exact: true }).inputValue(),
      'Elmo',
    );
    for (const [width, height] of [
      [1194, 834],
      [834, 1194],
      [768, 1024],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(button('Seleziona 4 parti')).toBeInViewport();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({ path: `${artifacts}/inventory-${width}.png` });
    }
    await page.setViewportSize({ width: 1194, height: 834 });
    await button('Seleziona 4 parti').click();
    await expect(page.getByRole('alert')).toContainText('Quota di prova');
    assert.deepEqual(
      calls.filter((c) => c.stage === 'segment-part').map((c) => c.partId),
      ['part:2', 'part:1'],
    );
    await expect(page.locator('[data-part-id="part:2"]')).toContainText(
      'Selezione pronta',
    );
    await button('Riprendi le parti mancanti').click();
    await expect(page.locator('.precision-studio')).toBeVisible();
    assert.deepEqual(
      calls.filter((c) => c.stage === 'segment-part').map((c) => c.partId),
      ['part:2', 'part:1', 'part:1', 'part:3', 'part:4'],
      'retry must preserve completed selections',
    );
    for (const name of [
      'Elmo',
      'Spada',
      'Armatura superiore',
      'Protezioni gambe',
    ])
      await expect(button(`Seleziona parte ${name}`)).toBeVisible();
    assert.equal(
      await button('Seleziona parte Pelle').count(),
      0,
      'custom inventory must replace fixed anatomy categories',
    );
    await page.screenshot({ path: `${artifacts}/soldier-refinement.png` });
    await button('Applica selezioni').click();
    await expect(page.locator('.save-state')).toHaveClass(/saved/, {
      timeout: 15000,
    });
    const count = calls.length;
    await page.reload();
    await page.locator('.layer-row').first().waitFor();
    await button('Separa in livelli').click();
    await expect(button('Seleziona parte Protezioni gambe')).toBeVisible();
    assert.equal(calls.length, count);
    await button('Opzioni analisi').click();
    await page
      .getByText('Modello e chiave per la selezione', { exact: true })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Modello Google', exact: true }),
    ).toBeVisible();
    await page
      .getByText('Chiave Google per questa sessione', { exact: true })
      .click();
    await expect(
      page.getByLabel('Chiave Google per questa sessione', { exact: true }),
    ).toBeVisible();
    await button('Chiudi finestra').click();
    await button('Separa in livelli').click();
    await expect(button('Seleziona parte Protezioni gambe')).toBeVisible();
    await button('Applica selezioni').click();
    await button('Esporta').click();
    await button('Prepara PSD').click();
    await button('Scarica file').waitFor();
    const event = page.waitForEvent('download');
    await button('Scarica file').click();
    const output = `${artifacts}/soldier-parts.psd`;
    await (await event).saveAs(output);
    const psd = readPsd(await readFile(output), {
      useImageData: true,
      skipThumbnail: true,
    });
    const names = ['Elmo', 'Spada', 'Armatura superiore', 'Protezioni gambe'];
    assert.deepEqual(
      [...psd.children]
        .reverse()
        .map((l) => l.name)
        .filter((n) => names.includes(n)),
      names,
      'PSD order must match discovered and reviewed order',
    );
    const hash = (data) => {
      let h = 2166136261;
      for (const v of data) h = Math.imul(h ^ v, 16777619);
      return h >>> 0;
    };
    assert.equal(
      hash(psd.imageData.data),
      hash(fixture.pixels),
      'dynamic selection must preserve source pixels',
    );
    console.log(
      'PASS dynamic soldier parts, focused crops, naming/order, quota resume, metadata and PSD pixel/order round trip',
    );
  } finally {
    await page.close();
  }
}
