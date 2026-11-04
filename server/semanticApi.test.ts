import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';
import { createSemanticHandler, inferenceSpec } from './semanticApi.ts';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
async function serve(
  infer: Parameters<typeof createSemanticHandler>[0],
  run: (url: string) => Promise<void>,
) {
  const app = createApp(createSemanticHandler(infer)),
    server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}
async function post(url: string, body: unknown) {
  return fetch(url + '/api/segment-semantic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const body = { image, consent: true, userApiKey: 'test-session-only-key' };
test('valid contours preserve their geometry and declare the actual model and format', async () => {
  const region = {
    label: 'Pelle',
    box_2d: [10, 20, 600, 800],
    polygon: [
      [10, 20],
      [10, 800],
      [600, 800],
      [600, 20],
    ],
  };
  await serve(
    async (key, model, png, signal) => {
      assert.equal(key, body.userApiKey);
      assert.equal(model, 'gemini-3.5-flash-lite');
      assert.ok(png.startsWith('iVBORw0KGgo'));
      assert.equal(signal.aborted, false);
      return JSON.stringify({ parts: [region] });
    },
    async (url) => {
      const response = await post(url, body),
        data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.isMock, false);
      assert.equal(data.modelUsed, 'gemini-3.5-flash-lite');
      assert.equal(data.maskFormat, 'polygons');
      assert.deepEqual(data.parts[0].polygon, region.polygon);
      assert.deepEqual(data.parts[0].box_2d, region.box_2d);
    },
  );
});
test('failed Google calls never replace an uploaded photo with demo polygons', async () => {
  await serve(
    async () => {
      throw Object.assign(new Error('Do not expose request headers'), {
        status: 503,
      });
    },
    async (url) => {
      const res = await post(url, body),
        data = await res.json();
      assert.equal(res.status, 503);
      assert.ok(data.error);
      assert.equal(data.parts, undefined);
      assert.equal(data.isMock, undefined);
      assert.equal(
        JSON.stringify(data).includes('test-session-only-key'),
        false,
      );
    },
  );
});
test('invalid or truncated segmentation responses are errors, not successful mocks', async () => {
  for (const output of [
    '{"parts":[',
    JSON.stringify({
      parts: [
        {
          label: 'Pelle',
          box_2d: [0, 0, 1000, 1000],
          polygon: [[0, 0]],
        },
      ],
    }),
  ]) {
    await serve(
      async () => output,
      async (url) => {
        const res = await post(url, body);
        assert.equal(res.status, 502);
        assert.equal((await res.json()).parts, undefined);
      },
    );
  }
});
test('a partly invalid response retains genuine valid regions and explicitly reports discarded contours', async () => {
  const valid = {
    label: 'Occhi',
    box_2d: [100, 100, 200, 200],
    polygon: [
      [100, 100],
      [100, 200],
      [200, 100],
    ],
  };
  await serve(
    async () =>
      JSON.stringify({
        parts: [
          valid,
          {
            ...valid,
            label: 'Pelle',
            polygon: [
              [-10, 50],
              [100, 200],
              [200, 100],
            ],
          },
        ],
      }),
    async (url) => {
      const response = await post(url, body),
        data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.isMock, false);
      assert.equal(data.discardedParts, 1);
      assert.equal(data.parts.length, 1);
      assert.deepEqual(data.parts[0].polygon, valid.polygon);
    },
  );
});
test('consent, image bounds, model selection and explicit demo identity are checked', async () => {
  let calls = 0;
  await serve(
    async () => {
      calls++;
      return '{}';
    },
    async (url) => {
      for (const bad of [
        { ...body, consent: false },
        { ...body, image: 'not png' },
        { ...body, modelId: 'paid-model' },
        { ...body, stage: 'identify', complexity: 'invented' },
        { useMockDemo: true },
      ])
        assert.equal((await post(url, bad)).status, 400);
      const demo = await post(url, { useMockDemo: true, demoType: 'warrior' });
      assert.equal(demo.status, 200);
      assert.equal((await demo.json()).isMock, true);
      assert.equal(calls, 0);
    },
  );
});

