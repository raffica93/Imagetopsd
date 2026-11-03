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
  ShieldCheck,
  User,
  Wand2,
} from 'lucide-react';
import type { LayerItem } from '../types';
import type { ExtractionOptions, ExtractionResult } from '../utils/extraction';
import { createCanvas, context, makeLayer } from '../utils/canvasHelpers';
import { Modal } from './Modal';
import { SemanticRefinementStudio } from './SemanticRefinementStudio';
import type {
  SemanticPart,
  SemanticRefinementMask,
} from '../utils/semanticSegmentation';
import {
  initializeSemanticRefinementMasks,
} from '../utils/semanticSegmentation';
import {
  generateWarriorSampleCanvas,
  generateMageSampleCanvas,
} from '../utils/characterPrototypes';

export type CombinedExtractionMode = 'semantic' | 'objects' | 'colors';

export function ExtractModal({
  layer,
  onClose,
  onApply,
}: {
  layer: LayerItem;
  onClose: () => void;
  onApply: (layers: LayerItem[]) => boolean;
}) {
  const [selectedMode, setSelectedMode] = useState<CombinedExtractionMode>('semantic');

  // Options for objects & colors
  const [options, setOptions] = useState<ExtractionOptions>({
    mode: 'objects',
    background: 'transparent',
    tolerance: 40,
    colors: 6,
  });

  // Options for semantic AI separation
  const [modelId, setModelId] = useState('gemini-3.8-flash');
  const [consent, setConsent] = useState(true);
  const [useMockDemo, setUseMockDemo] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => {
    try {
      return localStorage.getItem('fresco_gemini_key') || '';
    } catch {
      return '';
    }
  });
  const [showKeyField, setShowKeyField] = useState(false);
  const [workingLayer, setWorkingLayer] = useState<LayerItem>(layer);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Result for objects / colors
  const [classicResult, setClassicResult] = useState<{
    layers: LayerItem[];
    ignored: number;
  } | null>(null);

  // Result for semantic refinement studio
  const [semanticStudioData, setSemanticStudioData] = useState<{
    masks: SemanticRefinementMask[];
    isMock: boolean;
    modelUsed: string;
  } | null>(null);

  const worker = useRef<Worker | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
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

  // Load sample prototype character into workingLayer
  const loadPrototype = (type: 'warrior' | 'mage') => {
    const canvas =
      type === 'warrior'
        ? generateWarriorSampleCanvas()
        : generateMageSampleCanvas();
    const name = type === 'warrior' ? 'Guerriero con Spada' : 'Maga Anime';
    const newLayer = makeLayer(canvas, name, workingLayer.x, workingLayer.y);
    newLayer.width = workingLayer.width;
    newLayer.height = workingLayer.height;
    setWorkingLayer(newLayer);
    setError('');
    setClassicResult(null);
    setSemanticStudioData(null);
  };

  // Run Semantic Anatomical AI Separation
  async function runSemanticSeparation() {
    setError('');
    setBusy(true);

    try {
      const canvas = workingLayer.canvas;
      const base64 = canvas.toDataURL('image/png');

      const isWarrior = workingLayer.name.toLowerCase().includes('guerriero');
      const isMage = workingLayer.name.toLowerCase().includes('maga');
      const demoType = isMage ? 'mage' : isWarrior ? 'warrior' : undefined;

      try {
        if (userApiKey) {
          localStorage.setItem('fresco_gemini_key', userApiKey.trim());
        }
      } catch {
        // ignore
      }

      const res = await fetch('/api/segment-semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          modelId,
          consent,
          useMockDemo,
          demoType,
          userApiKey: userApiKey.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Errore durante la separazione semantica.');
      }

      const parts: SemanticPart[] = data.parts || [];
      if (!parts.length) {
        throw new Error(
          'Nessuna componente anatomica identificata con certezza. Prova a regolare i contorni o seleziona un’altra modalità.',
        );
      }

      const ctx = context(canvas);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const masks = initializeSemanticRefinementMasks(
        imgData.data,
        canvas.width,
        canvas.height,
        parts,
      );

      setSemanticStudioData({
        masks,
        isMock: Boolean(data.isMock),
        modelUsed: data.modelUsed || modelId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
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
      <Modal title="Rifinitura Livelli Fresco (Touch & Apple Pencil)" onClose={onClose} wide>
        <SemanticRefinementStudio
          sourceLayer={workingLayer}
          initialMasks={semanticStudioData.masks}
          isMock={semanticStudioData.isMock}
          modelUsed={semanticStudioData.modelUsed}
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
        Lavora su <strong>{workingLayer.name}</strong>. Gli altri livelli restano al loro posto.
      </p>

      {!classicResult ? (
        <>
          {/* 3 Modes */}
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
              <strong>Anatomica (Personaggi / AI)</strong>
              <span>
                Isola Tratto, Accessori, Occhi, Bocca, Capelli, Pelle e Vestiti.
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

          {/* Mode-specific settings */}
          {selectedMode === 'semantic' ? (
            <div className="semantic-options-container">
              {/* Prototipi veloci */}
              <div className="prototype-strip">
                <span className="strip-title">
                  <User size={14} />
                  Prototipi dimostrativi inclusi:
                </span>
                <div className="prototype-buttons">
                  <button
                    type="button"
                    className="prototype-pill"
                    disabled={busy}
                    onClick={() => loadPrototype('warrior')}
                  >
                    Guerriero con Spada (Foto Utente)
                  </button>
                  <button
                    type="button"
                    className="prototype-pill"
                    disabled={busy}
                    onClick={() => loadPrototype('mage')}
                  >
                    <Wand2 size={13} />
                    Maga Anime con Bacchetta
                  </button>
                </div>
              </div>

              {/* Model selection & Free Tier info */}
              <div className="form-grid">
                <label className="form-field">
                  Modello AI (Free Tier)
                  <select
                    value={modelId}
                    disabled={busy}
                    onChange={(e) => setModelId(e.target.value)}
                  >
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Consigliato Free Tier)</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                    <option value="gemini-flash-latest">gemini-flash-latest</option>
                  </select>
                </label>

                <div className="form-field">
                  <span>Opzione Verifica Offline</span>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={useMockDemo}
                      disabled={busy}
                      onChange={(e) => setUseMockDemo(e.target.checked)}
                    />
                    <span>Test dimostrativo offline (dichiarato)</span>
                  </label>
                </div>
              </div>

              {/* Optional Custom API Key accordion */}
              <div className="api-key-config-box">
                <button
                  type="button"
                  className="link-button key-toggle-btn"
                  onClick={() => setShowKeyField(!showKeyField)}
                >
                  {showKeyField
                    ? '▲ Nascondi impostazioni chiave'
                    : '▼ Chiave API Google AI Free Tier (Opzionale / Personale)'}
                </button>
                {showKeyField && (
                  <div className="key-input-container">
                    <p className="note-text">
                      L'app usa automaticamente la chiave <strong>Google AI Free Tier</strong> dell'ambiente con modello <code>gemini-3.8-flash</code> (quota gratuita, zero billing). Se desideri usare la quota del tuo account Google AI Studio, incolla qui la tua API Key personale:
                    </p>
                    <input
                      type="password"
                      placeholder="Incolla API Key Google AI (es. AIzaSy...)"
                      value={userApiKey}
                      disabled={busy}
                      onChange={(e) => setUserApiKey(e.target.value)}
                      className="key-input"
                    />
                  </div>
                )}
              </div>

              {/* Explicit Consent Checkbox */}
              <label className="consent-box">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span className="consent-text">
                  <ShieldCheck size={16} />
                  <span>
                    <strong>Consenso Google AI Free Tier:</strong> accetto l'invio
                    dell'immagine ai server Google per l'elaborazione multimodale
                    secondo i termini del piano gratuito. Nessun billing o costo.
                  </span>
                </span>
              </label>

              <div className="note">
                <strong>9 Livelli Adobe Fresco generati:</strong> 1. Tratto / Lineart · 2. Accessori (spada/gioielli) · 3. Occhi · 4. Bocca · 5. Capelli · 6. Pelle (viso, orecchie, collo) · 7. Vestiti · 8. Sfondo · 9. Originale nascosto per recupero non distruttivo. Potrai rifinire ogni maschera con Apple Pencil prima di applicarla!
              </div>
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
                        background: e.target.value as ExtractionOptions['background'],
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
                  ? 'Funziona con elementi distanziati. Per personaggi illustrati, usa la modalità "Anatomica" in alto.'
                  : 'Raggruppa i pixel per colore. Per distinguere invece parti corporee (pelle, capelli, abiti), usa "Anatomica".'}
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
                  ? 'Il soggetto è connesso. Usa la modalità "Anatomica" per separare i vestiti, la pelle e i capelli.'
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

        <button
          type="button"
          className="button primary"
          disabled={busy || (selectedMode === 'semantic' && !consent && !useMockDemo)}
          onClick={() => {
            if (classicResult) {
              onApply(classicResult.layers) && onClose();
            } else if (selectedMode === 'semantic') {
              void runSemanticSeparation();
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
                ? 'Avvia Separazione Anatomica'
                : 'Trova i livelli'}
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
