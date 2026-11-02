import { extractPixels } from '../utils/extraction';
import type { ExtractionOptions } from '../utils/extraction';
self.onmessage = (
  event: MessageEvent<{
    pixels: ArrayBuffer;
    width: number;
    height: number;
    options: ExtractionOptions;
  }>,
) => {
  try {
    const { pixels, width, height, options } = event.data;
    const result = extractPixels(
      new Uint8ClampedArray(pixels),
      width,
      height,
      options,
    );
    self.postMessage(
      { result },
      { transfer: result.elements.map((e) => e.pixels.buffer as ArrayBuffer) },
    );
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : 'Separazione non riuscita.',
    });
  }
};
