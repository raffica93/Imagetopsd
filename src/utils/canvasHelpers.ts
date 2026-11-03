import {
  MAX_EDGE,
  MAX_IMAGE_PIXELS,
  MAX_FILE_BYTES,
  MAX_LAYERS,
  MAX_PROJECT_PIXELS,
} from '../types';
import type { LayerItem, Project } from '../types';

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (typeof document === 'undefined') {
    const buffer = new Uint8ClampedArray(w * h * 4);
    const mockCtx: any = {
      canvas: null,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      arc: () => {},
      ellipse: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      quadraticCurveTo: () => {},
      getImageData: () => ({ data: buffer, width: w, height: h }),
      putImageData: () => {},
      createImageData: (iw: number, ih: number) => ({
        data: new Uint8ClampedArray(iw * ih * 4),
        width: iw,
        height: ih,
      }),
      drawImage: () => {},
    };
    const mockCanvas: any = {
      width: w,
      height: h,
      getContext: () => mockCtx,
      toDataURL: () => 'data:image/png;base64,mock',
    };
    mockCtx.canvas = mockCanvas;
    return mockCanvas as HTMLCanvasElement;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx)
    throw new Error(
      'Memoria grafica insufficiente. Chiudi altre schede e riprova.',
    );
  return ctx;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error('Immagine non leggibile. Usa un file PNG, JPG o WebP.'));
    img.src = src;
  });
}

export async function blobToCanvas(
  blob: Blob,
  exactSize?: { width: number; height: number },
) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth,
      h = img.naturalHeight;
    if (!w || !h || w * h > 64_000_000)
      throw new Error(
        'Questa immagine è troppo grande. Riducila prima di importarla.',
      );
    if (exactSize && (w !== exactSize.width || h !== exactSize.height))
      throw new Error('Dimensioni dei livelli non valide nel progetto.');
    const scale = exactSize
      ? 1
      : Math.min(
          1,
          MAX_EDGE / w,
          MAX_EDGE / h,
          Math.sqrt(MAX_IMAGE_PIXELS / (w * h)),
        );
    const canvas = createCanvas(Math.floor(w * scale), Math.floor(h * scale));
    context(canvas).drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, resized: scale < 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToCanvas(file: File) {
  if (file.size > MAX_FILE_BYTES)
    throw new Error(`${file.name}: il limite è 30 MB per file.`);
  if (
    !/^(image\/(png|jpeg|webp))$/.test(file.type) &&
    !/\.(png|jpe?g|webp)$/i.test(file.name)
  ) {
    throw new Error(
      `${file.name}: formato non supportato. Usa PNG, JPG o WebP.`,
    );
  }
  // Do not accept an SVG renamed to .png.
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    signature[0] === 137 &&
    signature[1] === 80 &&
    signature[2] === 78 &&
    signature[3] === 71;
  const jpeg =
    signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const webp =
    String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...signature.slice(8, 12)) === 'WEBP';
  if (!png && !jpeg && !webp)
    throw new Error(
      `${file.name}: il contenuto non è un’immagine PNG, JPG o WebP valida.`,
    );
  return blobToCanvas(file);
}

export function thumbnail(canvas: HTMLCanvasElement) {
  const scale = Math.min(1, 128 / Math.max(canvas.width, canvas.height));
  const preview = createCanvas(canvas.width * scale, canvas.height * scale);
  context(preview).drawImage(canvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL('image/png');
}

export function makeLayer(
  canvas: HTMLCanvasElement,
  name: string,
  x = 0,
  y = 0,
): LayerItem {
  return {
    id: crypto.randomUUID(),
    name,
    canvas,
    previewUrl: thumbnail(canvas),
    x,
    y,
    width: canvas.width,
    height: canvas.height,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
  };
}

export function validateBudget(layers: LayerItem[]) {
  if (layers.length > MAX_LAYERS)
    throw new Error(`Puoi usare fino a ${MAX_LAYERS} livelli per progetto.`);
  if (
    layers.reduce((n, l) => n + l.canvas.width * l.canvas.height, 0) >
    MAX_PROJECT_PIXELS
  ) {
    throw new Error(
      'Il progetto occupa troppa memoria per iPad. Rimuovi qualche livello o importa immagini più piccole.',
    );
  }
}

export function drawProject(canvas: HTMLCanvasElement, project: Project) {
  const { settings, layers } = project;
  if (canvas.width !== settings.width) canvas.width = settings.width;
  if (canvas.height !== settings.height) canvas.height = settings.height;
  const ctx = context(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (settings.backgroundColor === 'white') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const l of [...layers].reverse()) {
    if (!l.visible) continue;
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation =
      l.blendMode === 'normal' ? 'source-over' : l.blendMode;
    ctx.drawImage(l.canvas, l.x, l.y, l.width, l.height);
    ctx.restore();
  }
  return canvas;
}

export function composite(project: Project) {
  return drawProject(
    createCanvas(project.settings.width, project.settings.height),
    project,
  );
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Impossibile creare il file immagine.')),
      'image/png',
    ),
  );
}

