import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSemanticInventory,
  validateSemanticParts,
} from './semanticProtocol';
import type { SemanticInventory, SemanticPart } from './semanticProtocol';
import {
  definitionsFromInventory,
  initializeSemanticRefinementMasks,
  ownersFromMasks,
  masksFromOwners,
  partCropBounds,
  mapPartsFromCrop,
  paintOwners,
} from './semanticSegmentation';
const plan: SemanticInventory = {
  id: 'soldier-test',
  subject: 'Soldato',
  parts: [
    {
      id: 'part:1',
      name: 'Spada',
      description: 'Arma in primo piano',
      box_2d: [100, 100, 900, 300],
    },
    {
      id: 'part:2',
      name: 'Elmo',
      description: 'Copricapo metallico',
      box_2d: [0, 300, 300, 700],
    },
    {
      id: 'part:3',
      name: 'Armatura superiore',
      description: 'Corazza del busto',
      box_2d: [300, 200, 600, 800],
    },
    {
      id: 'part:4',
      name: 'Armatura inferiore',
      description: 'Protezioni delle gambe',
      box_2d: [600, 200, 1000, 800],
    },
  ],
};
test('discovery validates subject-specific names and assigns stable IDs without manufacturing selections', () => {
  const raw = {
    subject: plan.subject,
    parts: plan.parts.map(({ id, ...part }) => part),
  };
  const found = validateSemanticInventory(raw, false);
  assert.deepEqual(
    found.parts.map((p) => p.name),
    plan.parts.map((p) => p.name),
  );
  assert.deepEqual(
    found.parts.map((p) => p.id),
    ['part:1', 'part:2', 'part:3', 'part:4'],
  );
  assert.ok(found.id);
  assert.equal('polygon' in found.parts[0], false);
  for (const value of [
    { ...plan, parts: [plan.parts[0], plan.parts[0]] },
    { ...plan, parts: [{ ...plan.parts[0], name: 'Sfondo' }] },
    { ...plan, parts: [{ ...plan.parts[0], box_2d: [-1, 0, 1000, 1000] }] },
    { ...plan, parts: [{ ...plan.parts[0], id: 'part:90' }] },
  ])
    assert.throws(() => validateSemanticInventory(value));
  assert.throws(() =>
    validateSemanticParts([
      {
        label: 'part:1',
        box_2d: [0, 0, 1000, 1000],
        polygon: [
          [0, 0],
          [0, 1000],
          [1000, 0],
        ],
      },
    ]),
  );
});
test('dynamic ownership follows front-to-back inventory order and conserves every source pixel', () => {
  const definitions = definitionsFromInventory(plan);
  assert.deepEqual(
    definitions.map((d) => d.defaultName).slice(1, 5),
    plan.parts.map((p) => p.name),
  );
  const data = new Uint8ClampedArray(20 * 20 * 4);
  for (let i = 0; i < 400; i++) data.set([150, 130, 110, 255], i * 4);
  const parts: SemanticPart[] = [
    {
      id: 'a',
      label: 'part:1',
      box_2d: [100, 100, 900, 900],
      polygon: [
        [100, 100],
        [100, 900],
        [900, 900],
        [900, 100],
      ],
    },
    {
      id: 'b',
      label: 'part:2',
      box_2d: [0, 0, 1000, 1000],
      polygon: [
        [0, 0],
        [0, 1000],
        [1000, 1000],
        [1000, 0],
      ],
    },
  ];
  const masks = initializeSemanticRefinementMasks(
      data,
      20,
      20,
      parts,
      definitions,
    ),
    owners = ownersFromMasks(masks, data);
  assert.equal(masks.find((m) => m.label === 'part:1')?.pixelCount, 256);
  assert.equal(masks.find((m) => m.label === 'part:2')?.pixelCount, 144);
  assert.equal(
    masks.reduce((n, m) => n + m.pixelCount, 0),
    400,
  );
  const edited = paintOwners(
    owners,
    data,
    20,
    20,
    { x: 5, y: 5 },
    { x: 5, y: 5 },
    1,
    'part:4',
    definitions,
  );
  assert.equal(
    edited[5 * 20 + 5],
    definitions.findIndex((d) => d.label === 'part:4'),
  );
  assert.equal(
    masksFromOwners(edited, definitions).reduce((n, m) => n + m.pixelCount, 0),
    400,
  );
});
test('crop geometry and disconnected probability pixels map back to the original canvas', () => {
  const crop = { left: 20, top: 10, width: 40, height: 30 };
  const pixels = new Uint8Array(1200);
  pixels[0] = 255;
  pixels[1199] = 128;
  const [part] = mapPartsFromCrop(
    [
      {
        id: 'a',
        label: 'part:2',
        box_2d: [0, 0, 1000, 1000],
        polygon: [
          [0, 0],
          [0, 1000],
          [1000, 1000],
          [1000, 0],
        ],
        maskPixels: pixels,
      },
    ],
    crop,
    100,
    80,
  );
  assert.deepEqual(part.box_2d, [125, 200, 500, 600]);
  assert.deepEqual(part.polygon?.[2], [500, 600]);
  assert.equal(part.maskPixels?.length, 8000);
  assert.equal(part.maskPixels?.[10 * 100 + 20], 255);
  assert.equal(part.maskPixels?.[39 * 100 + 59], 128);
  const bounded = partCropBounds(plan.parts[1], 100, 80);
  assert.equal(bounded.top, 0);
  assert.ok(bounded.left >= 0);
  assert.ok(bounded.left + bounded.width <= 100);
  assert.ok(bounded.height <= 80);
});

test('discovery puts contained details before their larger parent and preserves an explicitly reviewed order', () => {
  const raw = {
    subject: 'Figura con armatura',
    parts: [
      {
        name: 'armatura_superiore',
        description: 'Corazza grande',
        box_2d: [0, 0, 1000, 1000],
      },
      {
        name: 'fibbia',
        description: 'Piccolo dettaglio della cintura',
        box_2d: [600, 400, 700, 600],
      },
    ],
  };
  const found = validateSemanticInventory(raw, false);
  assert.deepEqual(
    found.parts.map((p) => p.name),
    ['Fibbia', 'Armatura superiore'],
  );
  assert.deepEqual(
    found.parts.map((p) => p.id),
    ['part:2', 'part:1'],
  );
  const reviewed = { ...found, parts: [...found.parts].reverse() };
  assert.deepEqual(
    validateSemanticInventory(reviewed).parts.map((p) => p.id),
    ['part:1', 'part:2'],
  );
});
