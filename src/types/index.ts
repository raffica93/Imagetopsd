export type BlendMode = 
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color dodge'
  | 'color burn'
  | 'hard light'
  | 'soft light'
  | 'difference'
  | 'exclusion';

export interface LayerItem {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0 to 1
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  previewUrl: string;
  locked?: boolean;
  isVector?: boolean;
  svgContent?: string;
  vectorPathsCount?: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
}

export interface ExtractionSettings {
  mode: 'alpha' | 'colorKey';
  targetColor: { r: number; g: number; b: number };
  tolerance: number; // 0 - 255
  minPixelCount: number;
  padding: number;
}

export interface ProjectSettings {
  name: string;
  width: number;
  height: number;
  dpi: number;
  backgroundColor: 'transparent' | 'white' | 'black' | 'custom';
  customBgColor?: string;
}
