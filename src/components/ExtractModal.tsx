/** @license SPDX-License-Identifier: Apache-2.0 */
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Palette, Shapes } from 'lucide-react';
import type { LayerItem } from '../types';
import type { ExtractionResult } from '../utils/extraction';
import { createCanvas, context, makeLayer } from '../utils/canvasHelpers';
import { buildProjectLayersFromMasks } from '../utils/semanticSegmentation';
import { Modal } from './Modal';
import { SemanticDiscovery } from './SemanticDiscovery';

export function ExtractModal({
  layer,
  onClose,
  onApply,
  onSettings,
}: {
  layer: LayerItem;
  onClose: () => void;
  onApply: (layers: LayerItem[], message?: string) => boolean;
  onSettings: () => void;
}) {
  const [aiBusy, setAiBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      worker.current?.terminate();
      clearTimeout(timer.current);
    },
    [],
  );
  function finish() {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timer.current);
    setLocalBusy(false);
  }
  function runLocal(mode: 'objects' | 'colors') {
    if (worker.current || aiBusy) return;
    setError('');
    setLocalBusy(true);
    try {
      const pixels = context(layer.canvas).getImageData(
        0,
        0,
        layer.canvas.width,
        layer.canvas.height,
      );
      const w = layer.canvas.width,
        h = layer.canvas.height;
      const corners = [0, w - 1, (h - 1) * w, w * h - 1];
      const whiteBackground =
        corners.filter(
          (i) =>
            pixels.data[i * 4 + 3] === 255 &&
            Math.min(
              pixels.data[i * 4],
              pixels.data[i * 4 + 1],
              pixels.data[i * 4 + 2],
            ) > 235,
        ).length >= 3;
      const instance = new Worker(
        new URL('../workers/extraction.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = instance;
      timer.current = window.setTimeout(() => {
        finish();
        setError('Separazione troppo lenta. Prova un’immagine più piccola.');
      }, 45_000);
      instance.onerror = () => {
        finish();
        setError('Separazione locale non riuscita.');
      };
      instance.onmessage = (
        event: MessageEvent<{ error?: string; result?: ExtractionResult }>,
      ) => {
        finish();
        if (event.data.error) {
          setError(event.data.error);
          return;
        }
        if (!event.data.result) return;
        try {
          const sx = layer.width / layer.canvas.width,
            sy = layer.height / layer.canvas.height;
          const layers = event.data.result.elements.map((element) => {
            const canvas = createCanvas(element.width, element.height);
            context(canvas).putImageData(
              new ImageData(
                new Uint8ClampedArray(element.pixels),
                element.width,
                element.height,
              ),
              0,
              0,
            );
            return {
              ...makeLayer(
                canvas,
                element.name,
                Math.round(layer.x + element.x * sx),
                Math.round(layer.y + element.y * sy),
              ),
              width: Math.max(1, Math.round(element.width * sx)),
              height: Math.max(1, Math.round(element.height * sy)),
              opacity: layer.opacity,
              blendMode: layer.blendMode,
            };
          });
          if (!layers.length) {
            setError('Nessun elemento separabile trovato. Usa l’analisi AI.');
            return;
          }
          if (onApply(layers)) onClose();
        } catch {
          setError(
            'Memoria insufficiente per creare i livelli. Prova un’immagine più piccola.',
          );
        }
      };
      instance.postMessage(
        {
          pixels: pixels.data.buffer,
          width: layer.canvas.width,
          height: layer.canvas.height,
          options: {
            mode,
            background: whiteBackground ? 'white' : 'transparent',
            tolerance: 40,
            colors: 6,
          },
        },
        [pixels.data.buffer],
      );
    } catch {
      finish();
      setError('Separazione locale non disponibile in questo browser.');
    }
  }
  return (
    <Modal title="Separa in livelli" onClose={onClose} wide>
      <SemanticDiscovery
        layer={layer}
        onBusyChange={setAiBusy}
        disabled={localBusy}
        onSettings={onSettings}
        onReady={({ masks, inventory, warning }) => {
          const layers = buildProjectLayersFromMasks(layer, masks, inventory);
          if (!onApply(layers, warning))
            throw new Error(
              'Non riesco ad aggiungere i livelli. Riduci il numero di livelli del progetto e riprova.',
            );
          onClose();
        }}
      />
      {!aiBusy && (
        <details className="local-methods">
          <summary>Altri metodi · senza AI</summary>
          <p className="note-text">
            Per sticker isolati o grafica piatta. Lo sfondo è riconosciuto
            automaticamente.
          </p>
          <div className="local-method-buttons">
            <button
              className="button secondary"
              disabled={localBusy}
              onClick={() => runLocal('objects')}
            >
              <Shapes size={18} />
              Oggetti separati
            </button>
            <button
              className="button secondary"
              disabled={localBusy}
              onClick={() => runLocal('colors')}
            >
              <Palette size={18} />
              Gruppi di colore
            </button>
          </div>
          {localBusy && (
            <p className="auto-defaults" role="status">
              <LoaderCircle className="spin" size={18} />
              Separo gli elementi…
            </p>
          )}
        </details>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
