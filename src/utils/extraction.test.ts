import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPixels } from './extraction';
import type { ExtractionOptions } from './extraction';
const options: ExtractionOptions = {
  mode: 'objects',
  background: 'transparent',
  tolerance: 40,
  colors: 6,
};
function image(
  w: number,
  h: number,
  paint: (x: number, y: number) => number[],
) {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) pixels.set(paint(x, y), (y * w + x) * 4);
  return pixels;
}
function reconstruct(
  elements: ReturnType<typeof extractPixels>['elements'],
  w: number,
  h: number,
) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const e of elements)
    for (let y = 0; y < e.height; y++)
      for (let x = 0; x < e.width; x++) {
        const i = (y * e.width + x) * 4;
        if (e.pixels[i + 3])
          data.set(e.pixels.subarray(i, i + 4), ((e.y + y) * w + e.x + x) * 4);
      }
  return data;
}

test('object masks isolate nested components without duplicating the pixels inside bounding boxes', () => {
  const w = 25,
    h = 25;
  const pixels = image(w, h, (x, y) => {
    if (
      ((x === 1 || x === 23) && y >= 1 && y <= 23) ||
      ((y === 1 || y === 23) && x >= 1 && x <= 23)
    )
      return [255, 0, 0, 255];
    if (x >= 9 && x <= 14 && y >= 9 && y <= 14) return [0, 0, 255, 255];
    return [0, 0, 0, 0];
  });
  const result = extractPixels(pixels, w, h, options);
  assert.equal(result.elements.length, 2);
  assert.deepEqual(reconstruct(result.elements, w, h), pixels);
  assert.equal(
    result.elements[0].pixels[((11 - 1) * 23 + 11 - 1) * 4 + 3],
    0,
    'the enclosing mask must not contain the blue component',
  );
});
test('white background removal is edge connected and preserves white inside a colored outline', () => {
  const w = 15,
    h = 15;
  const pixels = image(w, h, (x, y) =>
    x >= 3 &&
    x <= 11 &&
    y >= 3 &&
    y <= 11 &&
    (x === 3 || x === 11 || y === 3 || y === 11)
      ? [200, 30, 30, 255]
      : [255, 255, 255, 255],
  );
  const result = extractPixels(pixels, w, h, {
    ...options,
    background: 'white',
  });
  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].width, 9);
  const data = reconstruct(result.elements, w, h);
  assert.equal(data[3], 0);
  assert.deepEqual(
    [...data.slice((7 * w + 7) * 4, (7 * w + 7) * 4 + 4)],
    [255, 255, 255, 255],
  );
});
test('object extraction preserves partial alpha pixels and reports discarded specks', () => {
  const pixels = image(20, 10, (x, y) =>
    x >= 1 && x <= 5 && y >= 2 && y <= 6
      ? [130, 50, 10, x === 1 ? 5 : 200]
      : x === 18 && y === 8
        ? [50, 50, 50, 255]
        : [0, 0, 0, 0],
  );
  const result = extractPixels(pixels, 20, 10, options);
  assert.equal(result.ignored, 1);
  assert.equal(result.elements[0].pixels[3], 5);
});
test('color extraction preserves the original RGB values rather than painting centroids', () => {
  const pixels = image(20, 10, (x) =>
    x < 10 ? [210, 30, 30, 255] : [30, 60, 200, 255],
  );
  const result = extractPixels(pixels, 20, 10, { ...options, mode: 'colors' });
  assert.equal(result.elements.length, 2);
  assert.deepEqual(reconstruct(result.elements, 20, 10), pixels);
});
test('empty, excessive and malformed images fail without emitting a partial project', () => {
  assert.throws(
    () => extractPixels(new Uint8ClampedArray(100), 5, 5, options),
    /Nessun elemento/,
  );
  assert.throws(
    () => extractPixels(new Uint8ClampedArray(16), 5000, 5000, options),
    /Dimensioni/,
  );
  assert.throws(
    () =>
      extractPixels(new Uint8ClampedArray(16), 2, 2, {
        ...options,
        tolerance: NaN,
      }),
    /Impostazioni/,
  );
  const pixels = image(100, 100, (x, y) =>
    x % 10 < 4 && y % 10 < 4 ? [200, 0, 0, 255] : [0, 0, 0, 0],
  );
  assert.throws(
    () => extractPixels(pixels, 100, 100, options),
    /Troppi elementi/,
  );
});
