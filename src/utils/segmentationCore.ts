import { BoundingBox } from '../types/index';

/**
 * Calculates Euclidean distance between two RGB colors (0 to ~441)
 */
export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Checks if a pixel matches background criteria
 */
export function isPixelBackground(
  r: number,
  g: number,
  b: number,
  a: number,
  mode: 'alpha' | 'colorKey',
  targetColor: { r: number; g: number; b: number },
  tolerance: number
): boolean {
  // If alpha is very low, it's considered transparent background
  if (a < 15) {
    return true;
  }

  if (mode === 'alpha') {
    // Only alpha channel is considered background
    return a < 30;
  }

  // In colorKey mode, check distance to target background color (e.g. white #ffffff)
  const dist = colorDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b);
  return dist <= tolerance;
}

/**
 * Pure algorithm for finding bounding boxes of connected components
 * Accepts a binary matrix or a pixel test callback.
 */
export function findConnectedComponents(
  width: number,
  height: number,
  isForeground: (x: number, y: number) => boolean,
  minPixelCount: number = 50
): BoundingBox[] {
  const visited = new Uint8Array(width * height);
  const boxes: BoundingBox[] = [];

  // 4-way neighbors
  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] === 1) continue;

      if (!isForeground(x, y)) {
        visited[idx] = 1;
        continue;
      }

      // Found a new foreground component - run BFS
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;

      // Simple BFS queue using Uint32Array for performance
      const queue = new Int32Array(width * height * 2);
      let head = 0;
      let tail = 0;

      queue[tail++] = x;
      queue[tail++] = y;
      visited[idx] = 1;

      while (head < tail) {
        const cx = queue[head++];
        const cy = queue[head++];
        pixelCount++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let i = 0; i < 4; i++) {
          const nx = cx + dx[i];
          const ny = cy + dy[i];

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (visited[nIdx] === 0) {
              visited[nIdx] = 1;
              if (isForeground(nx, ny)) {
                queue[tail++] = nx;
                queue[tail++] = ny;
              }
            }
          }
        }
      }

      if (pixelCount >= minPixelCount) {
        boxes.push({ minX, minY, maxX, maxY, pixelCount });
      }
    }
  }

  // Sort boxes by natural reading order (top to bottom, left to right)
  return boxes.sort((a, b) => {
    const rowA = Math.floor(a.minY / 40);
    const rowB = Math.floor(b.minY / 40);
    if (rowA !== rowB) return rowA - rowB;
    return a.minX - b.minX;
  });
}

/**
 * Enhanced Connected Components detection that yields step-by-step diagnostic logs.
 */
export function findConnectedComponentsWithDiagnostics(
  width: number,
  height: number,
  isForeground: (x: number, y: number) => boolean,
  minPixelCount: number = 50,
  bgStats?: { totalPixels: number; bgPixels: number; fgPixels: number; mode: string }
): { boxes: BoundingBox[]; logs: SegmentationLogEntry[] } {
  const logs: SegmentationLogEntry[] = [];
  const log = (
    category: SegmentationLogEntry['category'],
    message: string,
    level: SegmentationLogEntry['level'] = 'info',
    details?: string
  ) => {
    const entry = createLogEntry(category, message, level, details);
    logs.push(entry);
    if (level === 'warn') console.warn(`[FrescoLayers:${category}] ${message}`, details || '');
    else console.log(`[FrescoLayers:${category}] ${message}`, details || '');
  };

  log('ANALISI', `Scansione spaziale: ${width}x${height} px (Filtro rumore minimo: ${minPixelCount} px)`);
  if (bgStats) {
    const bgPct = ((bgStats.bgPixels / bgStats.totalPixels) * 100).toFixed(1);
    const fgPct = ((bgStats.fgPixels / bgStats.totalPixels) * 100).toFixed(1);
    log('ALPHA', `Pixel sfondo: ${bgStats.bgPixels.toLocaleString()} (${bgPct}%), Pixel primo piano: ${bgStats.fgPixels.toLocaleString()} (${fgPct}%)`);
  }

  const rawBoxes = findConnectedComponents(width, height, isForeground, minPixelCount);
  log('SEGMENTAZIONE', `Algoritmo BFS: individuate ${rawBoxes.length} isole spaziali di pixel contigui`);

  if (rawBoxes.length === 1) {
    const b = rawBoxes[0];
    log(
      'DIAGNOSTICA',
      `⚠️ Rilevato 1 solo elemento connesso (${b.pixelCount.toLocaleString()} px, box: [${b.minX},${b.minY} - ${b.maxX},${b.maxY}]). Tutti i pixel del soggetto si toccano continuamente.`,
      'warn'
    );
    log(
      'DIAGNOSTICA',
      `💡 SUGGERIMENTO: Per estrarre più livelli (Pelle, Abiti, Capelli, Spada, Lineart) da una singola illustrazione, attiva la modalità "Scomposizione per Colore / Tinte" in alto!`,
      'info'
    );
  } else if (rawBoxes.length > 1) {
    log('SUCCESSO', `Rilevati con successo ${rawBoxes.length} elementi spazialmente separati!`, 'success');
  } else {
    log('DIAGNOSTICA', `Nessun elemento sopra la soglia minima di ${minPixelCount} px. Prova ad abbassare il filtro rumore o controllare il colore di sfondo.`, 'warn');
  }

  return { boxes: rawBoxes, logs };
}

