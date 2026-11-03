/** @license SPDX-License-Identifier: Apache-2.0 */
import type { LayerItem } from '../types';
import { MAX_IMAGE_PIXELS } from '../types';
import { createCanvas, context, makeLayer, loadImage } from './canvasHelpers';
import { SEMANTIC_LABELS } from './semanticProtocol';
import type { SemanticLabel, SemanticPart } from './semanticProtocol';
export type { SemanticLabel, SemanticPart } from './semanticProtocol';
export { validateSemanticParts } from './semanticProtocol';

export interface SemanticRefinementMask {
  partId: string;
  label: SemanticLabel;
  name: string;
  colorHex: string;
  mask: Uint8Array;
  pixelCount: number;
}
export const SEMANTIC_HIERARCHY: {
  label: SemanticLabel;
  defaultName: string;
  colorHex: string;
  description: string;
}[] = [
  {
    label: 'Tratto',
    defaultName: 'Tratto / Contorni (Lineart)',
    colorHex: '#455468',
    description: 'Segni scuri con contrasto locale, escluso lo sfondo',
  },
  {
    label: 'Accessori',
    defaultName: 'Accessori & Dettagli',
    colorHex: '#a855f7',
    description: 'Orecchini, gioielli e altri oggetti',
  },
  {
    label: 'Occhi',
    defaultName: 'Occhi',
    colorHex: '#06b6d4',
    description: 'Le parti visibili degli occhi',
  },
  {
    label: 'Bocca',
    defaultName: 'Bocca',
    colorHex: '#f43f5e',
    description: 'Labbra e interno della bocca',
  },
  {
    label: 'Capelli',
    defaultName: 'Capelli',
    colorHex: '#f97316',
    description: 'Capelli, frangia e ciocche',
  },
  {
    label: 'Pelle',
    defaultName: 'Pelle (Viso, Orecchie, Collo)',
    colorHex: '#eab308',
    description: 'Pelle visibile',
  },
  {
    label: 'Vestiti',
    defaultName: 'Vestiti & Abiti',
    colorHex: '#10b981',
    description: 'Indumenti',
  },
  {
    label: 'Sfondo',
    defaultName: 'Sfondo',
    colorHex: '#64748b',
    description: 'Sfondo dell’immagine',
  },
  {
    label: 'Da assegnare',
    defaultName: 'Da assegnare',
    colorHex: '#dc46a5',
    description: 'Pixel conservati che l’AI non ha assegnato: correggili qui',
  },
];
export const UNASSIGNED = SEMANTIC_LABELS.indexOf('Da assegnare');
export const EMPTY_PIXEL = 255;
const indexOf = (label: SemanticLabel) => SEMANTIC_LABELS.indexOf(label);
function assertImage(data: Uint8ClampedArray, width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_IMAGE_PIXELS ||
    data.length !== width * height * 4
  )
    throw new Error('Dimensioni immagine non valide.');
}
export function isPointInPolygon(
  x: number,
  y: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i],
      [yj, xj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function rasterizeNormalizedPolygon(
  polygon: [number, number][],
  width: number,
  height: number,
) {
  const mask = new Uint8Array(width * height);
  if (!polygon || polygon.length < 3) return mask;
  const scaled = polygon.map(
    ([y, x]) => [(y * height) / 1000, (x * width) / 1000] as [number, number],
  );
  const xs = scaled.map((p) => p[1]),
    ys = scaled.map((p) => p[0]);
  for (
    let y = Math.max(0, Math.floor(Math.min(...ys)));
    y < Math.min(height, Math.ceil(Math.max(...ys)));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(Math.min(...xs)));
      x < Math.min(width, Math.ceil(Math.max(...xs)));
      x++
    )
      if (isPointInPolygon(x + 0.5, y + 0.5, scaled)) mask[y * width + x] = 1;
  return mask;
}

/** Decode probability maps inside their own boxes; disconnected parts and holes survive. */
export async function decodeSemanticParts(
  parts: SemanticPart[],
  width: number,
  height: number,
): Promise<SemanticPart[]> {
  if (width * height > MAX_IMAGE_PIXELS)
    throw new Error('Immagine troppo grande.');
  const decoded: SemanticPart[] = [];
  for (const part of parts) {
    if (!part.mask) {
      decoded.push(part);
      continue;
    }
    const bytes = Uint8Array.from(atob(part.mask), (c) => c.charCodeAt(0));
    if (bytes.length < 24) throw new Error('PNG della maschera incompleto.');
    const header = new DataView(bytes.buffer);
    const w = header.getUint32(16),
      h = header.getUint32(20);
    if (!w || !h || w > 2048 || h > 2048 || w * h > MAX_IMAGE_PIXELS)
      throw new Error('Dimensioni della maschera non valide.');
    const image = await loadImage(`data:image/png;base64,${part.mask}`);
    const [y0, x0, y1, x1] = part.box_2d;
    const left = Math.floor((x0 * width) / 1000),
      top = Math.floor((y0 * height) / 1000);
    const right = Math.min(width, Math.ceil((x1 * width) / 1000)),
      bottom = Math.min(height, Math.ceil((y1 * height) / 1000));
    const canvas = createCanvas(right - left, bottom - top),
      ctx = context(canvas);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const p = (y * canvas.width + x) * 4;
        pixels[(y + top) * width + x + left] = Math.round(
          (rgba[p] * rgba[p + 3]) / 255,
        );
      }
    canvas.width = 1;
    canvas.height = 1;
    decoded.push({ ...part, mask: undefined, maskPixels: pixels });
  }
  return decoded;
}

function borderBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const result = new Uint8Array(width * height),
    corners = [0, width - 1, (height - 1) * width, width * height - 1];
  const base = corners[0] * 4;
  const cornerColor = [data[base], data[base + 1], data[base + 2]];
  if (!(Math.max(...cornerColor) < 30 || Math.min(...cornerColor) > 235))
    return result;
  if (
    !corners.every(
      (i) =>
        Math.hypot(
          data[i * 4] - data[base],
          data[i * 4 + 1] - data[base + 1],
          data[i * 4 + 2] - data[base + 2],
        ) < 15,
    )
  )
    return result;
  const queue = new Int32Array(width * height);
  let head = 0,
    tail = 0;
  function visit(i: number) {
    if (result[i]) return;
    const p = i * 4;
    if (
      data[p + 3] &&
      Math.hypot(
        data[p] - data[base],
        data[p + 1] - data[base + 1],
        data[p + 2] - data[base + 2],
      ) <= 18
    ) {
      result[i] = 1;
      queue[tail++] = i;
    }
  }
  corners.forEach(visit);
  while (head < tail) {
    const i = queue[head++],
      x = i % width;
    if (x) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < result.length) visit(i + width);
  }
  return result;
}

export function extractLineartMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  darknessThreshold = 90,
  foreground?: Uint8Array,
): Uint8Array {
  assertImage(data, width, height);
  const count = width * height,
    lum = new Float32Array(count),
    horizontal = new Float32Array(count),
    localMax = new Float32Array(count);
  const bg = foreground ? null : borderBackground(data, width, height);
  for (let i = 0; i < count; i++)
    lum[i] = data[i * 4 + 3]
      ? data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114
      : 0;
  const radius = Math.max(
    2,
    Math.min(8, Math.round(Math.min(width, height) / 220)),
  );
  // Separable maximum filter: local contrast without filling broad dark regions.
  const queue = new Int32Array(Math.max(width, height));
  for (let y = 0; y < height; y++) {
    let head = 0,
      tail = 0,
      next = 0;
    for (let x = 0; x < width; x++) {
      while (next < width && next <= x + radius) {
        while (
          tail > head &&
          lum[y * width + queue[tail - 1]] <= lum[y * width + next]
        )
          tail--;
        queue[tail++] = next++;
      }
      while (head < tail && queue[head] < x - radius) head++;
      horizontal[y * width + x] = lum[y * width + queue[head]];
    }
  }
  for (let x = 0; x < width; x++) {
    let head = 0,
      tail = 0,
      next = 0;
    for (let y = 0; y < height; y++) {
      while (next < height && next <= y + radius) {
        while (
          tail > head &&
          horizontal[queue[tail - 1] * width + x] <=
            horizontal[next * width + x]
        )
          tail--;
        queue[tail++] = next++;
      }
      while (head < tail && queue[head] < y - radius) head++;
      localMax[y * width + x] = horizontal[queue[head] * width + x];
    }
  }
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++)
    if (
      data[i * 4 + 3] > 0 &&
      (foreground ? foreground[i] : !bg![i]) &&
      lum[i] < darknessThreshold &&
      localMax[i] - lum[i] > 18
    )
      out[i] = 1;
  return out;
}

