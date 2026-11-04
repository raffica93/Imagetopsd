/** @license SPDX-License-Identifier: Apache-2.0 */
import { useEffect, useRef, useState } from 'react';
import { Check, Layers, LoaderCircle, Sparkles } from 'lucide-react';
import type { LayerItem } from '../types';
import type {
  SemanticInventory,
  SemanticPart,
} from '../utils/semanticProtocol';
import {
  validateSemanticInventory,
  validateSemanticParts,
} from '../utils/semanticProtocol';
import { COMPLEXITY_PROFILES } from '../utils/aiConfig';
import type { AnalysisComplexity } from '../utils/aiConfig';
import { createCanvas, context } from '../utils/canvasHelpers';
import {
  decodeSemanticParts,
  definitionsFromInventory,
  initializeSemanticRefinementMasks,
  mapPartsFromCrop,
  partCropBounds,
} from '../utils/semanticSegmentation';
import type { SemanticRefinementMask } from '../utils/semanticSegmentation';
import { useAISettings } from './AISettings';

export interface DiscoveredSelection {
  masks: SemanticRefinementMask[];
  inventory: SemanticInventory;
  warning?: string;
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
  onSettings,
  disabled = false,
}: {
  layer: LayerItem;
  onReady: (selection: DiscoveredSelection) => void;
  onBusyChange: (busy: boolean) => void;
  onSettings: () => void;
  disabled?: boolean;
}) {
  const ai = useAISettings();
  const [busy, setBusy] = useState(false);
  const [complexity, setComplexity] = useState<AnalysisComplexity>('balanced');
  const [inventory, setInventory] = useState<SemanticInventory | null>(null);
  const [completed, setCompleted] = useState<Record<string, SemanticPart[]>>(
    {},
  );
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [discarded, setDiscarded] = useState(0);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  async function call(body: Record<string, unknown>, signal: AbortSignal) {
    const response = await fetch('/api/segment-semantic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        ...body,
        consent: true,
        ...(ai.sessionKey ? { userApiKey: ai.sessionKey } : {}),
      }),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new AnalysisError(
        'Il servizio non ha risposto correttamente. Riprova tra poco.',
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
        'Il servizio non ha restituito un’analisi della tua immagine.',
      );
    return data;
  }
  async function run(profile: AnalysisComplexity, resume = false) {
    if (request.current || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setComplexity(profile);
    let plan = resume ? inventory : null;
    const results = resume ? { ...completed } : {};
    let skipped = resume ? discarded : 0;
    if (!resume) {
      setInventory(null);
      setCompleted({});
      setDiscarded(0);
    }
    try {
      if (!plan) {
        setProgress('1 di 2 · Riconosco le parti e il loro ordine…');
        const data = await call(
          {
            stage: 'identify',
            complexity: profile,
            image: layer.canvas.toDataURL('image/png'),
          },
          controller.signal,
        );
        if (!mounted.current) return;
        if (controller.signal.aborted) throw new Error('aborted');
        plan = validateSemanticInventory({
          ...data.inventory,
          complexity: profile,
        });
        setInventory(plan);
      }
      const failures: string[] = [];
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
          );
          const image = createCanvas(crop.width, crop.height);
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
          const regions =
            Array.isArray(data.parts) && data.parts.length === 0
              ? []
              : await decodeSemanticParts(
                  validateSemanticParts(
                    data.parts,
                    data.maskFormat !== 'polygons',
                    [part.id],
                  ),
                  crop.width,
                  crop.height,
                );
          if (!mounted.current) return;
          if (controller.signal.aborted) break;
          results[part.id] = mapPartsFromCrop(
            regions,
            crop,
            layer.canvas.width,
            layer.canvas.height,
          );
          skipped += Number.isInteger(data.discardedParts)
            ? data.discardedParts
            : 0;
          setDiscarded(skipped);
          setCompleted({ ...results });
        } catch (e) {
          if (controller.signal.aborted) break;
          failures.push(
            e instanceof Error ? e.message : 'Selezione non riuscita.',
          );
          if (
            e instanceof TypeError ||
            (e instanceof AnalysisError &&
              [400, 413, 429, 503, 504].includes(e.status))
          )
            break;
        }
      }
      if (!mounted.current) return;
      if (controller.signal.aborted) {
        setError(
          'Analisi interrotta. Puoi riprendere dalle parti già completate.',
        );
        return;
      }
      const pending = plan.parts.filter((part) => !results[part.id]);
      if (pending.length) {
        setError(
          `${failures[0] || 'Alcune parti non sono state selezionate.'} Le selezioni completate sono conservate: riprendi per terminare.`,
        );
        return;
      }
      setProgress('Organizzo i livelli, separo tratto e sfondo…');
      const c = layer.canvas;
      const masks = initializeSemanticRefinementMasks(
        context(c).getImageData(0, 0, c.width, c.height).data,
        c.width,
        c.height,
        Object.values(results).flat(),
        definitionsFromInventory(plan),
      );
      const useful = masks.filter(
        (mask) => mask.label.startsWith('part:') && mask.pixelCount > 0,
      );
      if (!useful.length) {
        setCompleted({});
        throw new Error(
          'Il modello non ha selezionato parti utilizzabili. Scegli un’altra complessità o riprova.',
        );
      }
      const empty = plan.parts.filter(
        (part) => !useful.some((mask) => mask.label === part.id),
      );
      onReady({
        masks,
        inventory: plan,
        warning:
          [
            empty.length
              ? `Nessun pixel assegnato a: ${empty.map((part) => part.name).join(', ')}.`
              : '',
            skipped ? `${skipped} contorni non validi scartati.` : '',
            empty.length || skipped
              ? 'I pixel restanti sono conservati in “Da assegnare”.'
              : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined,
      });
    } catch (e) {
      if (mounted.current)
        setError(
          controller.signal.aborted
            ? 'Analisi interrotta. Puoi riprovare.'
            : e instanceof Error
              ? e.message
              : 'Analisi non riuscita. Riprova.',
        );
    } finally {
      request.current = null;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
        setProgress('');
      }
    }
  }
  const configured = ai.hasServerKey || !!ai.sessionKey;
  return (
    <section className="auto-analysis">
      <p className="modal-intro">
        Quanto vuoi dividere l’immagine? Tocca una complessità: riconosco le
        parti, le seleziono e creo i livelli nell’ordine corretto.
      </p>
      <div className="complexity-grid" aria-label="Complessità dell’analisi">
        {(
          Object.entries(COMPLEXITY_PROFILES) as [
            AnalysisComplexity,
            (typeof COMPLEXITY_PROFILES)[AnalysisComplexity],
          ][]
        ).map(([value, profile], index) => (
          <button
            key={value}
            className={`complexity-card ${value === 'balanced' ? 'recommended' : ''}`}
            disabled={busy || disabled || ai.loading || !configured}
            onClick={() => void run(value)}
            aria-label={`Avvia analisi ${profile.name}`}
          >
            <span className="complexity-icon">
              <Layers size={21} />
              <span>{index + 1}</span>
            </span>
            <strong>{profile.name}</strong>
            <span>{profile.hint}</span>
            <small>{profile.example}</small>
            <span className="complexity-start">
              <Sparkles size={15} />
              {value === 'balanced' ? 'Consigliata · Avvia' : 'Avvia'}
            </span>
          </button>
        ))}
      </div>
      <p className="auto-defaults">
        <Check size={17} />
        Tratto e sfondo automatici
      </p>
      {!configured && !ai.loading && (
        <div className="note">
          {ai.error || 'Aggiungi una chiave Google per avviare l’analisi.'}{' '}
          <button className="link-button" onClick={onSettings}>
            Apri impostazioni AI
          </button>
        </div>
      )}
      {busy && (
        <div className="auto-progress" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={23} />
          <div>
            <strong>{progress}</strong>
            <p>
              {inventory
                ? `${Object.keys(completed).length} di ${inventory.parts.length} parti selezionate`
                : 'Analizzo il soggetto della tua immagine.'}
            </p>
          </div>
          <progress
            aria-label="Avanzamento analisi"
            max={inventory ? inventory.parts.length + 1 : 1}
            value={inventory ? Object.keys(completed).length + 1 : 0}
          />
          <button
            className="button secondary"
            onClick={() => request.current?.abort()}
          >
            Interrompi analisi
          </button>
        </div>
      )}
      {error && !busy && (
        <div className="auto-error">
          <p className="error-message" role="alert">
            {error}
          </p>
          <button
            className="button primary"
            onClick={() => void run(complexity, !!inventory)}
          >
            Riprendi analisi
          </button>
        </div>
      )}
      <p className="note-text auto-provider">
        Scegliendo una complessità invii l’immagine a Google Gemini. I contorni
        AI sono approssimativi; l’originale e tutti i pixel restano conservati.{' '}
        <button
          className="link-button"
          disabled={busy || disabled}
          onClick={onSettings}
        >
          Impostazioni AI
        </button>
      </p>
    </section>
  );
}
