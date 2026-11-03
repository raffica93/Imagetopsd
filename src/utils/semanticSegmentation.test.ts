/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPointInPolygon,
  rasterizeNormalizedPolygon,
  extractLineartMask,
  initializeSemanticRefinementMasks,
  buildProjectLayersFromMasks,
  SEMANTIC_HIERARCHY,
} from './semanticSegmentation';
import {
  generateWarriorSampleCanvas,
  getWarriorSemanticGroundTruth,
} from './characterPrototypes';
import { makeLayer, context } from './canvasHelpers';

test('isPointInPolygon accurately distinguishes interior vs exterior coordinates', () => {
  // Triangle with points at [y, x]: [10, 10], [10, 50], [50, 30]
  const triangle: [number, number][] = [
    [10, 10],
    [10, 50],
    [50, 30],
  ];

  // Interior point
  assert.equal(isPointInPolygon(30, 20, triangle), true);

  // Exterior points
  assert.equal(isPointInPolygon(5, 5, triangle), false);
  assert.equal(isPointInPolygon(60, 60, triangle), false);
  assert.equal(isPointInPolygon(30, 55, triangle), false);
});

test('rasterizeNormalizedPolygon converts 0-1000 coordinates to binary mask on full resolution', () => {
  const width = 100;
  const height = 100;

  // Box from (200, 200) to (800, 800) in 0-1000 scale -> [20, 20] to [80, 80] in pixels
  const polygon: [number, number][] = [
    [200, 200],
    [200, 800],
    [800, 800],
    [800, 200],
  ];

  const mask = rasterizeNormalizedPolygon(polygon, width, height);
  assert.equal(mask.length, width * height);

  // Center pixel (50, 50) must be 1
  assert.equal(mask[50 * width + 50], 1);

  // Corner pixel (5, 5) must be 0
  assert.equal(mask[5 * width + 5], 0);
  // Bottom-right corner pixel (95, 95) must be 0
  assert.equal(mask[95 * width + 95], 0);
});

test('extractLineartMask isolates high-contrast dark contours without capturing flat light tones', () => {
  const width = 20;
  const height = 20;
  const data = new Uint8ClampedArray(width * height * 4);

  // Fill with light background (240, 240, 240, 255)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 240;
    data[i * 4 + 1] = 240;
    data[i * 4 + 2] = 240;
    data[i * 4 + 3] = 255;
  }

  // Draw a dark vertical ink stroke down the center (x = 10)
  for (let y = 2; y < 18; y++) {
    const idx = y * width + 10;
    data[idx * 4] = 10;
    data[idx * 4 + 1] = 10;
    data[idx * 4 + 2] = 10;
    data[idx * 4 + 3] = 255;
  }

  const lineart = extractLineartMask(data, width, height, 75);

  // The center stroke must be detected as lineart
  assert.equal(lineart[10 * width + 10], 1);

  // The flat surrounding light area must NOT be lineart
  assert.equal(lineart[10 * width + 3], 0);
  assert.equal(lineart[10 * width + 17], 0);
});

test('initializeSemanticRefinementMasks organizes Warrior character anatomy into ordered masks', () => {
  const warriorCanvas = generateWarriorSampleCanvas();
  const width = warriorCanvas.width;
  const height = warriorCanvas.height;
  const ctx = context(warriorCanvas);
  const srcData = ctx.getImageData(0, 0, width, height).data;

  const groundTruth = getWarriorSemanticGroundTruth();
  const masks = initializeSemanticRefinementMasks(srcData, width, height, groundTruth);

  assert.ok(masks.length >= 6, 'Should identify all core anatomical regions');

  const labels = masks.map((m) => m.label);
  assert.ok(labels.includes('Tratto'), 'Must include Tratto / Lineart');
  assert.ok(labels.includes('Accessori'), 'Must include Accessori (sword)');
  assert.ok(labels.includes('Capelli'), 'Must include Capelli');
  assert.ok(labels.includes('Pelle'), 'Must include Pelle');
  assert.ok(labels.includes('Vestiti'), 'Must include Vestiti');

  // Verify that lineart and clothes have positive pixel counts
  const lineartMask = masks.find((m) => m.label === 'Tratto')!;
  assert.ok(lineartMask.pixelCount > 0, 'Lineart must contain pixels');

  const skinMask = masks.find((m) => m.label === 'Pelle')!;
  assert.ok(skinMask.pixelCount > 0, 'Pelle must contain pixels');
});

test('buildProjectLayersFromMasks constructs strictly ordered layers with hidden Originale at bottom', () => {
  const warriorCanvas = generateWarriorSampleCanvas();
  const sourceLayer = makeLayer(warriorCanvas, 'Guerriero Originale');
  const ctx = context(warriorCanvas);
  const srcData = ctx.getImageData(0, 0, warriorCanvas.width, warriorCanvas.height).data;

  const groundTruth = getWarriorSemanticGroundTruth();
  const masks = initializeSemanticRefinementMasks(
    srcData,
    warriorCanvas.width,
    warriorCanvas.height,
    groundTruth,
  );

  const layers = buildProjectLayersFromMasks(sourceLayer, masks);

  // 1. First layer (top of stack) must be Tratto
  assert.ok(
    layers[0].name.toLowerCase().includes('tratto') ||
      layers[0].name.toLowerCase().includes('lineart'),
    `Top layer must be Tratto / Lineart, got ${layers[0].name}`,
  );

  // 2. Last layer (bottom of stack) must be Originale (Recupero)
  const bottomLayer = layers[layers.length - 1];
  assert.ok(
    bottomLayer.name.toLowerCase().includes('originale'),
    `Bottom layer must be Originale, got ${bottomLayer.name}`,
  );
  assert.equal(
    bottomLayer.visible,
    false,
    'Originale recovery layer must be hidden by default',
  );
  assert.equal(
    bottomLayer.locked,
    true,
    'Originale recovery layer must be locked for safe reference',
  );

  // 3. Every generated layer must have valid canvas and non-zero dimensions
  for (const l of layers) {
    assert.ok(l.width > 0);
    assert.ok(l.height > 0);
    assert.ok(l.canvas.width > 0);
    assert.ok(l.canvas.height > 0);
  }
});
