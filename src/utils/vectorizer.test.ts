import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSmoothnessParams,
  getSimplificationParams,
  countSvgPaths,
  createMultiLayerSvg,
  DEFAULT_VECTOR_OPTIONS,
} from './vectorizer';

test('getSimplificationParams returns correct settings for low, medium, and high detail', () => {
  const low = getSimplificationParams('low');
  assert.ok(low.qtres > 2.0); // high error threshold = fewer curve points
  assert.equal(low.pathomit, 10);
  assert.ok(low.label.includes('Basso'));

  const medium = getSimplificationParams('medium');
  assert.equal(medium.qtres, 1.0);
  assert.equal(medium.pathomit, 4);

  const high = getSimplificationParams('high');
  assert.ok(high.qtres < 0.5); // low error threshold = high detail
  assert.equal(high.pathomit, 1);
  assert.ok(high.label.includes('Alto'));
});

test('getSmoothnessParams returns appropriate parameters for presets', () => {
  const sharp = getSmoothnessParams('sharp');
  assert.ok(sharp.qtresMultiplier < 1.0);

  const smooth = getSmoothnessParams('smooth');
  assert.ok(smooth.qtresMultiplier > 1.0);

  const balanced = getSmoothnessParams('balanced');
  assert.equal(balanced.qtresMultiplier, 1.0);
});

test('countSvgPaths counts path elements correctly', () => {
  const svg = `<svg><path d="M0 0 L10 10"/><path d="M20 20 L30 30"/><g><path d="M40 40"/></g></svg>`;
  assert.equal(countSvgPaths(svg), 3);
  assert.equal(countSvgPaths('<svg></svg>'), 0);
});

test('createMultiLayerSvg generates valid grouped SVG with Fresco layer attributes and coordinates', () => {
  const layers = [
    {
      id: 'l1',
      name: 'Personaggio Vector',
      svgContent: '<svg><path d="M0 0 L10 10" fill="red"/></svg>',
      visible: true,
      opacity: 0.9,
      x: 50,
      y: 120,
    },
    {
      id: 'l2',
      name: 'Ombra',
      svgContent: '<svg><path d="M10 10 L50 50" fill="black"/></svg>',
      visible: true,
      opacity: 0.5,
      x: 0,
      y: 0,
    },
    {
      id: 'l3',
      name: 'Nascosto',
      svgContent: '<svg><path d="M0 0 L10 10" fill="none"/></svg>',
      visible: false,
      opacity: 1,
    },
  ];

  const svg = createMultiLayerSvg(1000, 1000, layers);
  assert.ok(svg.includes('id="Livello_1_Personaggio_Vector"'));
  assert.ok(svg.includes('data-name="Personaggio Vector"'));
  assert.ok(svg.includes('inkscape:groupmode="layer"'));
  assert.ok(svg.includes('transform="translate(50, 120)"'));
  assert.ok(svg.includes('opacity="0.9"'));
  assert.ok(!svg.includes('Nascosto'));
});
