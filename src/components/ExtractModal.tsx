/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  LoaderCircle,
  Shapes,
  Palette,
  Check,
  RotateCcw,
  Sparkles,
  User,
  Wand2,
} from 'lucide-react';
import type { LayerItem } from '../types';
import type { ExtractionOptions, ExtractionResult } from '../utils/extraction';
import { createCanvas, context, makeLayer } from '../utils/canvasHelpers';
import { Modal } from './Modal';
import { SemanticRefinementStudio } from './SemanticRefinementStudio';
import { SemanticDiscovery } from './SemanticDiscovery';
import type { DiscoveredSelection } from './SemanticDiscovery';
import {
  initializeSemanticRefinementMasks,
  restoreGroupMasks,
} from '../utils/semanticSegmentation';
import {
  generateWarriorSampleCanvas,
  generateMageSampleCanvas,
  getWarriorSemanticGroundTruth,
  getMageSemanticGroundTruth,
} from '../utils/characterPrototypes';

export type CombinedExtractionMode = 'semantic' | 'objects' | 'colors';

export function ExtractModal({
  layer,
  onClose,
  onApply,
  existingLayers = [],
}: {
  layer: LayerItem;
  existingLayers?: LayerItem[];
  onClose: () => void;
  onApply: (layers: LayerItem[]) => boolean;
}) {
  const [selectedMode, setSelectedMode] =
    useState<CombinedExtractionMode>('semantic');

  // Options for objects & colors
  const [options, setOptions] = useState<ExtractionOptions>({
    mode: 'objects',
    background: 'transparent',
    tolerance: 40,
    colors: 6,
  });

  const [workingLayer, setWorkingLayer] = useState<LayerItem>(layer);

  const [busy, setBusy] = useState(false);
  const [discoveryStarted, setDiscoveryStarted] = useState(false);
  const [error, setError] = useState('');

  // Result for objects / colors
  const [classicResult, setClassicResult] = useState<{
    layers: LayerItem[];
    ignored: number;
  } | null>(null);

  // Result for semantic refinement studio
  const [semanticStudioData, setSemanticStudioData] =
    useState<DiscoveredSelection | null>(() =>
      existingLayers.length
        ? {
            masks: restoreGroupMasks(layer, existingLayers),
            isMock: false,
            modelUsed: 'Livelli esistenti',
            inventory: layer.semanticInventory,
          }
        : null,
    );

  const worker = useRef<Worker | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.removeItem('fresco_gemini_key');
    } catch {}
    return () => {
      worker.current?.terminate();
      clearTimeout(timer.current);
    };
  }, []);

  function stopWorker() {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timer.current);
    setBusy(false);
  }

  function loadPrototype(type: 'warrior' | 'mage') {
    const canvas =
      type === 'warrior'
        ? generateWarriorSampleCanvas()
        : generateMageSampleCanvas();
    const source = makeLayer(
      canvas,
      type === 'warrior' ? 'Guerriero con Spada' : 'Maga Anime',
      workingLayer.x,
      workingLayer.y,
    );
    source.width = workingLayer.width;
    source.height = workingLayer.height;
    setWorkingLayer(source);
    setSemanticStudioData({
      masks: initializeSemanticRefinementMasks(
        context(canvas).getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
        type === 'warrior'
          ? getWarriorSemanticGroundTruth()
          : getMageSemanticGroundTruth(),
      ),
      isMock: true,
      modelUsed: 'Esempio geometrico, senza AI',
    });
  }

  // Run classic worker (objects or colors)
  function runClassic() {
    setError('');
    setClassicResult(null);
    setBusy(true);
    try {
      const pixels = context(workingLayer.canvas).getImageData(
        0,
        0,
        workingLayer.canvas.width,
        workingLayer.canvas.height,
      );
      const w = new Worker(
        new URL('../workers/extraction.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = w;
      timer.current = window.setTimeout(() => {
        stopWorker();
        setError(
          'L’analisi richiede troppo tempo. Prova un’immagine più piccola o il ritaglio manuale.',
        );
      }, 45_000);

      w.onerror = () => {
        stopWorker();
        setError(
          'Analisi non riuscita. Prova un’immagine più piccola o il ritaglio manuale.',
        );
      };

      w.onmessage = (
        e: MessageEvent<{ error?: string; result?: ExtractionResult }>,
      ) => {
        stopWorker();
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
            const sx = workingLayer.width / workingLayer.canvas.width;
            const sy = workingLayer.height / workingLayer.canvas.height;
            return {
              ...makeLayer(
                canvas,
                element.name,
                Math.round(workingLayer.x + element.x * sx),
                Math.round(workingLayer.y + element.y * sy),
              ),
              width: Math.max(1, Math.round(element.width * sx)),
              height: Math.max(1, Math.round(element.height * sy)),
              opacity: workingLayer.opacity,
              blendMode: workingLayer.blendMode,
            };
          });
          setClassicResult({ layers, ignored: e.data.result.ignored });
        } catch {
          setError(
            'Memoria insufficiente per creare i livelli. Usa un’immagine più piccola.',
          );
        }
      };

      w.postMessage(
        {
          pixels: pixels.data.buffer,
          width: workingLayer.canvas.width,
          height: workingLayer.canvas.height,
          options: {
            ...options,
            mode: selectedMode === 'colors' ? 'colors' : 'objects',
          },
        },
        [pixels.data.buffer],
      );
    } catch {
      stopWorker();
      setError(
        'Separazione non disponibile in questo browser. Puoi usare il ritaglio manuale.',
      );
    }
  }

  // If semantic refinement studio is open, render it inside the modal
  if (semanticStudioData) {
    return (
      <Modal title="Rifinisci le selezioni" onClose={onClose} wide full>
        <SemanticRefinementStudio
          sourceLayer={workingLayer}
          initialMasks={semanticStudioData.masks}
          isMock={semanticStudioData.isMock}
          modelUsed={semanticStudioData.modelUsed}
          warning={semanticStudioData.warning}
          inventory={semanticStudioData.inventory}
          onApply={(generatedLayers) => {
            if (onApply(generatedLayers)) {
              onClose();
            }
          }}
          onBack={() => setSemanticStudioData(null)}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Separa in livelli" onClose={onClose} wide>
      <p className="modal-intro">
        Lavora su <strong>{workingLayer.name}</strong>. Gli altri livelli
        restano al loro posto.
      </p>

      {!classicResult ? (
        <>
          {/* 3 Modes */}
          {!(selectedMode === 'semantic' && discoveryStarted) && (
            <div
              className="mode-cards three-modes"
              role="group"
              aria-label="Metodo di separazione"
            >
              <button
                type="button"
                className={`mode-card semantic-mode-card ${selectedMode === 'semantic' ? 'chosen' : ''}`}
                disabled={busy}
                aria-pressed={selectedMode === 'semantic'}
                onClick={() => setSelectedMode('semantic')}
              >
                <div className="mode-card-header">
                  <Sparkles size={22} className="ai-accent-icon" />
                  <span className="free-tier-chip">Google Free Tier</span>
                </div>
                <strong>Parti del soggetto (AI)</strong>
                <span>
                  Riconosce le parti, le seleziona e ordina i livelli.
                </span>
              </button>

              <button
                type="button"
                className={`mode-card ${selectedMode === 'objects' ? 'chosen' : ''}`}
                disabled={busy}
                aria-pressed={selectedMode === 'objects'}
                onClick={() => setSelectedMode('objects')}
              >
                <Shapes size={22} />
                <strong>Oggetti separati</strong>
                <span>Sticker e soggetti che non si toccano.</span>
              </button>

              <button
                type="button"
                className={`mode-card ${selectedMode === 'colors' ? 'chosen' : ''}`}
                disabled={busy}
                aria-pressed={selectedMode === 'colors'}
                onClick={() => setSelectedMode('colors')}
              >
                <Palette size={22} />
                <strong>Per colore</strong>
                <span>Illustrazioni con tinte distinte (K-means).</span>
              </button>
            </div>
          )}

          {/* Mode-specific settings */}
          {selectedMode === 'semantic' ? (
            <div className="semantic-options-container">
              <SemanticDiscovery
                layer={workingLayer}
                onReady={setSemanticStudioData}
                onBusyChange={setBusy}
                onInventoryChange={setDiscoveryStarted}
              />
              {!discoveryStarted && (
                <details className="discovery-examples">
                  <summary>Esempi geometrici senza AI</summary>
                  <div className="prototype-buttons">
                    <button
                      type="button"
                      className="prototype-pill"
                      disabled={busy}
                      onClick={() => loadPrototype('warrior')}
                    >
                      <User size={14} />
                      Carica esempio guerriero
                    </button>
                    <button
                      type="button"
                      className="prototype-pill"
                      disabled={busy}
                      onClick={() => loadPrototype('mage')}
                    >
                      <Wand2 size={14} />
                      Carica esempio maga
                    </button>
                  </div>
                </details>
              )}
            </div>
          ) : (
            <>
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
                {selectedMode === 'colors' && (
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
                {selectedMode === 'objects'
                  ? 'Funziona con elementi distanziati. Per personaggi illustrati, usa la modalità "Parti del soggetto" in alto.'
                  : 'Raggruppa i pixel per colore. Per distinguere invece parti del soggetto, usa "Parti del soggetto".'}
              </div>
            </>
          )}
        </>
      ) : (
        /* Classic results view (for objects and colors) */
        <>
          <div className="result-heading">
            <span className="success-icon">
              <Check size={20} />
            </span>
            <div>
              <strong>
                {classicResult.layers.length}{' '}
                {classicResult.layers.length === 1
                  ? 'livello rilevato'
                  : 'livelli rilevati'}
              </strong>
              <p>
                {classicResult.layers.length === 1
                  ? 'Il soggetto è connesso. Usa la modalità "Parti del soggetto" per separare i vestiti, la pelle e i capelli.'
                  : 'Ogni elemento diventerà un livello indipendente.'}
              </p>
            </div>
          </div>
          <div className="extraction-results">
            {classicResult.layers.map((l) => (
              <div key={l.id}>
                <div className="checker">
                  <img src={l.previewUrl} alt={l.name} />
                </div>
                <span>{l.name}</span>
              </div>
            ))}
          </div>
          {classicResult.ignored > 0 && (
            <p className="subtle">
              {classicResult.ignored.toLocaleString('it-IT')} pixel di
              trasparenza tenue o piccoli frammenti esclusi. Puoi annullare
              l’operazione.
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
          type="button"
          className="button secondary"
          onClick={() => {
            if (classicResult) {
              setClassicResult(null);
              setError('');
            } else onClose();
          }}
        >
          {classicResult ? (
            <>
              <RotateCcw size={16} />
              Cambia opzioni
            </>
          ) : (
            'Annulla'
          )}
        </button>

        {(selectedMode !== 'semantic' || classicResult) && (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => {
              if (classicResult) {
                onApply(classicResult.layers) && onClose();
              } else {
                runClassic();
              }
            }}
          >
            {busy ? (
              <>
                <LoaderCircle size={18} className="spin" />
                {selectedMode === 'semantic'
                  ? 'Analisi anatomica in corso…'
                  : 'Analisi in corso…'}
              </>
            ) : classicResult ? (
              <>
                Usa questi livelli
                <Check size={18} />
              </>
            ) : (
              <>
                {selectedMode === 'semantic'
                  ? 'Identifica le parti'
                  : 'Trova i livelli'}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}