export function masksFromOwners(owners: Uint8Array): SemanticRefinementMask[] {
  return SEMANTIC_HIERARCHY.map((h, index) => {
    const mask = new Uint8Array(owners.length);
    let pixelCount = 0;
    for (let i = 0; i < owners.length; i++)
      if (owners[i] === index) {
        mask[i] = 1;
        pixelCount++;
      }
    return {
      ...h,
      partId: `mask-${index}`,
      name: h.defaultName,
      mask,
      pixelCount,
    };
  });
}
export function ownersFromMasks(
  masks: SemanticRefinementMask[],
  data: Uint8ClampedArray,
) {
  const owners = new Uint8Array(data.length / 4).fill(EMPTY_PIXEL);
  for (let i = 0; i < owners.length; i++)
    if (data[i * 4 + 3]) owners[i] = UNASSIGNED;
  // Highest-priority layer wins any legacy overlap. No source pixels are dropped.
  for (const h of [...SEMANTIC_HIERARCHY].reverse()) {
    const mask = masks.find((m) => m.label === h.label)?.mask;
    if (!mask) continue;
    for (let i = 0; i < owners.length; i++)
      if (data[i * 4 + 3] && mask[i]) owners[i] = indexOf(h.label);
  }
  return owners;
}
export function initializeSemanticRefinementMasks(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  parts: SemanticPart[],
): SemanticRefinementMask[] {
  assertImage(data, width, height);
  const owners = new Uint8Array(width * height).fill(EMPTY_PIXEL);
  const candidates = parts
    .filter((p) => p.label !== 'Tratto')
    .map((p) => ({
      label: p.label,
      pixels:
        p.maskPixels ??
        rasterizeNormalizedPolygon(p.polygon ?? [], width, height),
      binary: !p.maskPixels,
    }));
  for (let i = 0; i < owners.length; i++)
    if (data[i * 4 + 3]) {
      owners[i] = UNASSIGNED;
      for (const h of SEMANTIC_HIERARCHY) {
        if (h.label === 'Tratto' || h.label === 'Da assegnare') continue;
        if (
          candidates.some(
            (c) =>
              c.label === h.label &&
              (c.binary ? c.pixels[i] > 0 : c.pixels[i] >= 128),
          )
        ) {
          owners[i] = indexOf(h.label);
          break;
        }
      }
    }
  const inferred = borderBackground(data, width, height),
    fg = new Uint8Array(owners.length);
  for (let i = 0; i < owners.length; i++) {
    if (owners[i] === UNASSIGNED && inferred[i]) owners[i] = indexOf('Sfondo');
    fg[i] = Number(
      owners[i] !== EMPTY_PIXEL && owners[i] !== indexOf('Sfondo'),
    );
  }
  const ink = extractLineartMask(data, width, height, 90, fg);
  for (let i = 0; i < ink.length; i++)
    if (ink[i]) owners[i] = indexOf('Tratto');
  return masksFromOwners(owners);
}

export type SelectionPoint = { x: number; y: number };
export function selectConnectedRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  start: SelectionPoint,
  tolerance: number,
  limit?: Uint8Array,
): Uint8Array {
  assertImage(data, width, height);
  const selected = new Uint8Array(width * height),
    visited = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  const sx = Math.floor(start.x),
    sy = Math.floor(start.y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return selected;
  const seed = sy * width + sx,
    p = seed * 4;
  if (!data[p + 3]) return selected;
  const t = Math.max(0, Math.min(160, tolerance));
  let head = 0,
    tail = 0;
  function visit(i: number) {
    if (visited[i]) return;
    visited[i] = 1;
    const q = i * 4;
    if (
      data[q + 3] &&
      (!limit || limit[i]) &&
      Math.hypot(
        data[q] - data[p],
        data[q + 1] - data[p + 1],
        data[q + 2] - data[p + 2],
      ) <= t
    ) {
      selected[i] = 1;
      queue[tail++] = i;
    }
  }
  visit(seed);
  while (head < tail) {
    const i = queue[head++],
      x = i % width;
    if (x) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < selected.length) visit(i + width);
  }
  return selected;
}
export function selectionPolygon(
  points: SelectionPoint[],
  width: number,
  height: number,
) {
  return rasterizeNormalizedPolygon(
    points.map((p) => [(p.y * 1000) / height, (p.x * 1000) / width]),
    width,
    height,
  );
}
export function paintOwners(
  owners: Uint8Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  from: SelectionPoint,
  to: SelectionPoint,
  radius: number,
  target: SemanticLabel,
) {
  const next = new Uint8Array(owners),
    r = Math.max(0.5, Math.min(1000, radius)),
    steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, r * 0.4),
      ),
    );
  for (let s = 0; s <= steps; s++) {
    const cx = from.x + ((to.x - from.x) * s) / steps,
      cy = from.y + ((to.y - from.y) * s) / steps;
    for (
      let y = Math.max(0, Math.floor(cy - r));
      y <= Math.min(height - 1, Math.ceil(cy + r));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(cx - r));
        x <= Math.min(width - 1, Math.ceil(cx + r));
        x++
      )
        if (
          (x - cx) ** 2 + (y - cy) ** 2 <= r * r &&
          data[(y * width + x) * 4 + 3]
        )
          next[y * width + x] = indexOf(target);
  }
  return next;
}
export function assignSelection(
  owners: Uint8Array,
  selection: Uint8Array,
  data: Uint8ClampedArray,
  target: SemanticLabel,
) {
  if (selection.length !== owners.length)
    throw new Error('Selezione non valida.');
  const next = new Uint8Array(owners);
  for (let i = 0; i < next.length; i++)
    if (selection[i] && data[i * 4 + 3]) next[i] = indexOf(target);
  return next;
}

