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
