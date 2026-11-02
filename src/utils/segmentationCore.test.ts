import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colorDistance,
  isPixelBackground,
  findConnectedComponents,
  expandBoundingBox,
  mergeOverlappingBoxes,
} from './segmentationCore';

test('colorDistance calculates correct Euclidean distance', () => {
  assert.equal(colorDistance(0, 0, 0, 0, 0, 0), 0);
  assert.equal(colorDistance(255, 255, 255, 255, 255, 255), 0);
  // Distance from black (0,0,0) to white (255,255,255) is ~441.67
  const dist = colorDistance(0, 0, 0, 255, 255, 255);
  assert.ok(Math.abs(dist - 441.67) < 0.1);
});

test('isPixelBackground detects alpha transparency', () => {
  // Alpha = 0 -> background
  assert.equal(
    isPixelBackground(255, 255, 255, 0, 'alpha', { r: 255, g: 255, b: 255 }, 20),
    true
  );
  // Alpha = 255 -> foreground in alpha mode
  assert.equal(
    isPixelBackground(255, 255, 255, 255, 'alpha', { r: 255, g: 255, b: 255 }, 20),
    false
  );
});

test('isPixelBackground detects color keying with tolerance', () => {
  const white = { r: 255, g: 255, b: 255 };
  // Pure white pixel with full alpha
  assert.equal(isPixelBackground(255, 255, 255, 255, 'colorKey', white, 30), true);
  // Off-white pixel (250, 250, 250) -> distance is sqrt(3 * 25) = ~8.66 <= 30 -> background
  assert.equal(isPixelBackground(250, 250, 250, 255, 'colorKey', white, 30), true);
  // Saturated red pixel (255, 0, 0) -> not background
  assert.equal(isPixelBackground(255, 0, 0, 255, 'colorKey', white, 30), false);
});

test('findConnectedComponents isolates separate shapes accurately', () => {
  // Create a 20x20 grid with 2 isolated 3x3 squares
  // Square 1: at x=2..4, y=2..4
  // Square 2: at x=12..14, y=12..14
  const width = 20;
  const height = 20;

  const isForeground = (x: number, y: number) => {
    if (x >= 2 && x <= 4 && y >= 2 && y <= 4) return true;
    if (x >= 12 && x <= 14 && y >= 12 && y <= 14) return true;
    return false;
  };

  const boxes = findConnectedComponents(width, height, isForeground, 4);
  assert.equal(boxes.length, 2);

  // First box should be at (2,2) to (4,4)
  assert.equal(boxes[0].minX, 2);
  assert.equal(boxes[0].minY, 2);
  assert.equal(boxes[0].maxX, 4);
  assert.equal(boxes[0].maxY, 4);
  assert.equal(boxes[0].pixelCount, 9);

  // Second box should be at (12,12) to (14,14)
  assert.equal(boxes[1].minX, 12);
  assert.equal(boxes[1].minY, 12);
  assert.equal(boxes[1].maxX, 14);
  assert.equal(boxes[1].maxY, 14);
  assert.equal(boxes[1].pixelCount, 9);
});

test('expandBoundingBox applies padding while clamping to boundaries', () => {
  const box = { minX: 1, minY: 1, maxX: 5, maxY: 5, pixelCount: 25 };
  const expanded = expandBoundingBox(box, 3, 10, 10);
  assert.equal(expanded.minX, 0); // clamped at 0
  assert.equal(expanded.minY, 0); // clamped at 0
  assert.equal(expanded.maxX, 8);
  assert.equal(expanded.maxY, 8);
});

test('mergeOverlappingBoxes merges intersecting boxes correctly', () => {
  const box1 = { minX: 0, minY: 0, maxX: 10, maxY: 10, pixelCount: 50 };
  const box2 = { minX: 5, minY: 5, maxX: 15, maxY: 15, pixelCount: 40 };
  const box3 = { minX: 50, minY: 50, maxX: 60, maxY: 60, pixelCount: 20 };

  const merged = mergeOverlappingBoxes([box1, box2, box3]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].minX, 0);
  assert.equal(merged[0].maxX, 15);
  assert.equal(merged[0].pixelCount, 90);
  assert.equal(merged[1].minX, 50);
});
