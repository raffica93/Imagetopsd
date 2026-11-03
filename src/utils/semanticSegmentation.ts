/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LayerItem } from '../types';
import { createCanvas, context, makeLayer } from './canvasHelpers';

export type SemanticLabel =
  | 'Tratto'
  | 'Accessori'
  | 'Occhi'
  | 'Bocca'
  | 'Capelli'
  | 'Pelle'
  | 'Vestiti'
  | 'Sfondo';

export interface SemanticPart {
  id: string;
  label: SemanticLabel;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0-1000
  polygon: [number, number][]; // [[y, x], ...] in 0-1000
  confidence: number;
  description?: string;
}

export interface SemanticRefinementMask {
  partId: string;
  label: SemanticLabel;
  name: string;
  colorHex: string;
  // Binary mask over full canvas: 1 = included, 0 = not included
  mask: Uint8Array;
  pixelCount: number;
}

export const SEMANTIC_HIERARCHY: Array<{
  label: SemanticLabel;
  defaultName: string;
  colorHex: string;
  description: string;
}> = [
  {
    label: 'Tratto',
    defaultName: 'Tratto / Contorni (Lineart)',
    colorHex: '#1f2937',
    description: 'Tratto a china e contorni neri/scuri isolati con filtro di contrasto',
  },
  {
    label: 'Accessori',
    defaultName: 'Accessori & Dettagli',
    colorHex: '#a855f7',
    description: 'Armi, orecchini, gioielli, fibbie, cinture e oggetti impugnati',
  },
  {
    label: 'Occhi',
    defaultName: 'Occhi',
    colorHex: '#06b6d4',
    description: 'Iridi, riflessi, pupille, bulbi oculari e ciglia',
  },
  {
    label: 'Bocca',
    defaultName: 'Bocca',
    colorHex: '#f43f5e',
    description: 'Labbra, denti e interno della bocca',
  },
  {
    label: 'Capelli',
    defaultName: 'Capelli',
    colorHex: '#f97316',
    description: 'Capigliatura, frangia, ciocche laterali lunghe e volume',
  },
  {
    label: 'Pelle',
    defaultName: 'Pelle (Viso, Orecchie, Collo)',
    colorHex: '#eab308',
    description: 'Incarnato di viso, orecchie, collo e braccia/mani esposte',
  },
  {
    label: 'Vestiti',
    defaultName: 'Vestiti & Abiti',
    colorHex: '#10b981',
    description: 'Tunica, camicia, mantello, colletti e indumenti del personaggio',
  },
  {
    label: 'Sfondo',
    defaultName: 'Sfondo',
    colorHex: '#64748b',
    description: 'Sfondo o scenario retrostante il personaggio',
  },
];

/**
 * Checks if a point (x, y) is inside a polygon using ray-casting algorithm.
 */
export function isPointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1];
    const yi = polygon[i][0];
    const xj = polygon[j][1];
    const yj = polygon[j][0];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Rasterizes a polygon in normalized [0-1000] coordinates to a binary Uint8Array mask of size width * height.
 */
