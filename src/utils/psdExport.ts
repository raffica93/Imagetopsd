import { writePsd } from 'ag-psd';
import JSZip from 'jszip';
import { LayerItem, ProjectSettings } from '../types/index';
import { createMultiLayerSvg, traceImageDataToSvg } from './vectorizer';

/**
 * Maps app blend modes to ag-psd compatible blend modes
 */
function getAgPsdBlendMode(blendMode: string): any {
  switch (blendMode) {
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'darken':
      return 'darken';
    case 'lighten':
      return 'lighten';
    case 'color dodge':
      return 'color dodge';
    case 'color burn':
      return 'color burn';
    case 'hard light':
      return 'hard light';
    case 'soft light':
      return 'soft light';
    case 'difference':
      return 'difference';
    case 'exclusion':
      return 'exclusion';
    case 'normal':
    default:
      return 'normal';
  }
}

/**
 * Creates a valid multi-layer Adobe Photoshop (.PSD) file compatible with Adobe Fresco on iPad
 */
export async function exportToPsd(
  settings: ProjectSettings,
  layers: LayerItem[]
): Promise<Blob> {
  const children = layers.map((layer) => {
    return {
      name: layer.name,
      top: Math.round(layer.y),
      left: Math.round(layer.x),
      bottom: Math.round(layer.y + layer.height),
      right: Math.round(layer.x + layer.width),
      opacity: Math.max(0, Math.min(1, layer.opacity)),
      blendMode: getAgPsdBlendMode(layer.blendMode),
      canvas: layer.canvas,
      hidden: !layer.visible,
    };
  });

  const psd = {
    width: Math.round(settings.width),
    height: Math.round(settings.height),
    children: children,
    canvas: undefined,
  };

  const arrayBuffer = writePsd(psd as any, {
    generateThumbnail: true,
  });

  return new Blob([arrayBuffer], { type: 'image/vnd.adobe.photoshop' });
}

/**
 * Generates an Adobe Fresco-compatible multi-layer SVG file
 */
export async function exportToMultiLayerSvg(
  settings: ProjectSettings,
  layers: LayerItem[]
): Promise<string> {
  const layerSvgPromises = layers.map(async (layer) => {
    let svgContent = layer.svgContent;
    if (!svgContent) {
      const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        svgContent = traceImageDataToSvg(imgData, { numberOfColors: 12 });
      } else {
        svgContent = `<svg><rect width="${layer.width}" height="${layer.height}" fill="none"/></svg>`;
      }
    }
    return {
      id: layer.id,
      name: layer.name,
      svgContent: svgContent,
      visible: layer.visible,
      opacity: layer.opacity,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
    };
  });

  const svgLayers = await Promise.all(layerSvgPromises);
  return createMultiLayerSvg(settings.width, settings.height, svgLayers);
}

/**
 * Packages all separated PNG layers + layered SVG + individual SVGs + Fresco iPad guide into a ZIP
 */
export async function exportToZip(
  settings: ProjectSettings,
  layers: LayerItem[]
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(settings.name || 'FrescoLayers_Progetto');
  const vectorFolder = folder?.folder('vettoriali_svg');

  // Add individual PNG layers and individual SVG vector files
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const dataUrl = layer.canvas.toDataURL('image/png');
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const cleanName = layer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filenamePng = `${String(i + 1).padStart(2, '0')}_${cleanName}.png`;
    folder?.file(filenamePng, base64Data, { base64: true });

    // Individual layer SVG
    let svgStr = layer.svgContent;
    if (!svgStr) {
      const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        svgStr = traceImageDataToSvg(imgData, { numberOfColors: 12 });
      }
    }
    if (svgStr) {
      vectorFolder?.file(`${String(i + 1).padStart(2, '0')}_${cleanName}.svg`, svgStr);
    }
  }

  // Add Multi-layer SVG
  const multiLayerSvg = await exportToMultiLayerSvg(settings, layers);
  folder?.file(`${settings.name || 'progetto'}_multi_livello.svg`, multiLayerSvg);

  // Add Fresco iPad Instructions file
  const guideText = `==========================================================
GUIDA: COME APRIRE I LIVELLI SU ADOBE FRESCO SU IPAD
==========================================================

1. METODO CONSIGLIATO (PSD A LIVELLI):
   - Scarica il file .PSD generato dall'app.
   - Salvalo nell'app "File" di iPad (su iCloud Drive o "Sul mio iPad").
   - Apri Adobe Fresco sul tuo iPad.
   - Nella schermata iniziale, tocca in basso a sinistra su:
     "Importa e apri" -> seleziona il file .PSD.
   - Fatto! Adobe Fresco aprirà tutti i livelli separati, trasparenti e intatti!

2. METODO VETTORIALE (SVG):
   - Apri Adobe Fresco.
   - Tocca "Importa e apri" -> seleziona il file SVG.
   - Fresco importerà i tracciati vettoriali pronti per i pennelli vettoriali.

3. METODO LIVELLI PNG SINGOLI:
   - In Fresco, apri una tela.
   - Tocca l'icona dell'immagine nella barra strumenti a sinistra (Inserisci foto).
   - Seleziona "File" e scegli i singoli PNG trasparenti per sovrapporli come nuovi livelli.
`;
  folder?.file('GUIDA_ADOBE_FRESCO_IPAD.txt', guideText);

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Triggers browser download for a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Shares or saves file using native iPad iOS share sheet or falls back to direct download
 */
export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  title: string = 'Progetto Adobe Fresco'
): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title,
        text: 'Apri questo file in Adobe Fresco con livelli separati!',
      });
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') return false; // user cancelled share sheet
      // Fallback to download
      downloadBlob(blob, filename);
      return true;
    }
  } else {
    downloadBlob(blob, filename);
    return true;
  }
}