/**
 * Expands bounding boxes by padding while staying within canvas bounds
 */
export function expandBoundingBox(
  box: BoundingBox,
  padding: number,
  maxWidth: number,
  maxHeight: number
): BoundingBox {
  return {
    minX: Math.max(0, box.minX - padding),
    minY: Math.max(0, box.minY - padding),
    maxX: Math.min(maxWidth - 1, box.maxX + padding),
    maxY: Math.min(maxHeight - 1, box.maxY + padding),
    pixelCount: box.pixelCount,
  };
}

/**
 * Merges boxes that overlap significantly or are inside each other
 */
export function mergeOverlappingBoxes(boxes: BoundingBox[]): BoundingBox[] {
  if (boxes.length <= 1) return boxes;

  const result: BoundingBox[] = [];
  const merged = new Set<number>();

  for (let i = 0; i < boxes.length; i++) {
    if (merged.has(i)) continue;
    let current = { ...boxes[i] };

    for (let j = i + 1; j < boxes.length; j++) {
      if (merged.has(j)) continue;
      const other = boxes[j];

      // Check if bounding boxes intersect
      const intersects = !(
        current.maxX < other.minX ||
        current.minX > other.maxX ||
        current.maxY < other.minY ||
        current.minY > other.maxY
      );

      if (intersects) {
        current = {
          minX: Math.min(current.minX, other.minX),
          minY: Math.min(current.minY, other.minY),
          maxX: Math.max(current.maxX, other.maxX),
          maxY: Math.max(current.maxY, other.maxY),
          pixelCount: current.pixelCount + other.pixelCount,
        };
        merged.add(j);
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * Diagnostic log entry for segmentation processes
 */
export interface SegmentationLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'success' | 'debug';
  category: 'ANALISI' | 'ALPHA' | 'SEGMENTAZIONE' | 'COLORI' | 'DIAGNOSTICA' | 'SUCCESSO';
  message: string;
  details?: string;
}

export function createLogEntry(
  category: SegmentationLogEntry['category'],
  message: string,
  level: SegmentationLogEntry['level'] = 'info',
  details?: string
): SegmentationLogEntry {
  const d = new Date();
  const timeStr = d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: timeStr,
    level,
    category,
    message,
    details,
  };
}

export interface ColorClusterInfo {
  r: number;
  g: number;
  b: number;
  hex: string;
  name: string;
  pixelCount: number;
  percentage: number;
  bounds: BoundingBox;
}

export interface ColorSegmentationOptions {
  numberOfColors: number; // 2 to 12
  separateLineart?: boolean; // dedicated dark contour layer
  bgMode: 'alpha' | 'colorKey';
  targetColor?: { r: number; g: number; b: number };
  tolerance?: number;
  minPixelCount?: number;
}

export interface ColorSegmentationOutput {
  clusters: ColorClusterInfo[];
  pixelClusterIndices: Int16Array; // index of cluster for each pixel, or -1 if background
  totalPixels: number;
  bgPixels: number;
  fgPixels: number;
  logs: SegmentationLogEntry[];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Descriptive label for common color tones (helps user identify layers in Fresco)
 */
export function getDescriptiveColorName(r: number, g: number, b: number, isLineart?: boolean): string {
  if (isLineart) return 'Tratto & Contorni (Lineart)';
  
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;

  if (brightness < 45) return 'Tonalità Scure / Ombre';
  if (brightness > 230 && sat < 0.15) return 'Luci / Bianco / Riflessi';
  if (sat < 0.15) return brightness > 128 ? 'Grigio Chiaro' : 'Grigio Medio';

  // Warm skin tones common in characters
  if (r > 150 && g > 100 && b > 70 && r > g && g > b && sat < 0.6) {
    return 'Incarnato / Carnagione';
  }

  // Hue detection
  if (r >= g && r >= b) {
    if (g > b * 1.3) return 'Giallo / Ocora / Dorato';
    if (g > 80 && b < 60) return 'Arancione / Bruno';
    return 'Rosso / Caldo';
  } else if (g >= r && g >= b) {
    return 'Verde / Smeraldo';
  } else {
    if (r > g) return 'Viola / Magenta';
    return 'Blu / Freddo';
  }
}

/**
 * Pure Color Segmentation algorithm using k-means clustering on foreground pixels.
 * Splits a single illustration or character into N independent chromatic layers.
 */
export function segmentImageByColors(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: ColorSegmentationOptions
): ColorSegmentationOutput {
  const logs: SegmentationLogEntry[] = [];
  const log = (
    category: SegmentationLogEntry['category'],
    message: string,
    level: SegmentationLogEntry['level'] = 'info',
    details?: string
  ) => {
    const entry = createLogEntry(category, message, level, details);
    logs.push(entry);
    // Also mirror to console for developer inspectability
    if (level === 'warn') console.warn(`[FrescoLayers:${category}] ${message}`, details || '');
    else console.log(`[FrescoLayers:${category}] ${message}`, details || '');
  };

  const totalPixels = width * height;
  log('ANALISI', `Inizio analisi canvas: ${width}x${height} px (${totalPixels.toLocaleString()} pixel totali)`);

  const bgMode = options.bgMode;
  const targetColor = options.targetColor || { r: 255, g: 255, b: 255 };
  const tolerance = options.tolerance ?? 35;
  const numClusters = Math.max(2, Math.min(16, options.numberOfColors));
  const separateLineart = options.separateLineart ?? true;
  const minPixels = options.minPixelCount ?? 15;

  log('ALPHA', `Modalità sfondo: ${bgMode === 'alpha' ? 'Trasparenza Alpha (PNG)' : `Color Key (${rgbToHex(targetColor.r, targetColor.g, targetColor.b)}, tolleranza ${tolerance})`}`);

  // 1. Identify foreground pixels and separate background
  const pixelClusterIndices = new Int16Array(totalPixels);
  pixelClusterIndices.fill(-1); // -1 = background

  const fgIndices: number[] = [];
  let bgPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];

    if (isPixelBackground(r, g, b, a, bgMode, targetColor, tolerance)) {
      bgPixels++;
    } else {
      fgIndices.push(i);
    }
  }

  const fgPixels = fgIndices.length;
  const bgPercentage = ((bgPixels / totalPixels) * 100).toFixed(1);
  const fgPercentage = ((fgPixels / totalPixels) * 100).toFixed(1);

  log('ALPHA', `Trasparenza: ${bgPixels.toLocaleString()} pixel sfondo (${bgPercentage}%), ${fgPixels.toLocaleString()} pixel utili primo piano (${fgPercentage}%)`);

  if (fgPixels === 0) {
    log('DIAGNOSTICA', 'Nessun pixel di primo piano trovato. L\'immagine risulta completamente trasparente o corrisponde al colore di sfondo.', 'warn');
    return {
      clusters: [],
      pixelClusterIndices,
      totalPixels,
      bgPixels,
      fgPixels,
      logs,
    };
  }

  // 2. Separate lineart (very dark outlines) if requested
  const lineartIndices: number[] = [];
  const colorFgIndices: number[] = [];

  if (separateLineart) {
    for (const idx of fgIndices) {
      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 48) {
        lineartIndices.push(idx);
      } else {
        colorFgIndices.push(idx);
      }
    }
    log('COLORI', `Rilevamento Lineart/Contorni: ${lineartIndices.length.toLocaleString()} pixel scuri isolati (${((lineartIndices.length / fgPixels) * 100).toFixed(1)}%)`);
  } else {
    for (const idx of fgIndices) {
      colorFgIndices.push(idx);
    }
  }

  // 3. Cluster remaining color foreground pixels using k-means
  const effectiveK = separateLineart && lineartIndices.length > 50 ? Math.max(1, numClusters - 1) : numClusters;
  const sampleCount = colorFgIndices.length;
  const centroids: Array<{ r: number; g: number; b: number }> = [];

  if (sampleCount > 0) {
    // Deterministic spread initialization of centroids
    const step = Math.max(1, Math.floor(sampleCount / effectiveK));
    for (let k = 0; k < effectiveK; k++) {
      const pickIdx = colorFgIndices[Math.min(sampleCount - 1, k * step + Math.floor(step / 2))];
      const p = pickIdx * 4;
      centroids.push({
        r: data[p],
        g: data[p + 1],
        b: data[p + 2],
      });
    }

    // Run 5 fast k-means refinement iterations
    const iterations = 5;
    const sampleSubsetStep = Math.max(1, Math.floor(sampleCount / 15000)); // sample max 15k for lightning speed

    for (let iter = 0; iter < iterations; iter++) {
      const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

      for (let s = 0; s < sampleCount; s += sampleSubsetStep) {
        const idx = colorFgIndices[s];
        const p = idx * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];

        let bestDist = Infinity;
        let bestK = 0;
        for (let k = 0; k < centroids.length; k++) {
          const c = centroids[k];
          const dist = colorDistance(r, g, b, c.r, c.g, c.b);
          if (dist < bestDist) {
            bestDist = dist;
            bestK = k;
          }
        }
        sums[bestK].r += r;
        sums[bestK].g += g;
        sums[bestK].b += b;
        sums[bestK].count++;
      }

      for (let k = 0; k < centroids.length; k++) {
        if (sums[k].count > 0) {
          centroids[k] = {
            r: Math.round(sums[k].r / sums[k].count),
            g: Math.round(sums[k].g / sums[k].count),
            b: Math.round(sums[k].b / sums[k].count),
          };
        }
      }
    }
  }

  // 4. Assign pixels to final cluster indices
  // If lineart was separated, cluster index 0 is lineart
  const finalClusters: ColorClusterInfo[] = [];
  let clusterOffset = 0;

  if (separateLineart && lineartIndices.length >= minPixels) {
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    for (const idx of lineartIndices) {
      pixelClusterIndices[idx] = 0;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const p = idx * 4;
      sumR += data[p];
      sumG += data[p + 1];
      sumB += data[p + 2];
    }

    const count = lineartIndices.length;
    const avgR = Math.round(sumR / count);
    const avgG = Math.round(sumG / count);
    const avgB = Math.round(sumB / count);

    finalClusters.push({
      r: avgR,
      g: avgG,
      b: avgB,
      hex: rgbToHex(avgR, avgG, avgB),
      name: getDescriptiveColorName(avgR, avgG, avgB, true),
      pixelCount: count,
      percentage: Number(((count / fgPixels) * 100).toFixed(1)),
      bounds: { minX, minY, maxX, maxY, pixelCount: count },
    });

    clusterOffset = 1;
  }

  // Add the centroids as subsequent clusters
  const clusterStats = centroids.map((c, i) => ({
    r: c.r,
    g: c.g,
    b: c.b,
    minX: width,
    maxX: 0,
    minY: height,
    maxY: 0,
    pixelCount: 0,
  }));

  for (const idx of colorFgIndices) {
    const p = idx * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];

    let bestDist = Infinity;
    let bestK = 0;
    for (let k = 0; k < centroids.length; k++) {
      const c = centroids[k];
      const dist = colorDistance(r, g, b, c.r, c.g, c.b);
      if (dist < bestDist) {
        bestDist = dist;
        bestK = k;
      }
    }

    const targetClusterIndex = bestK + clusterOffset;
    pixelClusterIndices[idx] = targetClusterIndex;

    const x = idx % width;
    const y = Math.floor(idx / width);
    const stat = clusterStats[bestK];
    stat.pixelCount++;
    if (x < stat.minX) stat.minX = x;
    if (x > stat.maxX) stat.maxX = x;
    if (y < stat.minY) stat.minY = y;
    if (y > stat.maxY) stat.maxY = y;
  }

  for (let k = 0; k < clusterStats.length; k++) {
    const st = clusterStats[k];
    if (st.pixelCount >= minPixels) {
      finalClusters.push({
        r: st.r,
        g: st.g,
        b: st.b,
        hex: rgbToHex(st.r, st.g, st.b),
        name: getDescriptiveColorName(st.r, st.g, st.b),
        pixelCount: st.pixelCount,
        percentage: Number(((st.pixelCount / fgPixels) * 100).toFixed(1)),
        bounds: {
          minX: st.minX,
          minY: st.minY,
          maxX: st.maxX,
          maxY: st.maxY,
          pixelCount: st.pixelCount,
        },
      });
    }
  }

  // Sort color clusters by pixel count (descending) or keep lineart at top
  log('SEGMENTAZIONE', `Identificati ${finalClusters.length} livelli cromatici distinti per la scomposizione:`);
  finalClusters.forEach((c, idx) => {
    log('COLORI', `Livello ${idx + 1}: "${c.name}" (${c.hex}) - ${c.pixelCount.toLocaleString()} px (${c.percentage}%) - BBox: [${c.bounds.minX},${c.bounds.minY} - ${c.bounds.maxX},${c.bounds.maxY}]`);
  });

  log('SUCCESSO', `Completata scomposizione: ${finalClusters.length} livelli Adobe Fresco generabili con successo!`, 'success');

  return {
    clusters: finalClusters,
    pixelClusterIndices,
    totalPixels,
    bgPixels,
    fgPixels,
    logs,
  };
}
