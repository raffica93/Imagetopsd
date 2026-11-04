import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSemanticWorker, MAX_REQUEST_BYTES } from './semanticWorker';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const body = {
  image,
  consent: true,
  userApiKey: 'fixture-session-key',
  stage: 'identify',
};
const request = (value: unknown) =>
  new Request('https://fixture.test/api/segment-semantic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
test('Worker discovery reuses validation and returns dynamic parts through a Web Response', async () => {
  const response = await handleSemanticWorker(
    request(body),
    {},
    async (key, model, png, signal, task) => {
      assert.equal(key, body.userApiKey);
      assert.equal(model, 'gemini-3.8-flash');
      assert.equal(task.stage, 'identify');
      assert.equal(signal.aborted, false);
      assert.ok(png.startsWith('iVBORw0KGgo'));
      return JSON.stringify({
        subject: 'Soldato',
        parts: [
          {
            name: 'Elmo',
            description: 'Copricapo metallico',
            box_2d: [0, 100, 300, 800],
          },
        ],
      });
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = await response.json();
  assert.equal(data.isMock, false);
  assert.equal(data.inventory.parts[0].name, 'Elmo');
  assert.equal(data.inventory.parts[0].id, 'part:1');
  assert.equal(JSON.stringify(data).includes(body.userApiKey), false);
});
test('Worker bindings are request-scoped and never mutate process environment', async () => {
  const before = process.env.GEMINI_API_KEY;
  for (const key of ['server-binding-one', 'server-binding-two']) {
    const response = await handleSemanticWorker(
      request({ ...body, userApiKey: undefined }),
      { GEMINI_API_KEY: key },
      async (received) => {
        assert.equal(received, key);
        throw { status: 429 };
      },
    );
    assert.equal(response.status, 429);
    assert.equal((await response.json()).parts, undefined);
  }
  assert.equal(process.env.GEMINI_API_KEY, before);
});
test('Worker errors preserve no-key, consent and quota semantics without demo fallbacks', async () => {
  assert.equal(
    (
      await handleSemanticWorker(
        request({ ...body, userApiKey: undefined }),
        {},
      )
    ).status,
    503,
  );
  assert.equal(
    (await handleSemanticWorker(request({ ...body, consent: false }), {}))
      .status,
    400,
  );
  const failed = await handleSemanticWorker(request(body), {}, async () => {
    throw { status: 503 };
  });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).parts, undefined);
});
test('Worker validates methods, streamed JSON, size and cancellation before inference', async () => {
  assert.equal(
    (
      await handleSemanticWorker(
        new Request('https://fixture.test/api/segment-semantic'),
      )
    ).status,
    405,
  );
  assert.equal(
    (
      await handleSemanticWorker(
        new Request('https://fixture.test/api/segment-semantic', {
          method: 'POST',
          body: 'bad',
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleSemanticWorker(
        new Request('https://fixture.test/api/segment-semantic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{broken',
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleSemanticWorker(
        new Request('https://fixture.test/api/segment-semantic', {
          method: 'POST',
          headers: { 'Content-Length': String(MAX_REQUEST_BYTES + 1) },
          body: '{}',
        }),
      )
    ).status,
    413,
  );
  const controller = new AbortController();
  controller.abort();
  const aborted = new Request(request(body), { signal: controller.signal });
  assert.equal((await handleSemanticWorker(aborted)).status, 499);
});