export function rasterizeNormalizedPolygon(
  polygon: [number, number][],
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (!polygon || polygon.length < 3) return mask;

  const scaledPolygon: [number, number][] = polygon.map(([yNorm, xNorm]) => [
    (yNorm / 1000) * height,
    (xNorm / 1000) * width,
  ]);

  // In Node.js or environments without DOM Canvas, use pure point-in-polygon
  if (typeof document === 'undefined') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isPointInPolygon(x, y, scaledPolygon)) {
          mask[y * width + x] = 1;
        }
      }
    }
    return mask;
  }

  // In browser, use 2D canvas path fill for hardware acceleration
  const canvas = createCanvas(width, height);
  const ctx = context(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();

  scaledPolygon.forEach(([y, x], idx) => {
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  const imgData = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0; i < width * height; i++) {
    if (imgData[i * 4 + 3] > 64) {
      mask[i] = 1;
    }
  }
  return mask;
}

/**
 * Extracts lineart / ink pen contours using local contrast gradient.
 * Avoids capturing broad flat dark clothing areas as lines.
 */
export function extractLineartMask(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  darknessThreshold: number = 75,
): Uint8Array {
  const lineartMask = new Uint8Array(width * height);

  // Compute local luminance and Sobel edge intensity
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const a = srcData[p + 3];
    if (a < 30) {
      lum[i] = 255; // transparent treated as light
    } else {
      lum[i] = 0.299 * srcData[p] + 0.587 * srcData[p + 1] + 0.114 * srcData[p + 2];
    }
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      if (srcData[p + 3] < 30) continue;

      const currentLum = lum[idx];
      // Only pixels that are relatively dark can be lineart
      if (currentLum > darknessThreshold) continue;

      // Sobel gradient
      const gx =
        -lum[(y - 1) * width + (x - 1)] +
        lum[(y - 1) * width + (x + 1)] -
        2 * lum[y * width + (x - 1)] +
        2 * lum[y * width + (x + 1)] -
        lum[(y + 1) * width + (x - 1)] +
        lum[(y + 1) * width + (x + 1)];

      const gy =
        -lum[(y - 1) * width + (x - 1)] -
        2 * lum[(y - 1) * width + x] -
        lum[(y - 1) * width + (x + 1)] +
        lum[(y + 1) * width + (x - 1)] +
        2 * lum[(y + 1) * width + x] +
        lum[(y + 1) * width + (x + 1)];

      const edgeMagnitude = Math.hypot(gx, gy);

      // Lineart if strong contrast edge or ultra-dark stroke
      if (edgeMagnitude > 60 || currentLum < 35) {
        lineartMask[idx] = 1;
      }
    }
  }

  return lineartMask;
}

/**
 * Initializes editable masks from detected SemanticParts.
 * Assigns every non-transparent pixel to a layer cleanly without gaps.
 */
export function initializeSemanticRefinementMasks(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  parts: SemanticPart[],
): SemanticRefinementMask[] {
  const total = width * height;
  const masksMap: Map<SemanticLabel, Uint8Array> = new Map();

  // 1. Lineart mask
  const lineart = extractLineartMask(srcData, width, height, 75);
  masksMap.set('Tratto', lineart);

  // 2. Rasterize parts polygons
  const partMasks = parts.map((part) => ({
    part,
    rawMask: rasterizeNormalizedPolygon(part.polygon, width, height),
  }));

  // Create empty masks for all possible labels in hierarchy
  for (const h of SEMANTIC_HIERARCHY) {
    if (!masksMap.has(h.label)) {
      masksMap.set(h.label, new Uint8Array(total));
    }
  }

  // 3. Assign character pixels to parts
  // Priority order for overlap: Occhi > Bocca > Accessori > Capelli > Pelle > Vestiti > Sfondo
  const priorityLabels: SemanticLabel[] = [
    'Occhi',
    'Bocca',
    'Accessori',
    'Capelli',
    'Pelle',
    'Vestiti',
    'Sfondo',
  ];

  for (let i = 0; i < total; i++) {
    const a = srcData[i * 4 + 3];
    if (a < 20) continue; // transparent background

    // If lineart captured it, keep it in lineart layer as well
    // Now determine the primary colored body layer for this pixel:
    let assigned = false;
    for (const label of priorityLabels) {
      const matchingParts = partMasks.filter((p) => p.part.label === label);
      for (const pm of matchingParts) {
        if (pm.rawMask[i] === 1) {
          masksMap.get(label)![i] = 1;
          assigned = true;
          break;
        }
      }
      if (assigned) break;
    }

    // Fallback: If pixel is foreground but fell outside polygons, assign to nearest or Vestiti/Pelle
    if (!assigned) {
      // Warm skin tone check
      const r = srcData[i * 4];
      const g = srcData[i * 4 + 1];
      const b = srcData[i * 4 + 2];
      if (r > 160 && g > 110 && b > 80 && r > g && g > b) {
        masksMap.get('Pelle')![i] = 1;
      } else {
        masksMap.get('Vestiti')![i] = 1;
      }
    }
  }

  // Build the list of active masks according to the 8 layers
  const refinementMasks: SemanticRefinementMask[] = [];

  for (const item of SEMANTIC_HIERARCHY) {
    const mask = masksMap.get(item.label)!;
    let pixelCount = 0;
    for (let i = 0; i < total; i++) {
      if (mask[i] === 1) pixelCount++;
    }

    // Include if it has pixels or if it's one of the primary anatomy layers
    if (
      pixelCount > 0 ||
      [
        'Tratto',
        'Accessori',
        'Capelli',
        'Pelle',
        'Occhi',
        'Bocca',
        'Vestiti',
      ].includes(item.label)
    ) {
      refinementMasks.push({
        partId: `mask-${item.label.toLowerCase()}`,
        label: item.label,
        name: item.defaultName,
        colorHex: item.colorHex,
        mask,
        pixelCount,
      });
    }
  }

  return refinementMasks;
}