export function cutLayer(
  layer: LayerItem,
  rect: { x: number; y: number; width: number; height: number },
) {
  const sx = layer.canvas.width / layer.width,
    sy = layer.canvas.height / layer.height;
  const left = Math.max(0, Math.floor((rect.x - layer.x) * sx));
  const top = Math.max(0, Math.floor((rect.y - layer.y) * sy));
  const right = Math.min(
    layer.canvas.width,
    Math.ceil((rect.x + rect.width - layer.x) * sx),
  );
  const bottom = Math.min(
    layer.canvas.height,
    Math.ceil((rect.y + rect.height - layer.y) * sy),
  );
  if (right <= left || bottom <= top)
    throw new Error('Traccia un rettangolo sopra il livello selezionato.');
  const canvas = createCanvas(right - left, bottom - top);
  const ctx = context(canvas);
  ctx.drawImage(
    layer.canvas,
    left,
    top,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (
    !ctx
      .getImageData(0, 0, canvas.width, canvas.height)
      .data.some((v, i) => i % 4 === 3 && v > 0)
  ) {
    throw new Error(
      'La selezione è vuota. Scegli una parte visibile del livello.',
    );
  }
  const remainder = createCanvas(layer.canvas.width, layer.canvas.height);
  const rc = context(remainder);
  rc.drawImage(layer.canvas, 0, 0);
  rc.clearRect(left, top, canvas.width, canvas.height);
  return {
    extracted: {
      ...makeLayer(
        canvas,
        `${layer.name} · ritaglio`,
        layer.x + left / sx,
        layer.y + top / sy,
      ),
      width: canvas.width / sx,
      height: canvas.height / sy,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
    },
    remainder: {
      ...layer,
      canvas: remainder,
      previewUrl: thumbnail(remainder),
    },
  };
}

// A local, original illustration: four disconnected stickers, no external assets.
export function generateSampleStickerSheet() {
  const canvas = createCanvas(1200, 900),
    ctx = context(canvas);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Citrus slice.
  ctx.save();
  ctx.translate(295, 275);
  ctx.fillStyle = '#f59e50';
  ctx.beginPath();
  ctx.arc(0, 0, 144, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath();
  ctx.arc(0, 0, 128, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + 0.04;
    ctx.fillStyle = i % 2 ? '#ef8750' : '#f4aa59';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a + 0.35) * 14, Math.sin(a + 0.35) * 14);
    ctx.arc(0, 0, 115, a, a + 0.69);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Daisy, with a connected central disk.
  ctx.save();
  ctx.translate(855, 283);
  ctx.fillStyle = '#da8ca1';
  for (let i = 0; i < 9; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 9);
    ctx.beginPath();
    ctx.ellipse(0, -75, 35, 83, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f4c763';
  ctx.beginPath();
  ctx.arc(0, 0, 53, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#684847';
  for (const [x, y] of [
    [-17, -8],
    [17, -8],
    [0, 16],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Leaf sprig.
  ctx.save();
  ctx.translate(290, 675);
  ctx.rotate(-0.25);
  ctx.strokeStyle = '#32675c';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(-100, 90);
  ctx.quadraticCurveTo(5, 10, 90, -116);
  ctx.stroke();
  ctx.fillStyle = '#518c78';
  for (const [x, y, r] of [
    [-65, 55, -0.9],
    [-12, 0, -0.65],
    [42, -60, -0.55],
    [-32, 36, 0.7],
    [21, -22, 0.65],
    [72, -87, 0.3],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 29, 59, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Wavy terracotta heart.
  ctx.save();
  ctx.translate(850, 650);
  ctx.rotate(0.1);
  ctx.fillStyle = '#d3654c';
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.bezierCurveTo(-230, -20, -118, -171, 0, -70);
  ctx.bezierCurveTo(118, -171, 230, -20, 0, 128);
  ctx.fill();
  ctx.strokeStyle = '#efb58a';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-45, -36);
  ctx.bezierCurveTo(-88, -76, -114, -19, -86, 16);
  ctx.stroke();
  ctx.restore();
  return canvas;
}
