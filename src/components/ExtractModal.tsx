import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  LoaderCircle,
  Shapes,
  Palette,
  Check,
  RotateCcw,
} from 'lucide-react';
import type { LayerItem } from '../types';
import type { ExtractionOptions, ExtractionResult } from '../utils/extraction';
import { createCanvas, context, makeLayer } from '../utils/canvasHelpers';
import { Modal } from './Modal';

export function ExtractModal({
  layer,
  onClose,
  onApply,
}: {
  layer: LayerItem;
  onClose: () => void;
  onApply: (layers: LayerItem[]) => boolean;
}) {
  const [options, setOptions] = useState<ExtractionOptions>({
    mode: 'objects',
    background: 'transparent',
    tolerance: 40,
    colors: 6,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [result, setResult] = useState<{
    layers: LayerItem[];
    ignored: number;
  } | null>(null);
  const worker = useRef<Worker | null>(null),
    timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      worker.current?.terminate();
      clearTimeout(timer.current);
    },
    [],
  );
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timer.current);
    setBusy(false);
  }
  function run() {
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const pixels = context(layer.canvas).getImageData(
        0,
        0,
        layer.canvas.width,
        layer.canvas.height,
      );
      const w = new Worker(
        new URL('../workers/extraction.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = w;
      timer.current = window.setTimeout(() => {
        stop();
        setError(
          'L’analisi richiede troppo tempo. Prova un’immagine più piccola o il ritaglio manuale.',
        );
      }, 45_000);
      w.onerror = () => {
        stop();
        setError(
          'Analisi non riuscita. Prova un’immagine più piccola o il ritaglio manuale.',
        );
      };
      w.onmessage = (
        e: MessageEvent<{ error?: string; result?: ExtractionResult }>,
      ) => {
        stop();
        if (e.data.error) {
          setError(e.data.error);
          return;
        }
        if (!e.data.result) return;
        try {
          const layers = e.data.result.elements.map((element) => {
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
            const sx = layer.width / layer.canvas.width,
              sy = layer.height / layer.canvas.height;
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
          setResult({ layers, ignored: e.data.result.ignored });
        } catch {
          setError(
            'Memoria insufficiente per creare i livelli. Usa un’immagine più piccola.',
          );
        }
      };
      w.postMessage(
        {
          pixels: pixels.data.buffer,
          width: layer.canvas.width,
          height: layer.canvas.height,
          options,
        },
        [pixels.data.buffer],
      );
    } catch {
      stop();
      setError(
        'Separazione non disponibile in questo browser. Puoi usare il ritaglio manuale.',
      );
    }
  }
  return (
    <Modal title="Separa in livelli" onClose={onClose} wide>
      <p className="modal-intro">
        Lavora su <strong>{layer.name}</strong>. Gli altri livelli restano al
        loro posto.
      </p>
      {!result ? (
        <>
          <div
            className="mode-cards"
            role="group"
            aria-label="Metodo di separazione"
          >
            <button
              className={`mode-card ${options.mode === 'objects' ? 'chosen' : ''}`}
              disabled={busy}
              aria-pressed={options.mode === 'objects'}
              onClick={() => setOptions((o) => ({ ...o, mode: 'objects' }))}
            >
              <Shapes size={23} />
              <strong>Oggetti separati</strong>
              <span>Sticker e soggetti che non si toccano.</span>
            </button>
            <button
              className={`mode-card ${options.mode === 'colors' ? 'chosen' : ''}`}
              disabled={busy}
              aria-pressed={options.mode === 'colors'}
              onClick={() => setOptions((o) => ({ ...o, mode: 'colors' }))}
            >
              <Palette size={23} />
              <strong>Per colore</strong>
              <span>Illustrazioni con tinte distinte.</span>
            </button>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Sfondo dell’immagine
              <select
                value={options.background}
                disabled={busy}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    background: e.target
                      .value as ExtractionOptions['background'],
                  }))
                }
              >
                <option value="transparent">Trasparente (PNG)</option>
                <option value="white">Bianco, collegato ai bordi</option>
              </select>
            </label>
            {options.mode === 'colors' && (
              <label className="form-field">
                Gruppi di colore
                <select
                  value={options.colors}
                  disabled={busy}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      colors: Number(e.target.value),
                    }))
                  }
                >
                  {[4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} colori + contorni
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {options.background === 'white' && (
            <div className="tolerance">
              <div className="range-label">
                <label htmlFor="tolerance">Tolleranza del bianco</label>
                <output>{options.tolerance}</output>
              </div>
              <input
                id="tolerance"
                type="range"
                min="5"
                max="120"
                value={options.tolerance}
                disabled={busy}
                onChange={(e) =>
                  setOptions((o) => ({
                    ...o,
                    tolerance: Number(e.target.value),
                  }))
                }
              />
            </div>
          )}
          <div className="note">
            {options.mode === 'objects'
              ? 'Funziona con elementi distanziati. Per una foto o soggetti sovrapposti, usa il ritaglio manuale.'
              : 'Raggruppa i pixel per colore, mantenendo le tinte originali. Non ricostruisce le parti nascoste dei soggetti.'}
          </div>
        </>
      ) : (
        <>
          <div className="result-heading">
            <span className="success-icon">
              <Check size={20} />
            </span>
            <div>
              <strong>
                {result.layers.length}{' '}
                {result.layers.length === 1
                  ? 'livello rilevato'
                  : 'livelli rilevati'}
              </strong>
              <p>
                {result.layers.length === 1
                  ? 'Il soggetto è connesso. Puoi riprovare per colore o ritagliarlo a mano.'
                  : 'Ogni elemento diventerà un livello indipendente.'}
              </p>
            </div>
          </div>
          <div className="extraction-results">
            {result.layers.map((l) => (
              <div key={l.id}>
                <div className="checker">
                  <img src={l.previewUrl} alt={l.name} />
                </div>
                <span>{l.name}</span>
              </div>
            ))}
          </div>
          {result.ignored > 0 && (
            <p className="subtle">
              {result.ignored.toLocaleString('it-IT')} pixel di trasparenza
              tenue o piccoli frammenti esclusi. Puoi annullare l’operazione.
            </p>
          )}
        </>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-footer">
        <button
          className="button secondary"
          onClick={() => {
            if (result) {
              setResult(null);
              setError('');
            } else onClose();
          }}
        >
          {result ? (
            <>
              <RotateCcw size={16} />
              Cambia opzioni
            </>
          ) : (
            'Annulla'
          )}
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => (result ? onApply(result.layers) && onClose() : run())}
        >
          {busy ? (
            <>
              <LoaderCircle size={18} className="spin" />
              Analisi in corso…
            </>
          ) : result ? (
            <>
              Usa questi livelli
              <Check size={18} />
            </>
          ) : (
            <>
              Trova i livelli
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
