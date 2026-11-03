import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStoredProject } from './projectStorage';
const valid = () => ({
  version: 1,
  settings: {
    name: 'Progetto',
    width: 100,
    height: 100,
    dpi: 300,
    backgroundColor: 'transparent',
  },
  layers: [
    {
      name: 'Livello',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      pixelWidth: 100,
      pixelHeight: 100,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    },
  ],
});
test('project validation accepts bounded pixel projects', () =>
  assert.doesNotThrow(() => validateStoredProject(valid())));
test('project validation rejects invalid, nonfinite or excessive metadata before decoding', () => {
  for (const mutate of [
    (p: any) => (p.version = 2),
    (p: any) => (p.settings.width = Infinity),
    (p: any) => (p.layers[0].x = NaN),
    (p: any) => (p.layers[0].opacity = 2),
    (p: any) => (p.layers[0].blendMode = 'evil'),
    (p: any) => (p.layers[0].visible = 'yes'),
    (p: any) => (p.layers = Array(33).fill(p.layers[0])),
    (p: any) => {
      p.layers = Array(4).fill({
        ...p.layers[0],
        pixelWidth: 2000,
        pixelHeight: 2000,
      });
    },
  ]) {
    const p = valid();
    mutate(p);
    assert.throws(() => validateStoredProject(p));
  }
});

test('dynamic inventories survive project validation and malformed discovery metadata is rejected', () => {
  const project: any = valid();
  Object.assign(project.layers[0], {
    semanticGroupId: 'soldier-test',
    semanticRole: 'Originale',
    semanticLeft: 0,
    semanticTop: 0,
    semanticInventory: {
      id: 'soldier-test',
      subject: 'Soldato',
      parts: [
        {
          id: 'part:1',
          name: 'Elmo',
          description: 'Copricapo metallico',
          box_2d: [0, 0, 300, 500],
        },
      ],
    },
  });
  assert.doesNotThrow(() => validateStoredProject(project));
  project.layers[0].semanticInventory.parts[0].id = 'arbitrary-role';
  assert.throws(() => validateStoredProject(project));
});
