import { segmentImageByColors } from './segmentationCore';
import { MAX_IMAGE_PIXELS, MAX_LAYERS, MAX_PROJECT_PIXELS } from '../types';

export interface ExtractionOptions {
  mode: 'objects' | 'colors';
  background: 'transparent' | 'white';
  tolerance: number;
  colors: number;
}
export interface ExtractedPixels {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}
export interface ExtractionResult {
  elements: ExtractedPixels[];
  ignored: number;
}

// Remove only white pixels connected to an edge: whites inside stickers survive.
function eraseBorderBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
) {
  const count = width * height,
    visited = new Uint8Array(count),
    queue = new Int32Array(count);
  let head = 0,
    tail = 0;
  const enqueue = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    const p = i * 4;
    const dist = Math.hypot(
      255 - data[p],
      255 - data[p + 1],
      255 - data[p + 2],
    );
    if (data[p + 3] === 0 || dist <= tolerance) {
      queue[tail++] = i;
      data[p + 3] = 0;
    }
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++],
      x = i % width;
    if (x > 0) enqueue(i - 1);
    if (x + 1 < width) enqueue(i + 1);
    if (i >= width) enqueue(i - width);
    if (i + width < count) enqueue(i + width);
  }
}

export function extractPixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  options: ExtractionOptions,
): ExtractionResult {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_IMAGE_PIXELS ||
    input.length !== width * height * 4
  ) {
    throw new Error('Dimensioni immagine non valide o troppo grandi.');
  }
  if (
    !['objects', 'colors'].includes(options.mode) ||
    !['white', 'transparent'].includes(options.background) ||
    !Number.isFinite(options.tolerance) ||
    options.tolerance < 0 ||
    options.tolerance > 150 ||
    ![4, 6, 8].includes(options.colors)
  ) {
    throw new Error('Impostazioni di separazione non valide.');
  }
  const data = new Uint8ClampedArray(input);
  if (options.background === 'white')
    eraseBorderBackground(data, width, height, options.tolerance);
  const total = width * height,
    elements: ExtractedPixels[] = [];
  let ignored = 0;
  if (options.mode === 'colors') {
    const result = segmentImageByColors(data, width, height, {
      numberOfColors: options.colors,
      separateLineart: true,
      bgMode: 'alpha',
      minPixelCount: 12,
    });
    let outputPixels = 0;
    result.clusters.forEach((cluster, index) => {
      const { minX, minY, maxX, maxY } = cluster.bounds;
      const w = maxX - minX + 1,
        h = maxY - minY + 1;
      outputPixels += w * h;
      if (outputPixels > MAX_PROJECT_PIXELS)
        throw new Error(
          'I gruppi di colore richiedono troppa memoria. Prova con 4 colori o un’immagine più piccola.',
        );
      const pixels = new Uint8ClampedArray(w * h * 4);
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const i = y * width + x;
          if (result.pixelClusterIndices[i] === index)
            pixels.set(
              data.subarray(i * 4, i * 4 + 4),
              ((y - minY) * w + x - minX) * 4,
            );
        }
      elements.push({
        name: cluster.name.split(' / ')[0],
        x: minX,
        y: minY,
        width: w,
        height: h,
        pixels,
      });
    });
    const kept = elements.reduce(
      (n, e) =>
        n + e.pixels.reduce((c, a, i) => c + (i % 4 === 3 && a > 0 ? 1 : 0), 0),
      0,
    );
    ignored =
      data.reduce((n, a, i) => n + (i % 4 === 3 && a > 0 ? 1 : 0), 0) - kept;
  } else {
    const visited = new Uint8Array(total),
      queue = new Int32Array(total);
    // Reuse one queue, and copy only pixels belonging to this component.
    for (let start = 0; start < total; start++) {
      if (visited[start] || data[start * 4 + 3] === 0) continue;
      let head = 0,
        tail = 1;
      queue[0] = start;
      visited[start] = 1;
      let minX = width,
        minY = height,
        maxX = 0,
        maxY = 0;
      while (head < tail) {
        const i = queue[head++],
          x = i % width,
          y = Math.floor(i / width);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        const visit = (j: number) => {
          if (!visited[j] && data[j * 4 + 3] > 0) {
            visited[j] = 1;
            queue[tail++] = j;
          }
        };
        if (x) visit(i - 1);
        if (x + 1 < width) visit(i + 1);
        if (y) visit(i - width);
        if (y + 1 < height) visit(i + width);
      }
      if (tail < 12) {
        ignored += tail;
        continue;
      }
      if (elements.length === MAX_LAYERS)
        throw new Error(
          'Troppi elementi rilevati. Prova la separazione per colori o il ritaglio manuale (massimo 32 livelli).',
        );
      const w = maxX - minX + 1,
        h = maxY - minY + 1,
        pixels = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < tail; j++) {
        const i = queue[j],
          x = (i % width) - minX,
          y = Math.floor(i / width) - minY;
        pixels.set(data.subarray(i * 4, i * 4 + 4), (y * w + x) * 4);
      }
      elements.push({
        name: `Elemento ${elements.length + 1}`,
        x: minX,
        y: minY,
        width: w,
        height: h,
        pixels,
      });
    }
  }
  if (!elements.length)
    throw new Error(
      'Nessun elemento trovato. Prova uno sfondo diverso o usa il ritaglio manuale.',
    );
  return { elements, ignored };
}
