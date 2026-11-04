/** @license SPDX-License-Identifier: Apache-2.0 */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import type { LayerItem } from '../types';
import type {
  SemanticInventory,
  SemanticPart,
  DynamicPartId,
} from '../utils/semanticProtocol';
import {
  validateSemanticInventory,
  validateSemanticParts,
  MAX_DETECTED_PARTS,
} from '../utils/semanticProtocol';
import { createCanvas, context } from '../utils/canvasHelpers';
import {
  decodeSemanticParts,
  definitionsFromInventory,
  initializeSemanticRefinementMasks,
  mapPartsFromCrop,
  partCropBounds,
} from '../utils/semanticSegmentation';
import type { SemanticRefinementMask } from '../utils/semanticSegmentation';

export interface DiscoveredSelection {
  masks: SemanticRefinementMask[];
  isMock: boolean;
  modelUsed: string;
  warning?: string;
  inventory?: SemanticInventory;
}
class AnalysisError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export function SemanticDiscovery({
  layer,
  onReady,
  onBusyChange,
  onInventoryChange,
}: {
  layer: LayerItem;
  onReady: (selection: DiscoveredSelection) => void;
  onBusyChange: (busy: boolean) => void;
  onInventoryChange?: (hasInventory: boolean) => void;
}) {
  const model = 'gemini-3.8-flash';
  const consent = true;
  const [inventory, setInventory] = useState<SemanticInventory | null>(
      layer.semanticInventory ?? null,
    ),
    [chosen, setChosen] = useState(
      new Set<DynamicPartId>(layer.semanticInventory?.parts.map((p) => p.id)),
    );
  const [completed, setCompleted] = useState<Record<string, SemanticPart[]>>(
      {},
    ),
    [failures, setFailures] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [error, setError] = useState('');
  const [modelUsed, setModelUsed] = useState(''),
    [discarded, setDiscarded] = useState(0);
  const request = useRef<AbortController | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    onInventoryChange?.(inventory !== null);
  }, [inventory, onInventoryChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  function working(value: boolean) {
    setBusy(value);
    onBusyChange(value);
  }
  async function call(body: Record<string, unknown>, signal: AbortSignal) {
    const response = await fetch('/api/segment-semantic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        ...body,
        modelId: 'gemini-3.8-flash',
        consent: true,
      }),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new AnalysisError(
        'Il server non ha risposto correttamente. Le selezioni già completate restano disponibili.',
        response.status,
      );
    }
    if (!response.ok)
      throw new AnalysisError(
        data.error || 'Analisi non riuscita.',
        response.status,
      );
    if (data.isMock !== false)
      throw new Error(
        'L’analisi della foto non può usare sagome dimostrative.',
      );
    return data;
  }
  async function identify() {
    setError('');
    working(true);
    setProgress('1 di 2 · Riconosco le parti e il loro ordine…');
    const controller = new AbortController();
    request.current = controller;
    try {
      const data = await call(
        { stage: 'identify', image: layer.canvas.toDataURL('image/png') },
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      const found = validateSemanticInventory(data.inventory);
      setInventory(found);
      setChosen(new Set(found.parts.map((p) => p.id)));
      setCompleted({});
      setFailures({});
      setDiscarded(0);
      setModelUsed(data.modelUsed || model);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'Riconoscimento non riuscito.',
        );
    } finally {
      if (mounted.current) {
        working(false);
        setProgress('');
      }
    }
  }
  function selectedInventory() {
    if (!inventory) return undefined;
    return validateSemanticInventory({
      ...inventory,
      parts: inventory.parts.filter((p) => chosen.has(p.id)),
    });
  }
  function openRefinement(
    results = completed,
    plan = selectedInventory(),
    actualModel = modelUsed,
    skipped = discarded,
  ) {
    const c = layer.canvas,
      parts = Object.values(results).flat();
    const masks = initializeSemanticRefinementMasks(
      context(c).getImageData(0, 0, c.width, c.height).data,
      c.width,
      c.height,
      parts,
      plan ? definitionsFromInventory(plan) : undefined,
    );
    const missing =
      plan?.parts
        .filter(
          (p) =>
            !results[p.id] || !masks.find((m) => m.label === p.id)?.pixelCount,
        )
        .map((p) => p.name) ?? [];
    onReady({
      masks,
      isMock: false,
      modelUsed: actualModel || 'Rifinitura manuale',
      inventory: plan,
      warning:
        [
          missing.length ? `Da selezionare a mano: ${missing.join(', ')}.` : '',
          skipped ? `${skipped} contorni non validi scartati.` : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
    });
  }
  async function segment() {
    let plan: SemanticInventory;
    try {
      plan = selectedInventory()!;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Controlla i nomi delle parti.',
      );
      return;
    }
    if (!plan) return;
    setError('');
    working(true);
    const controller = new AbortController();
    request.current = controller;
    const results = { ...completed },
      errors: Record<string, string> = {};
    let skipped = discarded,
      actualModel = modelUsed;
    try {
      for (const [index, part] of plan.parts.entries()) {
        if (results[part.id]) continue;
        if (controller.signal.aborted) break;
        setProgress(
          `2 di 2 · Seleziono ${part.name} (${index + 1}/${plan.parts.length})…`,
        );
        try {
          const crop = partCropBounds(
              part,
              layer.canvas.width,
              layer.canvas.height,
            ),
            image = createCanvas(crop.width, crop.height);
          let png: string;
          try {
            context(image).drawImage(
              layer.canvas,
              crop.left,
              crop.top,
              crop.width,
              crop.height,
              0,
              0,
              crop.width,
              crop.height,
            );
            png = image.toDataURL('image/png');
          } finally {
            image.width = 1;
            image.height = 1;
          }
          const data = await call(
            {
              stage: 'segment-part',
              image: png,
              inventory: plan,
              partId: part.id,
            },
            controller.signal,
          );
          const regions = await decodeSemanticParts(
            validateSemanticParts(data.parts, data.maskFormat !== 'polygons', [
              part.id,
            ]),
            crop.width,
            crop.height,
          );
          if (!mounted.current || controller.signal.aborted) break;
          results[part.id] = mapPartsFromCrop(
            regions,
            crop,
            layer.canvas.width,
            layer.canvas.height,
          );
          actualModel = data.modelUsed || actualModel;
          skipped += Number.isInteger(data.discardedParts)
            ? data.discardedParts
            : 0;
          setCompleted({ ...results });
          setModelUsed(actualModel);
          setDiscarded(skipped);
        } catch (e) {
          if (controller.signal.aborted) break;
          const message =
            e instanceof Error ? e.message : 'Selezione non riuscita.';
          errors[part.id] = message;
          setFailures({ ...errors });
          // A quota or transport failure can affect every remaining request: pause without a burst of retries.
          if (
            e instanceof TypeError ||
            (e instanceof AnalysisError &&
              [429, 503, 504, 400, 413].includes(e.status))
          ) {
            setError(message);
            break;
          }
        }
      }
      if (!mounted.current) return;
      const pending = plan.parts.filter((p) => !results[p.id]);
      if (!pending.length) openRefinement(results, plan, actualModel, skipped);
      else {
        setFailures(
          Object.fromEntries(
            pending.map((p) => [p.id, errors[p.id] ?? 'Da selezionare']),
          ),
        );
        if (controller.signal.aborted)
          setError(
            'Selezione interrotta. Puoi riprendere dalle parti mancanti o rifinire quelle già pronte.',
          );
        else
          setError(
            `Alcune parti restano da selezionare. I risultati completati sono conservati. ${Object.values(errors)[0] ?? ''}`,
          );
      }
    } finally {
      if (mounted.current) {
        working(false);
        setProgress('');
      }
    }
  }
  function move(id: DynamicPartId, delta: number) {
    setInventory((plan) => {
      if (!plan) return plan;
      const parts = [...plan.parts],
        i = parts.findIndex((p) => p.id === id),
        next = i + delta;
      if (next < 0 || next >= parts.length) return plan;
      [parts[i], parts[next]] = [parts[next], parts[i]];
      return { ...plan, parts };
    });
  }
  function addPart() {
    if (!inventory || inventory.parts.length >= MAX_DETECTED_PARTS) return;
    const used = new Set(inventory.parts.map((p) => p.id));
    const number = Array.from(
      { length: MAX_DETECTED_PARTS },
      (_, i) => i + 1,
    ).find((i) => !used.has(`part:${i}`))!;
    const id: DynamicPartId = `part:${number}`;
    setInventory({
      ...inventory,
      parts: [
        ...inventory.parts,
        {
          id,
          name: `Nuova parte ${number}`,
          description: 'Parte aggiunta dall’utente. Identificala dal suo nome.',
          box_2d: [0, 0, 1000, 1000],
        },
      ],
    });
    setChosen((old) => new Set([...old, id]));
  }
  const ready =
      inventory?.parts.filter((p) => chosen.has(p.id) && completed[p.id])
        .length ?? 0,
    selectedCount = chosen.size;
  const providerSettings = (
    <div className="discovery-integrated-model-card" role="status">
      <div className="integrated-model-header">
        <span className="integrated-badge">AI Studio Integrato · Gratuito</span>
        <span className="model-name">Gemini 3.8 Flash</span>
      </div>
      <p className="integrated-model-desc">
        Identificazione anatomica e creazione livelli gestita con il modello gratuito multimodale integrato in Google AI Studio. Nessuna chiave o costo richiesto.
      </p>
    </div>
  );
  return (
    <div className="semantic-discovery">
      <div className="discovery-steps" aria-label="Fasi della separazione">
        <span className={!inventory ? 'current' : ''}>
          1 · Riconosci le parti
        </span>
        <span className={inventory ? 'current' : ''}>
          2 · Seleziona e ordina
        </span>
      </div>
      {!inventory ? (
        <>
          <p className="note">
            L’app riconosce le parti presenti nel soggetto, come elmo, armatura
            superiore, armatura inferiore o spada. Potrai controllare l’elenco
            prima della selezione.
          </p>
          {providerSettings}
        </>
      ) : (
        <>
          <div className="discovery-heading">
            <div>
              <h3>{inventory.subject}</h3>
              <p>
                {inventory.parts.length} parti nell’elenco · {ready} selezioni
                pronte
              </p>
            </div>
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => {
                setInventory(null);
                setCompleted({});
                setFailures({});
                setChosen(new Set());
                setDiscarded(0);
                setModelUsed('');
                setError('');
              }}
            >
              Riconosci di nuovo
            </button>
          </div>
          <p className="subtle">
            Ordine dall’alto verso il basso nel PSD. Puoi rinominare, escludere
            o spostare le parti. Tratto, sfondo e pixel da assegnare sono
            gestiti a parte.
          </p>
          <ol
            className="discovered-parts"
            aria-label="Parti riconosciute, dalla prima all’ultima"
          >
            {inventory.parts.map((part, index) => (
              <li key={part.id} data-part-id={part.id}>
                <label className="discovered-check">
                  <input
                    type="checkbox"
                    aria-label={`Includi ${part.name}`}
                    checked={chosen.has(part.id)}
                    disabled={busy}
                    onChange={() =>
                      setChosen((old) => {
                        const next = new Set(old);
                        if (next.has(part.id)) next.delete(part.id);
                        else next.add(part.id);
                        return next;
                      })
                    }
                  />
                </label>
                <div className="discovered-description">
                  <input
                    aria-label={`Nome parte ${index + 1}`}
                    maxLength={64}
                    value={part.name}
                    disabled={busy}
                    onChange={(e) => {
                      const name = e.target.value;
                      setInventory((plan) =>
                        plan
                          ? {
                              ...plan,
                              parts: plan.parts.map((p) =>
                                p.id === part.id ? { ...p, name } : p,
                              ),
                            }
                          : plan,
                      );
                    }}
                  />
                  <small>
                    {completed[part.id]
                      ? 'Selezione pronta'
                      : failures[part.id]
                        ? 'Da riprovare'
                        : part.description}
                  </small>
                </div>
                <div className="discovered-order">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Sposta sopra ${part.name}`}
                    disabled={busy || index === 0}
                    onClick={() => move(part.id, -1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Sposta sotto ${part.name}`}
                    disabled={busy || index === inventory.parts.length - 1}
                    onClick={() => move(part.id, 1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="link-button"
            disabled={busy || inventory.parts.length >= MAX_DETECTED_PARTS}
            onClick={addPart}
          >
            Aggiungi una parte mancante
          </button>
          <p className="note-text">
            La selezione analizza una parte alla volta con un ritaglio dedicato.
            Più parti richiedono più tempo e quota Google. Gli errori si possono
            riprovare senza rifare le selezioni già pronte.
          </p>
        </>
      )}
      {inventory && (
        <div className="discovery-provider-section">
          {providerSettings}
        </div>
      )}
      <div className="consent-box active">
        <span className="consent-text">
          <ShieldCheck size={16} />
          <span>
            {inventory
              ? 'Invio dei ritagli a Gemini 3.8 Flash (piano gratuito integrato in AI Studio).'
              : 'Analisi ed estrazione con Gemini 3.8 Flash (piano gratuito integrato in AI Studio).'}
          </span>
        </span>
      </div>
      {progress && (
        <p className="discovery-progress" role="status">
          <LoaderCircle size={18} className="spin" />
          {progress}
        </p>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <div className="discovery-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy || (!!inventory && !selectedCount)}
          onClick={() => {
            try {
              openRefinement();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : 'Controlla l’elenco delle parti.',
              );
            }
          }}
        >
          {ready
            ? 'Rifinisci le selezioni pronte'
            : 'Seleziona le parti a mano'}
        </button>
        {busy ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => request.current?.abort()}
          >
            Interrompi analisi
          </button>
        ) : (
          <button
            type="button"
            className="button primary"
            disabled={!consent || (!!inventory && !selectedCount)}
            onClick={() => void (inventory ? segment() : identify())}
          >
            <Sparkles size={18} />
            {inventory
              ? ready
                ? 'Riprendi le parti mancanti'
                : `Seleziona ${selectedCount} parti`
              : 'Identifica le parti'}
          </button>
        )}
      </div>
    </div>
  );
}
