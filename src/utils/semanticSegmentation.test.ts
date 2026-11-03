import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSemanticParts, SEMANTIC_LABELS } from './semanticProtocol';
import {
  isPointInPolygon,
  rasterizeNormalizedPolygon,
  extractLineartMask,
  initializeSemanticRefinementMasks,
  ownersFromMasks,
  masksFromOwners,
  paintOwners,
  assignSelection,
  selectConnectedRegion,
  selectionPolygon,
  UNASSIGNED,
  EMPTY_PIXEL,
} from './semanticSegmentation';
import type { SemanticPart } from './semanticProtocol';
function image(w: number, h: number, fn: (x: number, y: number) => number[]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) d.set(fn(x, y), (y * w + x) * 4);
  return d;
}
const skin: SemanticPart = {
  id: 'skin',
  label: 'Pelle',
  box_2d: [200, 200, 800, 800],
  polygon: [
    [200, 200],
    [200, 800],
    [800, 800],
    [800, 200],
  ],
};

test('normalized polygons use [y,x], pixel centers, and preserve a concave outline', () => {
  const p: [number, number][] = [
    [100, 100],
    [100, 900],
    [400, 900],
    [400, 400],
    [900, 400],
    [900, 100],
  ];
  const m = rasterizeNormalizedPolygon(p, 100, 100);
  assert.equal(m[20 * 100 + 80], 1);
  assert.equal(m[80 * 100 + 20], 1);
  assert.equal(m[80 * 100 + 80], 0);
  assert.equal(
    isPointInPolygon(5, 5, [
      [0, 0],
      [0, 10],
      [10, 0],
    ]),
    false,
  );
});
test('protocol rejects arbitrary labels, invalid boxes and fake PNG masks', () => {
  assert.throws(() => validateSemanticParts([{ ...skin, label: 'face' }]));
  assert.throws(() =>
    validateSemanticParts([{ ...skin, box_2d: [0, 0, NaN, 1000] }]),
  );
  assert.throws(
    () => validateSemanticParts([skin], true),
    /senza maschere pixel/,
  );
  assert.throws(() => validateSemanticParts([{ ...skin, mask: 'fake' }], true));
  assert.equal(validateSemanticParts([skin])[0].label, 'Pelle');
});
test('unclassified source pixels remain unassigned rather than becoming clothing', () => {
  const d = image(20, 20, () => [140, 100, 80, 255]);
  const masks = initializeSemanticRefinementMasks(d, 20, 20, [skin]);
  assert.equal(masks.find((m) => m.label === 'Vestiti')!.pixelCount, 0);
  assert.equal(masks.find((m) => m.label === 'Da assegnare')!.pixelCount, 256);
  assert.equal(masks.find((m) => m.label === 'Pelle')!.pixelCount, 144);
});
test('black edge-connected background is separate from locally contrasting pen strokes', () => {
  const w = 40,
    h = 40,
    d = image(w, h, (x, y) =>
      x < 8 || x > 31 || y < 5 || y > 34
        ? [0, 0, 0, 255]
        : x === 20 && y > 10 && y < 28
          ? [15, 10, 8, 255]
          : [150, 115, 90, 255],
    );
  const masks = initializeSemanticRefinementMasks(d, w, h, []),
    ink = masks.find((m) => m.label === 'Tratto')!.mask,
    bg = masks.find((m) => m.label === 'Sfondo')!.mask;
  assert.equal(ink[0], 0);
  assert.equal(bg[0], 1);
  assert.equal(ink[20 * w + 20], 1);
  assert.equal(ink[20 * w + 15], 0);
  const broad = extractLineartMask(
    image(40, 40, () => [0, 0, 0, 255]),
    40,
    40,
  );
  assert.equal(
    broad.reduce((a, b) => a + b, 0),
    0,
  );
});
test('probability masks preserve disconnected eyes and holes instead of a filled connecting polygon', () => {
  const w = 20,
    h = 10,
    d = image(w, h, () => [120, 100, 90, 255]),
    pixels = new Uint8Array(w * h);
  for (let y = 3; y < 6; y++)
    for (const x of [3, 4, 5, 14, 15, 16]) pixels[y * w + x] = 255;
  const masks = initializeSemanticRefinementMasks(d, w, h, [
    {
      id: 'eyes',
      label: 'Occhi',
      box_2d: [0, 0, 1000, 1000],
      maskPixels: pixels,
    },
  ]);
  const m = masks.find((m) => m.label === 'Occhi')!;
  assert.equal(m.pixelCount, 18);
  assert.equal(m.mask[4 * w + 10], 0);
});
test('every nontransparent pixel has exactly one owner, including low alpha and ink', () => {
  const w = 20,
    h = 20,
    d = image(w, h, (x, y) =>
      x === 0 ? [0, 0, 0, 0] : x === 8 ? [15, 10, 8, 5] : [150, 110, 90, 255],
    );
  const masks = initializeSemanticRefinementMasks(d, w, h, [skin]);
  for (let i = 0; i < w * h; i++)
    assert.equal(
      masks.reduce((n, m) => n + m.mask[i], 0),
      d[i * 4 + 3] ? 1 : 0,
    );
  const o = ownersFromMasks(masks, d);
  assert.deepEqual(ownersFromMasks(masksFromOwners(o), d), o);
  assert.equal(o[0], EMPTY_PIXEL);
});
test('brush transfers pixels once, does not mutate history, and removal preserves the source', () => {
  const w = 20,
    h = 20,
    d = image(w, h, () => [150, 110, 90, 255]);
  const base = new Uint8Array(w * h).fill(SEMANTIC_LABELS.indexOf('Pelle'));
  const painted = paintOwners(
    base,
    d,
    w,
    h,
    { x: 4, y: 4 },
    { x: 16, y: 4 },
    2,
    'Occhi',
  );
  assert.equal(base[4 * w + 10], SEMANTIC_LABELS.indexOf('Pelle'));
  assert.equal(painted[4 * w + 10], SEMANTIC_LABELS.indexOf('Occhi'));
  const removed = paintOwners(
    painted,
    d,
    w,
    h,
    { x: 10, y: 4 },
    { x: 10, y: 4 },
    1,
    'Da assegnare',
  );
  assert.equal(removed[4 * w + 10], UNASSIGNED);
  assert.equal(painted[4 * w + 10], SEMANTIC_LABELS.indexOf('Occhi'));
});
test('zone selection respects connected color boundaries and lasso can transfer all roles', () => {
  const w = 20,
    h = 10,
    d = image(w, h, (x) =>
      x < 9
        ? [180, 110, 70, 255]
        : x === 9
          ? [0, 0, 0, 255]
          : [180, 110, 70, 255],
    );
  const region = selectConnectedRegion(d, w, h, { x: 4, y: 5 }, 20);
  assert.equal(
    region.reduce((a, b) => a + b, 0),
    90,
  );
  assert.equal(region[5 * w + 15], 0);
  const owners = new Uint8Array(w * h).fill(UNASSIGNED),
    poly = selectionPolygon(
      [
        { x: 10, y: 1 },
        { x: 19, y: 1 },
        { x: 19, y: 9 },
        { x: 10, y: 9 },
      ],
      w,
      h,
    );
  const assigned = assignSelection(owners, poly, d, 'Accessori');
  assert.equal(assigned[5 * w + 15], SEMANTIC_LABELS.indexOf('Accessori'));
  assert.equal(assigned[5 * w + 4], UNASSIGNED);
});