/**
 * Creates the complete 9-tier LayerItem array for the project:
 * 1. Tratto / Contorni (Lineart)
 * 2. Accessori
 * 3. Occhi
 * 4. Bocca
 * 5. Capelli
 * 6. Pelle
 * 7. Vestiti
 * 8. Sfondo
 * 9. Originale intatto (nascosto, visible: false)
 */
export function buildProjectLayersFromMasks(
  sourceLayer: LayerItem,
  masks: SemanticRefinementMask[],
): LayerItem[] {
  const srcCanvas = sourceLayer.canvas;
  const width = srcCanvas.width;
  const height = srcCanvas.height;
  const ctx = context(srcCanvas);
  const srcImageData = ctx.getImageData(0, 0, width, height);
  const srcData = srcImageData.data;

  const resultLayers: LayerItem[] = [];

  // Generate each layer from its mask
  for (const refMask of masks) {
    if (refMask.pixelCount === 0) continue;

    // Find bounding box to keep layer compact
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (refMask.mask[i] === 1) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX > maxX || minY > maxY) continue;

    const layerW = maxX - minX + 1;
    const layerH = maxY - minY + 1;

    const layerCanvas = createCanvas(layerW, layerH);
    const layerCtx = context(layerCanvas);
    const layerImageData = layerCtx.createImageData(layerW, layerH);
    const layerData = layerImageData.data;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const srcIdx = y * width + x;
        if (refMask.mask[srcIdx] === 1) {
          const destIdx = (y - minY) * layerW + (x - minX);
          const sp = srcIdx * 4;
          const dp = destIdx * 4;
          layerData[dp] = srcData[sp];
          layerData[dp + 1] = srcData[sp + 1];
          layerData[dp + 2] = srcData[sp + 2];
          layerData[dp + 3] = srcData[sp + 3];
        }
      }
    }

    layerCtx.putImageData(layerImageData, 0, 0);

    const scaleX = sourceLayer.width / width;
    const scaleY = sourceLayer.height / height;

    const isLineart = refMask.label === 'Tratto';
    const item = makeLayer(
      layerCanvas,
      refMask.name,
      Math.round(sourceLayer.x + minX * scaleX),
      Math.round(sourceLayer.y + minY * scaleY),
    );

    item.width = Math.max(1, Math.round(layerW * scaleX));
    item.height = Math.max(1, Math.round(layerH * scaleY));
    item.blendMode = isLineart ? 'normal' : sourceLayer.blendMode;
    item.opacity = sourceLayer.opacity;
    item.visible = true;

    resultLayers.push(item);
  }

  // 9. Add untouched Originale layer at bottom (visible: false)
  const origCanvas = createCanvas(width, height);
  context(origCanvas).drawImage(srcCanvas, 0, 0);

  const originalLayer = makeLayer(
    origCanvas,
    'Originale (Recupero)',
    sourceLayer.x,
    sourceLayer.y,
  );
  originalLayer.width = sourceLayer.width;
  originalLayer.height = sourceLayer.height;
  originalLayer.visible = false; // Hidden in PSD for non-destructive recovery
  originalLayer.locked = true;

  resultLayers.push(originalLayer);

  return resultLayers;
}