test('complexity changes grouping instructions and survives discovery validation', async () => {
  const essential = inferenceSpec({
    stage: 'identify',
    complexity: 'essential',
  }).prompt;
  const detailed = inferenceSpec({
    stage: 'identify',
    complexity: 'detailed',
  }).prompt;
  assert.match(essential, /complete armor.*together/);
  assert.match(detailed, /pauldrons/);
  assert.notEqual(essential, detailed);
  await serve(
    async (_key, _model, _image, _signal, task) => {
      assert.equal(task.stage, 'identify');
      assert.ok(task.stage === 'identify' && task.complexity === 'essential');
      return JSON.stringify({ subject: 'Soldato', parts: inventory.parts });
    },
    async (url) => {
      const response = await post(url, {
        ...body,
        stage: 'identify',
        complexity: 'essential',
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).inventory.complexity, 'essential');
    },
  );
});
test('quota errors remain quota errors without fallback or disclosure', async () => {
  await serve(
    async () => {
      throw { status: 429 };
    },
    async (url) => {
      const res = await post(url, body);
      assert.equal(res.status, 429);
      const data = await res.json();
      assert.match(data.error, /Quota/);
      assert.equal(data.parts, undefined);
    },
  );
});

const inventory = {
  id: 'soldier-test',
  subject: 'Soldato',
  parts: [
    {
      id: 'part:1' as const,
      name: 'Elmo',
      description: 'Copricapo di metallo',
      box_2d: [0, 200, 300, 800],
    },
  ],
};
test('first pass discovers custom parts and order without producing pixel masks', async () => {
  await serve(
    async (_key, _model, _image, _signal, task) => {
      assert.equal(task.stage, 'identify');
      return JSON.stringify({
        subject: 'Soldato',
        parts: [
          {
            name: 'Elmo',
            description: 'Copricapo di metallo',
            box_2d: [0, 200, 300, 800],
          },
          {
            name: 'Armatura superiore',
            description: 'Corazza del busto',
            box_2d: [300, 200, 600, 800],
          },
          {
            name: 'Armatura inferiore',
            description: 'Protezioni delle gambe',
            box_2d: [600, 200, 1000, 800],
          },
        ],
      });
    },
    async (url) => {
      const response = await post(url, { ...body, stage: 'identify' }),
        data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.isMock, false);
      assert.deepEqual(
        data.inventory.parts.map((p: any) => p.name),
        ['Elmo', 'Armatura superiore', 'Armatura inferiore'],
      );
      assert.deepEqual(
        data.inventory.parts.map((p: any) => p.id),
        ['part:1', 'part:2', 'part:3'],
      );
      assert.ok(data.inventory.id);
      assert.equal(data.parts, undefined);
      assert.equal(data.inventory.parts[0].polygon, undefined);
    },
  );
});
test('second pass targets only an identified part and accepts its crop-local contours', async () => {
  await serve(
    async (_key, _model, _image, _signal, task) => {
      assert.equal(task.stage, 'segment-part');
      if (task.stage !== 'segment-part') throw Error('Wrong stage');
      assert.equal(task.part.name, 'Elmo');
      return JSON.stringify({
        parts: [
          {
            label: 'part:1',
            box_2d: [0, 0, 1000, 1000],
            polygon: [
              [0, 0],
              [0, 1000],
              [1000, 0],
            ],
          },
          {
            label: 'Pelle',
            box_2d: [0, 0, 1000, 1000],
            polygon: [
              [0, 0],
              [0, 1000],
              [1000, 0],
            ],
          },
        ],
      });
    },
    async (url) => {
      const response = await post(url, {
          ...body,
          stage: 'segment-part',
          inventory,
          partId: 'part:1',
        }),
        data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.parts.length, 1);
      assert.equal(data.parts[0].label, 'part:1');
      assert.equal(data.discardedParts, 1);
    },
  );
});
test('a genuinely invisible part can return no contours without blocking automatic completion', async () => {
  await serve(
    async () => JSON.stringify({ parts: [] }),
    async (url) => {
      const response = await post(url, {
        ...body,
        stage: 'segment-part',
        inventory,
        partId: 'part:1',
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.isMock, false);
      assert.deepEqual(data.parts, []);
      assert.equal(data.maskFormat, 'polygons');
    },
  );
});
test('unknown part IDs and invalid discovery lists are rejected before any Google call', async () => {
  let calls = 0;
  await serve(
    async () => {
      calls++;
      return '{}';
    },
    async (url) => {
      for (const request of [
        { stage: 'unknown' },
        { stage: 'segment-part', inventory, partId: 'part:2' },
        {
          stage: 'segment-part',
          inventory: {
            ...inventory,
            parts: [...inventory.parts, ...inventory.parts],
          },
          partId: 'part:1',
        },
      ])
        assert.equal((await post(url, { ...body, ...request })).status, 400);
      assert.equal(calls, 0);
    },
  );
});
