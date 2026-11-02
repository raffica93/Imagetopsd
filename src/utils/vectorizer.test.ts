import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSmoothnessParams,
  getSimplificationParams,
  countSvgPaths,
  createMultiLayerSvg,
  DEFAULT_VECTOR_OPTIONS,
  getQuantizationTierInfo,
  extractPaletteFromSvg,
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

test('getQuantizationTierInfo provides accurate optimization levels for 2, 4, 8, 16, and 32 colors', () => {
  const q2 = getQuantizationTierInfo(2);
  assert.equal(q2.colors, 2);
  assert.ok(q2.badge.includes('Ultra Leggero'));
  assert.ok(q2.fileEfficiency.includes('-85%'));

  const q4 = getQuantizationTierInfo(4);
  assert.equal(q4.colors, 4);
  assert.ok(q4.fileEfficiency.includes('-65%'));

  const q8 = getQuantizationTierInfo(8);
  assert.equal(q8.colors, 8);
  assert.ok(q8.badge.includes('Ottimizzato'));

  const q16 = getQuantizationTierInfo(16);
  assert.equal(q16.colors, 16);
  assert.ok(q16.badge.includes('Consigliato'));

  const q32 = getQuantizationTierInfo(32);
  assert.equal(q32.colors, 32);
  assert.ok(q32.badge.includes('Fedeltà'));
});

test('extractPaletteFromSvg extracts unique fill colors correctly and filters out none/transparent', () => {
  const sampleSvg = `
    <svg>
      <path fill="#ff0000" d="M0 0"/>
      <path fill="rgb(0, 255, 0)" d="M10 10"/>
      <path fill="#ff0000" d="M20 20"/>
      <path fill="none" d="M30 30"/>
      <path fill="transparent" d="M40 40"/>
      <path fill="#0000ff" d="M50 50"/>
    </svg>
  `;
  const palette = extractPaletteFromSvg(sampleSvg);
  assert.equal(palette.length, 3);
  assert.ok(palette.includes('#ff0000'));
  assert.ok(palette.includes('rgb(0, 255, 0)'));
  assert.ok(palette.includes('#0000ff'));
  assert.ok(!palette.includes('none'));
  assert.ok(!palette.includes('transparent'));
});
