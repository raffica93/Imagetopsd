import ImageTracer from 'imagetracerjs';

export type SimplificationLevel = 'low' | 'medium' | 'high';

export interface VectorizeOptions {
  numberOfColors: number; // 2 to 32
  colorQuantCycles: number; // 1 to 5
  minArea: number; // minimum area in pixels to trace
  pathOmit: number; // discard small speckles (e.g., 1-16)
  lineFilter: boolean;
  scale: number;
  curveSmoothness: 'sharp' | 'balanced' | 'smooth';
  simplificationLevel: SimplificationLevel;
}

export const DEFAULT_VECTOR_OPTIONS: VectorizeOptions = {
  numberOfColors: 12,
  colorQuantCycles: 3,
  minArea: 8,
  pathOmit: 4,
  lineFilter: false,
  scale: 1,
  curveSmoothness: 'balanced',
  simplificationLevel: 'medium',
};

/**
 * Returns ImageTracer parameters based on chosen path simplification level
 * - low detail = highest simplification (fewer anchor points, smooth lightweight curves)
 * - medium detail = balanced (standard curve fitting)
 * - high detail = lowest simplification (captures subtle corners and fine contours)
 */
export function getSimplificationParams(level: SimplificationLevel) {
  switch (level) {
    case 'low':
      // Low detail: highest simplification, fewer anchors, filters out tiny noise
      return {
        qtres: 2.8,
        ltres: 2.8,
        pathomit: 10,
        roundcoords: 2,
        label: 'Basso Dettaglio (Ultra Semplificato)',
        description: 'Tracciati leggeri, curve lisce e pochi nodi. Massima fluidità con Apple Pencil su Fresco.',
      };
    case 'high':
      // High detail: low simplification, preserves fine nuances and sharp corners
      return {
        qtres: 0.35,
        ltres: 0.35,
        pathomit: 1,
        roundcoords: 1,
        label: 'Alto Dettaglio (Massima Fedeltà)',
        description: 'Cattura ogni angolo, curvatura e micro-dettaglio dell\'immagine originale.',
      };
    case 'medium':
    default:
      // Medium detail: balanced compromise
      return {
        qtres: 1.0,
        ltres: 1.0,
        pathomit: 4,
        roundcoords: 1,
        label: 'Medio Dettaglio (Bilanciato)',
        description: 'Rapporto ottimale tra fedeltà visiva e pulizia dei tracciati.',
      };
  }
}

/**
 * Converts curve smoothness preset to ImageTracer parameters
 */
export function getSmoothnessParams(preset: 'sharp' | 'balanced' | 'smooth') {
  switch (preset) {
    case 'sharp':
      return { qtresMultiplier: 0.7, ltresMultiplier: 0.7, roundcoords: 1 };
    case 'smooth':
      return { qtresMultiplier: 1.5, ltresMultiplier: 1.5, roundcoords: 2 };
    case 'balanced':
    default:
      return { qtresMultiplier: 1.0, ltresMultiplier: 1.0, roundcoords: 1 };
  }
}

/**
 * Counts the number of <path tags in an SVG string
 */
export function countSvgPaths(svgString: string): number {
  const matches = svgString.match(/<path[\s\S]*?>/gi);
  return matches ? matches.length : 0;
}

/**
 * Traces ImageData to an SVG string using pure JavaScript ImageTracer with Path Simplification
 */
export function traceImageDataToSvg(
  imageData: ImageData,
  options: Partial<VectorizeOptions> = {}
): string {
  const mergedOptions: VectorizeOptions = { ...DEFAULT_VECTOR_OPTIONS, ...options };
  const simp = getSimplificationParams(mergedOptions.simplificationLevel || 'medium');
  const smoothness = getSmoothnessParams(mergedOptions.curveSmoothness);

  // Apply curve smoothness multiplier to simplification thresholds
  const effectiveQtres = Number((simp.qtres * smoothness.qtresMultiplier).toFixed(2));
  const effectiveLtres = Number((simp.ltres * smoothness.ltresMultiplier).toFixed(2));
  const effectivePathOmit = mergedOptions.pathOmit ?? simp.pathomit;

  const tracerOptions = {
    numberofcolors: mergedOptions.numberOfColors,
    colorquantcycles: mergedOptions.colorQuantCycles,
    pathomit: effectivePathOmit,
    linefilter: mergedOptions.lineFilter,
    scale: mergedOptions.scale,
    qtres: effectiveQtres,
    ltres: effectiveLtres,
    roundcoords: simp.roundcoords,
    viewbox: true,
  };

  try {
    const svgString = ImageTracer.imagedataToSVG(imageData, tracerOptions);
    return svgString;
  } catch (error) {
    console.error('Vectorization error:', error);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${imageData.width}" height="${imageData.height}"></svg>`;
  }
}

/**
 * Vectorizes an HTMLCanvasElement directly, returning the SVG markup and path count
 */
export function vectorizeCanvas(
  canvas: HTMLCanvasElement,
  options: Partial<VectorizeOptions> = {}
): { svg: string; pathCount: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"></svg>`,
      pathCount: 0,
    };
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const svg = traceImageDataToSvg(imgData, options);
  const pathCount = countSvgPaths(svg);
  return { svg, pathCount };
}

/**
 * Wraps multiple layer SVGs into an Adobe Fresco and Adobe Illustrator compatible multi-layer SVG
 * Preserves individual layer coordinate offsets (x, y), opacity, and visibility
 */
export function createMultiLayerSvg(
  width: number,
  height: number,
  layers: {
    id: string;
    name: string;
    svgContent?: string;
    visible: boolean;
    opacity: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }[]
): string {
  let combinedSvg = `<?xml version="1.0" encoding="utf-8"?>\n`;
  combinedSvg += `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `;
  combinedSvg += `xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:adobe="http://ns.adobe.com/AdobeIllustrator/10.0/" `;
  combinedSvg += `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer.visible || !layer.svgContent) continue;

    let innerContent = layer.svgContent;
    const svgOpenMatch = innerContent.indexOf('>');
    const svgCloseMatch = innerContent.lastIndexOf('</svg>');
    if (svgOpenMatch !== -1 && svgCloseMatch !== -1) {
      innerContent = innerContent.substring(svgOpenMatch + 1, svgCloseMatch);
    }

    const safeName = layer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const posX = Math.round(layer.x ?? 0);
    const posY = Math.round(layer.y ?? 0);
    const transformAttr = posX !== 0 || posY !== 0 ? ` transform="translate(${posX}, ${posY})"` : '';

    combinedSvg += `  <g id="Livello_${i + 1}_${safeName}" data-name="${layer.name}" inkscape:groupmode="layer" inkscape:label="${layer.name}" opacity="${layer.opacity}"${transformAttr}>\n`;
    combinedSvg += `    ${innerContent.trim()}\n`;
    combinedSvg += `  </g>\n`;
  }

  combinedSvg += `</svg>`;
  return combinedSvg;
}
