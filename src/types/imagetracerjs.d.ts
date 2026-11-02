declare module 'imagetracerjs' {
  interface ImageTracerOptions {
    corsenabled?: boolean;
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    rightangleenhance?: boolean;
    colorsampling?: number;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: number;
    layercontainerid?: string;
    viewbox?: boolean;
    scale?: number;
    roundcoords?: number;
    desc?: boolean;
    lcpr?: number;
    qcpr?: number;
    blurradius?: number;
    blurdelta?: number;
    pal?: Array<{ r: number; g: number; b: number; a: number }>;
    linefilter?: boolean;
  }

  const ImageTracer: {
    imagedataToSVG: (imgData: ImageData, options?: ImageTracerOptions) => string;
    imageToSVG: (url: string, callback: (svgStr: string) => void, options?: ImageTracerOptions) => void;
    imagedataToTracedata: (imgData: ImageData, options?: ImageTracerOptions) => any;
    [key: string]: any;
  };

  export default ImageTracer;
}