export function buildProjectLayersFromMasks(
  source: LayerItem,
  masks: SemanticRefinementMask[],
): LayerItem[] {
  const width = source.canvas.width,
    height = source.canvas.height,
    data = context(source.canvas).getImageData(0, 0, width, height).data;
  const owners = ownersFromMasks(masks, data),
    group = source.semanticGroupId ?? crypto.randomUUID(),
    layers: LayerItem[] = [];
  for (let index = 0; index < SEMANTIC_HIERARCHY.length; index++) {
    let left = width,
      top = height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (owners[y * width + x] === index) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
    if (right < left) continue;
    const canvas = createCanvas(right - left + 1, bottom - top + 1),
      ctx = context(canvas),
      image = ctx.createImageData(canvas.width, canvas.height);
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++)
        if (owners[y * width + x] === index)
          image.data.set(
            data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
            ((y - top) * canvas.width + x - left) * 4,
          );
    ctx.putImageData(image, 0, 0);
    const sx = source.width / width,
      sy = source.height / height,
      item = makeLayer(
        canvas,
        SEMANTIC_HIERARCHY[index].defaultName,
        source.x + left * sx,
        source.y + top * sy,
      );
    Object.assign(item, {
      width: canvas.width * sx,
      height: canvas.height * sy,
      opacity: source.opacity,
      blendMode: source.blendMode,
      semanticGroupId: group,
      semanticRole: SEMANTIC_HIERARCHY[index].label,
      semanticLeft: left,
      semanticTop: top,
    });
    layers.push(item);
  }
  const original = makeLayer(
    source.canvas,
    'Originale (Recupero)',
    source.x,
    source.y,
  );
  Object.assign(original, {
    width: source.width,
    height: source.height,
    opacity: source.opacity,
    blendMode: source.blendMode,
    visible: false,
    locked: true,
    semanticGroupId: group,
    semanticRole: 'Originale',
    semanticLeft: 0,
    semanticTop: 0,
  });
  layers.push(original);
  return layers;
}

/** Keep edits made in the layer panel when masks are refined again. */
export function preserveSemanticLayerEdits(
  generated: LayerItem[],
  existing: LayerItem[],
) {
  return generated.map((layer) => {
    const before = existing.find(
      (item) => item.semanticRole === layer.semanticRole,
    );
    if (!before) return layer;
    const sx = before.width / before.canvas.width,
      sy = before.height / before.canvas.height;
    return {
      ...layer,
      id: before.id,
      name: before.name,
      visible: before.visible,
      locked: before.locked,
      opacity: before.opacity,
      blendMode: before.blendMode,
      x:
        before.x +
        ((layer.semanticLeft ?? 0) - (before.semanticLeft ?? 0)) * sx,
      y: before.y + ((layer.semanticTop ?? 0) - (before.semanticTop ?? 0)) * sy,
      width: layer.canvas.width * sx,
      height: layer.canvas.height * sy,
    };
  });
}

/** Reopen a generated group without a second API request or duplicated extraction. */
export function restoreGroupMasks(source: LayerItem, layers: LayerItem[]) {
  const w = source.canvas.width,
    h = source.canvas.height,
    raw = context(source.canvas).getImageData(0, 0, w, h).data;
  const owners = new Uint8Array(w * h).fill(EMPTY_PIXEL);
  for (let i = 0; i < owners.length; i++)
    if (raw[i * 4 + 3]) owners[i] = UNASSIGNED;
  for (const l of [...layers].reverse()) {
    const label = l.semanticRole as SemanticLabel;
    if (!SEMANTIC_LABELS.includes(label)) continue;
    const pixels = context(l.canvas).getImageData(
      0,
      0,
      l.canvas.width,
      l.canvas.height,
    ).data;
    const left = l.semanticLeft ?? Math.round(l.x - source.x),
      top = l.semanticTop ?? Math.round(l.y - source.y);
    for (let y = 0; y < l.canvas.height; y++)
      for (let x = 0; x < l.canvas.width; x++) {
        const tx = x + left,
          ty = y + top;
        if (
          tx >= 0 &&
          tx < w &&
          ty >= 0 &&
          ty < h &&
          pixels[(y * l.canvas.width + x) * 4 + 3] &&
          raw[(ty * w + tx) * 4 + 3]
        )
          owners[ty * w + tx] = indexOf(label);
      }
  }
  return masksFromOwners(owners);
}
