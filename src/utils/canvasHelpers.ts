import { BoundingBox } from '../types/index';

/**
 * Creates an offscreen or standard HTMLCanvasElement with specified size
 */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * Loads an HTMLImageElement from a URL or data URL
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image: ' + e));
    img.src = src;
  });
}

/**
 * Converts an image file to an HTMLCanvasElement
 */
export async function fileToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; url: string }> {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  const canvas = createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(img, 0, 0);
  }
  return { canvas, url };
}

/**
 * Trims transparent borders from a canvas to calculate the exact non-transparent bounding box
 */
export function getNonTransparentBounds(canvas: HTMLCanvasElement): BoundingBox | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let pixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        pixelCount++;
      }
    }
  }

  if (pixelCount === 0 || maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, minY, maxX, maxY, pixelCount };
}

/**
 * Crops a canvas to a specific bounding box
 */
export function cropCanvas(
  sourceCanvas: HTMLCanvasElement,
  box: { minX: number; minY: number; maxX: number; maxY: number }
): HTMLCanvasElement {
  const w = Math.max(1, box.maxX - box.minX + 1);
  const h = Math.max(1, box.maxY - box.minY + 1);
  const destCanvas = createCanvas(w, h);
  const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(sourceCanvas, box.minX, box.minY, w, h, 0, 0, w, h);
  }
  return destCanvas;
}

/**
 * Creates high quality sample images directly via Canvas API
 * Sample 1: "Sticker Sheet Pop Art" (Multiple distinct objects: Star, Heart, Planet, Lightning, Smiley)
 * Sample 2: "Retro Badge Design" (Multiple layered elements)
 */
export function generateSampleStickerSheet(): HTMLCanvasElement {
  const canvas = createCanvas(1200, 900);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // Transparent background
  ctx.clearRect(0, 0, 1200, 900);

  // Sticker 1: Golden Star with Face & Sparkles (top-left)
  ctx.save();
  ctx.translate(220, 240);
  ctx.fillStyle = '#fbbf24';
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 8;
  ctx.beginPath();
  const spikes = 5;
  const outerR = 110;
  const innerR = 55;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes; i++) {
    let x = Math.cos(rot) * outerR;
    let y = Math.sin(rot) * outerR;
    ctx.lineTo(x, y);
    rot += step;
    x = Math.cos(rot) * innerR;
    y = Math.sin(rot) * innerR;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cute eyes & smile
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(-30, -10, 10, 0, Math.PI * 2);
  ctx.arc(30, -10, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 15, 25, 0, Math.PI);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();

  // Sticker 2: Kawaii Saturn Planet (top-right)
  ctx.save();
  ctx.translate(900, 220);
  // Planet body
  const gradPlanet = ctx.createLinearGradient(-80, -80, 80, 80);
  gradPlanet.addColorStop(0, '#818cf8');
  gradPlanet.addColorStop(1, '#c084fc');
  ctx.fillStyle = gradPlanet;
  ctx.beginPath();
  ctx.arc(0, 0, 85, 0, Math.PI * 2);
  ctx.fill();
  // Planet Ring
  ctx.save();
  ctx.rotate(-0.35);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.ellipse(0, 0, 150, 45, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // Sticker 3: Pixel Heart with wings or glow (center)
  ctx.save();
  ctx.translate(560, 460);
  ctx.fillStyle = '#f43f5e';
  ctx.strokeStyle = '#be123c';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.bezierCurveTo(-110, -70, -110, -130, 0, -40);
  ctx.bezierCurveTo(110, -130, 110, -70, 0, 40);
  ctx.fill();
  ctx.stroke();
  // Highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.ellipse(-35, -55, 25, 12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Sticker 4: Electric Lightning Bolt (bottom-left)
  ctx.save();
  ctx.translate(230, 680);
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(10, -110);
  ctx.lineTo(-70, 10);
  ctx.lineTo(-10, 10);
  ctx.lineTo(-40, 110);
  ctx.lineTo(80, -20);
  ctx.lineTo(20, -20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Sticker 5: Diamond Gem (bottom-right)
  ctx.save();
  ctx.translate(920, 680);
  ctx.fillStyle = '#2dd4bf';
  ctx.strokeStyle = '#0f766e';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-90, -30);
  ctx.lineTo(-40, -90);
  ctx.lineTo(40, -90);
  ctx.lineTo(90, -30);
  ctx.lineTo(0, 95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Inner facets
  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-90, -30);
  ctx.lineTo(90, -30);
  ctx.moveTo(-40, -90);
  ctx.lineTo(0, 95);
  ctx.moveTo(40, -90);
  ctx.lineTo(0, 95);
  ctx.stroke();
  ctx.restore();

  return canvas;
}
