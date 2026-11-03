import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';
import { createSemanticHandler } from './semanticApi.ts';
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
