import type { Layer, Psd } from 'ag-psd';
import type { Project } from '../types';
import { composite, createCanvas, context, canvasBlob } from './canvasHelpers';

export function safeFilename(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .slice(0, 80) || 'FrescoLayers'
  );
}

export async function exportToPsd(project: Project): Promise<Blob> {
  const { writePsd } = await import('ag-psd');
  const { settings, layers } = project;
  // ag-psd stores children bottom-to-top; our list is top-to-bottom.
  const children: Layer[] = [...layers].reverse().map((layer) => {
    const canvas = createCanvas(layer.width, layer.height);
    context(canvas).drawImage(layer.canvas, 0, 0, canvas.width, canvas.height);
    return {
      name: layer.name,
      top: Math.round(layer.y),
      left: Math.round(layer.x),
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      canvas,
      hidden: !layer.visible,
      protected: {
        transparency: false,
        composite: layer.locked,
        position: layer.locked,
      },
    };
  });
  if (settings.backgroundColor === 'white') {
    const bg = createCanvas(settings.width, settings.height),
      ctx = context(bg);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, bg.width, bg.height);
    children.unshift({ name: 'Sfondo', canvas: bg, top: 0, left: 0 });
  }
  const psd: Psd = {
    width: settings.width,
    height: settings.height,
    children,
    canvas: composite(project),
    imageResources: {
      resolutionInfo: {
        horizontalResolution: settings.dpi,
        verticalResolution: settings.dpi,
        horizontalResolutionUnit: 'PPI',
        verticalResolutionUnit: 'PPI',
        widthUnit: 'Inches',
        heightUnit: 'Inches',
      },
    },
  };
  const buffer = writePsd(psd, { generateThumbnail: true });
  return new Blob([buffer], { type: 'image/vnd.adobe.photoshop' });
}

export function exportToPng(project: Project) {
  return canvasBlob(composite(project));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari may defer reading the Blob until after the click handler returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Call directly from a user tap with an already prepared File (iOS activation).
export async function shareFile(
  file: File,
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return 'cancelled';
      throw new Error('Condivisione non disponibile. Usa “Scarica file”.');
    }
  }
  downloadBlob(file, file.name);
  return 'downloaded';
}
