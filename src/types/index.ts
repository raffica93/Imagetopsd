export type BlendMode = 'normal' | 'multiply' | 'screen';

// The first item is the topmost layer. Canvas pixels are immutable after creation.
export interface SemanticMetadata {
  semanticGroupId?: string;
  semanticRole?: string;
  semanticLeft?: number;
  semanticTop?: number;
}
export interface LayerItem extends SemanticMetadata {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  previewUrl: string;
  locked: boolean;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
}

export interface ProjectSettings {
  name: string;
  width: number;
  height: number;
  dpi: number;
  backgroundColor: 'transparent' | 'white';
}

export interface Project {
  settings: ProjectSettings;
  layers: LayerItem[];
  activeLayerId: string | null;
}

export type Tool = 'move' | 'pan' | 'cut';
export const MAX_EDGE = 2560;
export const MAX_IMAGE_PIXELS = 4_000_000;
export const MAX_PROJECT_PIXELS = 12_000_000;
export const MAX_LAYERS = 32;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;
