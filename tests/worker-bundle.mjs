// Integration check of the packaged Worker. Google replies here are synthetic.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import worker from '../build/site/server/index.js';
const origin = 'https://fixture.test',
  image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
async function files(directory, relative = '') {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, item.name);
    if (item.isDirectory())
      result.push(...(await files(path.join(directory, item.name), name)));
    else result.push(name);
  }
  return result;
}
for (const file of await files('dist')) {
  const response = await worker.fetch(new Request(origin + '/' + file), {});
  assert.equal(response.status, 200);
  assert.equal(
    createHash('sha256')
      .update(new Uint8Array(await response.arrayBuffer()))
      .digest('hex'),
    createHash('sha256')
      .update(await readFile(path.join('dist', file)))
      .digest('hex'),
    `packaged asset ${file}`,
  );
  const cached = await worker.fetch(
    new Request(origin + '/' + file, {
      headers: { 'If-None-Match': response.headers.get('ETag') },
    }),
    {},
  );
  assert.equal(cached.status, 304);
}
assert.equal(
  (await worker.fetch(new Request(origin + '/assets/missing.js'), {})).status,
  404,
);
assert.equal(
  (await worker.fetch(new Request(origin + '/api/health'), {})).status,
  200,
);
const realFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  assert.equal(
    new URL(request.url).hostname,
    'generativelanguage.googleapis.com',
  );
  assert.equal(request.headers.get('x-goog-api-key'), 'fixture-api-key');
  const body = await request.json();
  assert.ok(
    body.contents[0].parts[0].inlineData.data.startsWith('iVBORw0KGgo'),
  );
  assert.equal(
    body.generationConfig.responseSchema.properties.parts.items.properties
      .polygon?.items.minItems ?? 2,
    2,
  );
  const output =
    ++calls === 1
      ? {
          subject: 'Soldato',
          parts: [
            {
              name: 'Elmo',
              description: 'Copricapo metallico',
              box_2d: [0, 200, 300, 800],
            },
          ],
        }
      : calls === 2
        ? {
            parts: [
              {
                label: 'part:1',
                box_2d: [0, 0, 1000, 1000],
                polygon: [[0, 0, 1, 1]],
              },
            ],
          }
        : {
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
            ],
          };
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: JSON.stringify(output) }] },
          finishReason: 'STOP',
        },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
try {
  const post = (body) =>
    worker.fetch(
      new Request(origin + '/api/segment-semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          consent: true,
          userApiKey: 'fixture-api-key',
          ...body,
        }),
      }),
      {},
    );
  const first = await post({ stage: 'identify' }),
    data = await first.json();
  assert.equal(first.status, 200);
  assert.equal(data.isMock, false);
  assert.equal(data.inventory.parts[0].name, 'Elmo');
  const second = await post({
      stage: 'segment-part',
      inventory: data.inventory,
      partId: 'part:1',
    }),
    regions = await second.json();
  assert.equal(second.status, 200);
  assert.equal(regions.parts[0].label, 'part:1');
  assert.equal(
    calls,
    3,
    'malformed model contours are retried internally before the UI needs intervention',
  );
} finally {
  globalThis.fetch = realFetch;
}
console.log(
  'PASS packaged assets, caching and two-pass API through the bundled browser SDK',
);
