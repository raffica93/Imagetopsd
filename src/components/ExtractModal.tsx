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
import type { SemanticRefinementMask } from '../utils/semanticSegmentation';
import {
  initializeSemanticRefinementMasks,
  decodeSemanticParts,
  validateSemanticParts,
  restoreGroupMasks,
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

  // Options for semantic AI separation
  const [modelId, setModelId] = useState('gemini-3.5-flash-lite');
  const [consent, setConsent] = useState(false);
  const [useMockDemo, setUseMockDemo] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  const [prototypeType, setPrototypeType] = useState<'warrior' | 'mage' | null>(
    null,
  );
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
    warning?: string;
  } | null>(() =>
    existingLayers.length
      ? {
          masks: restoreGroupMasks(layer, existingLayers),
          isMock: false,
          modelUsed: 'Livelli esistenti',
        }
      : null,
  );

  const request = useRef<AbortController | null>(null);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.removeItem('fresco_gemini_key');
    } catch {}
    return () => {
      request.current?.abort();
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
    setPrototypeType(type);
    setUseMockDemo(true);
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

      const demoType = prototypeType;
      const controller = new AbortController();
      request.current = controller;
      const res = await fetch('/api/segment-semantic', {
        method: 'POST',
        signal: controller.signal,
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
        throw new Error(
          data.error || 'Errore durante la separazione semantica.',
        );
      }

      if (data.isMock && (!useMockDemo || !prototypeType))
        throw new Error(
          'Il server ha restituito sagome di prova per una foto. Il risultato non è stato applicato.',
        );
      const parts = await decodeSemanticParts(
        validateSemanticParts(
          data.parts,
          !data.isMock && data.maskFormat !== 'polygons',
        ),
        canvas.width,
        canvas.height,
      );
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
        warning:
          Number.isInteger(data.discardedParts) && data.discardedParts > 0
            ? `${data.discardedParts} contorni non validi scartati. Controlla “Da assegnare” e correggi le parti.`
            : undefined,
      });
    } catch (err: unknown) {
      if (request.current?.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function refineManually() {
    request.current?.abort();
    const c = workingLayer.canvas;
    const masks = initializeSemanticRefinementMasks(
      context(c).getImageData(0, 0, c.width, c.height).data,
      c.width,
      c.height,
      [],
    );
    setSemanticStudioData({
      masks,
      isMock: false,
      modelUsed: 'Rifinitura manuale',
    });
    setError('');
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
              {/* Explicit geometric examples; never a fallback for uploaded photos. */}
              <div className="prototype-strip">
                <span className="strip-title">
                  <User size={14} />
                  Esempi geometrici (senza AI):
                </span>
                <div className="prototype-buttons">
                  <button
                    type="button"
                    className="prototype-pill"
                    disabled={busy}
                    onClick={() => loadPrototype('warrior')}
                  >
                    Carica esempio guerriero
                  </button>
                  <button
                    type="button"
                    className="prototype-pill"
                    disabled={busy}
                    onClick={() => loadPrototype('mage')}
                  >
                    <Wand2 size={13} />
                    Carica esempio maga
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
                    <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                    <option value="gemini-3.5-flash-lite">
                      gemini-3.5-flash-lite
                    </option>
                  </select>
                </label>

                <div className="form-field">
                  <span>Opzione Verifica Offline</span>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={useMockDemo}
                      disabled={busy || !prototypeType}
                      onChange={(e) => setUseMockDemo(e.target.checked)}
                    />
                    <span>Usa le sagome dell’esempio caricato</span>
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
                      Usa la chiave configurata sul server oppure inserisci una
                      chiave per questa sessione. Non viene salvata nel browser.
                      Il piano e le quote dipendono dal tuo progetto Google AI
                      Studio.
                    </p>
                    <input
                      type="password"
                      aria-label="Chiave Google per questa sessione"
                      autoComplete="off"
                      placeholder="Chiave API Google"
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
                    <strong>Consenso Google AI Free Tier:</strong> accetto
                    l'invio dell’immagine a Google per l’analisi, secondo i
                    termini e le quote del mio account. Nel piano gratuito i
                    dati possono essere usati da Google per migliorare i propri
                    prodotti.
                  </span>
                </span>
              </label>

              <div className="note">
                <strong>Controlla le selezioni prima di applicarle.</strong> I
                pixel non riconosciuti restano in “Da assegnare”. L’originale
                viene conservato nascosto. Le risposte di esempio funzionano
                solo sulle figure geometriche caricate qui.
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

      {selectedMode === 'semantic' && !classicResult && (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={refineManually}
        >
          Seleziona le parti a mano
        </button>
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
          disabled={
            busy || (selectedMode === 'semantic' && !consent && !useMockDemo)
          }
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
