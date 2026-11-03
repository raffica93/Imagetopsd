/** @license SPDX-License-Identifier: Apache-2.0 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Eye,
  EyeOff,
  MousePointer2,
  WandSparkles,
  LassoSelect,
  Paintbrush,
  Hand,
  Undo2,
  Redo2,
  Minus,
  Plus,
  Maximize,
  Check,
  RotateCcw,
  X,
} from 'lucide-react';
import type { LayerItem } from '../types';
import type {
  SemanticLabel,
  SemanticRefinementMask,
  SelectionPoint,
} from '../utils/semanticSegmentation';
import {
  SEMANTIC_HIERARCHY,
  EMPTY_PIXEL,
  UNASSIGNED,
  ownersFromMasks,
  masksFromOwners,
  paintOwners,
  selectConnectedRegion,
  selectionPolygon,
  assignSelection,
  buildProjectLayersFromMasks,
} from '../utils/semanticSegmentation';
import { context } from '../utils/canvasHelpers';

type Tool = 'pick' | 'region' | 'lasso' | 'brush' | 'pan';
type History = {
  past: Uint8Array[];
  present: Uint8Array;
  future: Uint8Array[];
};
type Point = SelectionPoint;
type Gesture = {
  mode: Tool | 'pinch';
  start: Point;
  pan: Point;
  before: Uint8Array;
  last: Point;
  points: Point[];
  distance?: number;
  zoom?: number;
  center?: Point;
  pointer: number;
};
export function SemanticRefinementStudio({
  sourceLayer,
  initialMasks,
  isMock,
  modelUsed,
  warning,
  onApply,
  onBack,
}: {
  sourceLayer: LayerItem;
  initialMasks: SemanticRefinementMask[];
  isMock: boolean;
  modelUsed: string;
  warning?: string;
  onApply: (layers: LayerItem[]) => void;
  onBack: () => void;
}) {
  const width = sourceLayer.canvas.width,
    height = sourceLayer.canvas.height;
  const data = useMemo(
    () => context(sourceLayer.canvas).getImageData(0, 0, width, height).data,
    [sourceLayer.canvas, width, height],
  );
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: ownersFromMasks(initialMasks, data),
    future: [],
  }));
  const state = useRef(history);
  state.current = history;
  const [active, setActive] = useState<SemanticLabel>(
    () =>
      initialMasks.find((m) => m.label === 'Pelle' && m.pixelCount)?.label ??
      initialMasks.find((m) => m.pixelCount && m.label !== 'Tratto')?.label ??
      'Da assegnare',
  );
  const [tool, setTool] = useState<Tool>('pick'),
    [view, setView] = useState<'overlay' | 'solo' | 'composite'>('overlay');
  const [action, setAction] = useState<'add' | 'remove'>('add'),
    [diameter, setDiameter] = useState(24),
    [tolerance, setTolerance] = useState(30);
  const [visible, setVisible] = useState(
    () => new Set(SEMANTIC_HIERARCHY.map((h) => h.label)),
  );
  const [selection, setSelection] = useState<Uint8Array | null>(null),
    [path, setPath] = useState<Point[]>([]);
  const [zoom, setZoom] = useState(0.5),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 }),
    [notice, setNotice] = useState('');
  const viewport = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    paper = useRef<HTMLDivElement>(null);
  const points = useRef(new Map<number, Point>()),
    gesture = useRef<Gesture | null>(null),
    regionSeed = useRef<Point | null>(null),
    zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const counts = useMemo(() => {
    const c = new Uint32Array(SEMANTIC_HIERARCHY.length);
    for (const o of history.present) if (o !== EMPTY_PIXEL) c[o]++;
    return c;
  }, [history.present]);
  const selectionCount = useMemo(
    () => selection?.reduce((n, v) => n + v, 0) ?? 0,
    [selection],
  );
  const target: SemanticLabel = action === 'remove' ? 'Da assegnare' : active;
  function replace(next: History) {
    state.current = next;
    setHistory(next);
  }
  function draft(owners: Uint8Array) {
    replace({ ...state.current, present: owners });
  }
  function commit(owners: Uint8Array, before = state.current.present) {
    if (owners.every((v, i) => v === before[i])) return;
    const max = Math.min(
      15,
      Math.max(1, Math.floor(24_000_000 / owners.length) - 1),
    );
    replace({
      past: [...state.current.past, before].slice(-max),
      present: owners,
      future: [],
    });
  }
  function undo() {
    const s = state.current,
      p = s.past.at(-1);
    if (p)
      replace({
        past: s.past.slice(0, -1),
        present: p,
        future: [s.present, ...s.future],
      });
    setSelection(null);
  }
  function redo() {
    const s = state.current,
      n = s.future[0];
    if (n)
      replace({
        past: [...s.past, s.present],
        present: n,
        future: s.future.slice(1),
      });
    setSelection(null);
  }
  function fit() {
    const el = viewport.current;
    if (!el) return;
    setZoom(
      Math.max(
        0.03,
        Math.min(
          (el.clientWidth - 32) / width,
          (el.clientHeight - 32) / height,
          8,
        ),
      ),
    );
    setPan({ x: 0, y: 0 });
  }
  useLayoutEffect(() => {
    fit();
    const observer = new ResizeObserver(fit);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [width, height]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = context(c),
      image = ctx.createImageData(width, height),
      out = image.data;
    const activeIndex = SEMANTIC_HIERARCHY.findIndex((h) => h.label === active),
      hex = SEMANTIC_HIERARCHY[activeIndex].colorHex;
    const tint = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    for (let i = 0; i < history.present.length; i++) {
      const owner = history.present[i],
        p = i * 4;
      if (owner === EMPTY_PIXEL) continue;
      const enabled = visible.has(SEMANTIC_HIERARCHY[owner].label);
      if (
        !selection?.[i] &&
        ((view === 'solo' && (owner !== activeIndex || !enabled)) ||
          (view === 'composite' && !enabled))
      )
        continue;
      out.set(data.subarray(p, p + 4), p);
      if (view === 'overlay' && owner === activeIndex && enabled) {
        for (let ch = 0; ch < 3; ch++)
          out[p + ch] = Math.round(data[p + ch] * 0.6 + tint[ch] * 0.4);
      }
      if (selection?.[i]) {
        out[p] = Math.round(out[p] * 0.35 + 255 * 0.65);
        out[p + 1] = Math.round(out[p + 1] * 0.35 + 213 * 0.65);
        out[p + 2] = Math.round(out[p + 2] * 0.35 + 85 * 0.65);
        out[p + 3] = data[p + 3];
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [history.present, active, view, visible, selection, data, width, height]);
  function imagePoint(point: Point) {
    const r = paper.current!.getBoundingClientRect();
    return {
      x: (point.x - r.left) / zoomRef.current,
      y: (point.y - r.top) / zoomRef.current,
    };
  }
  function inside(p: Point) {
    return p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  }
  function selectLabel(label: SemanticLabel) {
    setActive(label);
    setVisible((v) => new Set([...v, label]));
  }
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const client = { x: e.clientX, y: e.clientY };
    points.current.set(e.pointerId, client);
    if (points.current.size === 2) {
      const old = gesture.current;
      if (old?.mode === 'brush') draft(old.before);
      setPath([]);
      const [a, b] = [...points.current.values()];
      gesture.current = {
        mode: 'pinch',
        start: client,
        last: client,
        points: [],
        pan,
        before: state.current.present,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: zoomRef.current,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        pointer: e.pointerId,
      };
      return;
    }
    if (points.current.size !== 1) return;
    const p = imagePoint(client);
    const g: Gesture = {
      mode: tool,
      start: client,
      last: p,
      points: [p],
      pan,
      before: state.current.present,
      pointer: e.pointerId,
    };
    gesture.current = g;
    if (tool === 'pan' || view === 'composite') {
      g.mode = 'pan';
      return;
    }
    if (!inside(p)) {
      gesture.current = null;
      return;
    }
    if (tool === 'lasso') {
      setPath([p]);
      return;
    }
    if (tool === 'brush') {
      setSelection(null);
      draft(
        paintOwners(
          state.current.present,
          data,
          width,
          height,
          p,
          p,
          diameter / 2 / zoomRef.current,
          target,
        ),
      );
    }
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!points.current.has(e.pointerId)) return;
    const client = { x: e.clientX, y: e.clientY };
    points.current.set(e.pointerId, client);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'pinch') {
      if (points.current.size < 2) return;
      const [a, b] = [...points.current.values()],
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = Math.max(
        0.03,
        Math.min(
          8,
          (g.zoom! * Math.hypot(a.x - b.x, a.y - b.y)) /
            Math.max(1, g.distance!),
        ),
      );
      const r = viewport.current!.getBoundingClientRect(),
        origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        ratio = next / g.zoom!;
      setZoom(next);
      setPan({
        x: center.x - origin.x - (g.center!.x - origin.x - g.pan.x) * ratio,
        y: center.y - origin.y - (g.center!.y - origin.y - g.pan.y) * ratio,
      });
      return;
    }
    if (g.mode === 'pan') {
      setPan({
        x: g.pan.x + client.x - g.start.x,
        y: g.pan.y + client.y - g.start.y,
      });
      return;
    }
    const p = imagePoint(client);
    if (
      g.mode === 'lasso' &&
      Math.hypot(p.x - g.last.x, p.y - g.last.y) * zoomRef.current > 2
    ) {
      g.points.push(p);
      setPath([...g.points]);
    }
    if (g.mode === 'brush')
      draft(
        paintOwners(
          state.current.present,
          data,
          width,
          height,
          g.last,
          p,
          diameter / 2 / zoomRef.current,
          target,
        ),
      );
    g.last = p;
  }
  function end(e: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    if (!points.current.has(e.pointerId)) return;
    points.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    if (g) {
      const p = imagePoint({ x: e.clientX, y: e.clientY });
      if (g.mode === 'brush') {
        if (cancelled) draft(g.before);
        else commit(state.current.present, g.before);
      } else if (!cancelled && g.mode === 'lasso' && g.points.length >= 3) {
        setSelection(selectionPolygon(g.points, width, height));
        regionSeed.current = null;
      } else if (
        !cancelled &&
        g.mode === 'region' &&
        inside(p) &&
        Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 12
      ) {
        regionSeed.current = p;
        setSelection(selectConnectedRegion(data, width, height, p, tolerance));
      } else if (
        !cancelled &&
        g.mode === 'pick' &&
        inside(p) &&
        Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 12
      ) {
        const index =
          state.current.present[Math.floor(p.y) * width + Math.floor(p.x)];
        if (index !== EMPTY_PIXEL) selectLabel(SEMANTIC_HIERARCHY[index].label);
      }
    }
    setPath([]);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function assign() {
    if (!selection) return;
    commit(assignSelection(state.current.present, selection, data, target));
    setSelection(null);
    regionSeed.current = null;
    setNotice(`Zona assegnata a ${target}.`);
  }
  const tools: { id: Tool; label: string; icon: typeof Hand }[] = [
    { id: 'pick', label: 'Seleziona parte', icon: MousePointer2 },
    { id: 'region', label: 'Zona', icon: WandSparkles },
    { id: 'lasso', label: 'Lazo', icon: LassoSelect },
    { id: 'brush', label: 'Pennello', icon: Paintbrush },
    { id: 'pan', label: 'Naviga', icon: Hand },
  ];
  const hint =
    tool === 'pick'
      ? 'Tocca l’immagine per selezionare la parte presente in quel punto.'
      : tool === 'region'
        ? 'Tocca una zona di colore simile, controlla l’evidenziazione gialla e poi assegnala alla parte scelta.'
        : tool === 'lasso'
          ? 'Disegna un contorno intorno alla zona. Controlla la selezione e assegnala alla parte scelta.'
          : tool === 'brush'
            ? 'Dipingi sulla parte scelta. Togli sposta i pixel in “Da assegnare”, senza cancellarli.'
            : 'Trascina per navigare. Usa due dita per ingrandire senza dipingere.';
  return (
    <div className="semantic-studio precision-studio">
      <div className="studio-topbar">
        <div>
          <strong>
            {isMock
              ? 'Esempio geometrico · nessuna analisi AI'
              : modelUsed === 'Livelli esistenti'
                ? 'Rifinisci le selezioni esistenti'
                : `Contorni da verificare · ${modelUsed}`}
          </strong>
          <p>
            {counts[UNASSIGNED].toLocaleString('it-IT')} pixel da assegnare.
            Controlla anche le parti già riconosciute.
            {warning && <span role="status"> {warning}</span>}
          </p>
        </div>
        <div className="history-group">
          <button
            type="button"
            className="icon-button"
            aria-label="Annulla correzione"
            disabled={!history.past.length}
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Ripristina correzione"
            disabled={!history.future.length}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
        </div>
      </div>
      <div className="precision-main">
        <aside className="precision-parts" aria-label="Parti del personaggio">
          <p>Scegli la parte a cui assegnare i pixel</p>
          <div className="precision-part-list">
            {SEMANTIC_HIERARCHY.map((h, i) => (
              <div
                key={h.label}
                className={`precision-part ${active === h.label ? 'selected' : ''}`}
              >
                <button
                  className="precision-part-pick"
                  type="button"
                  aria-label={`Seleziona parte ${h.label}`}
                  aria-pressed={active === h.label}
                  onClick={() => selectLabel(h.label)}
                >
                  <i style={{ background: h.colorHex }} />
                  <span>
                    <strong>{h.label}</strong>
                    <small>
                      {counts[i].toLocaleString('it-IT')} px
                      {!counts[i] ? ' · vuoto' : ''}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`${visible.has(h.label) ? 'Nascondi' : 'Mostra'} parte ${h.label}`}
                  onClick={() =>
                    setVisible((v) => {
                      const n = new Set(v);
                      if (n.has(h.label)) n.delete(h.label);
                      else n.add(h.label);
                      return n;
                    })
                  }
                >
                  {visible.has(h.label) ? (
                    <Eye size={16} />
                  ) : (
                    <EyeOff size={16} />
                  )}
                </button>
              </div>
            ))}
          </div>
          <p className="precision-original">
            Originale intatto conservato nel progetto.
          </p>
        </aside>
        <div className="precision-work">
          <div
            className="precision-tools"
            role="group"
            aria-label="Strumenti di selezione"
          >
            {tools.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`tool-chip ${tool === id ? 'active' : ''}`}
                aria-pressed={tool === id}
                onClick={() => {
                  setTool(id);
                  if (id !== 'pan' && view === 'composite') setView('overlay');
                  setPath([]);
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          <div className="precision-options">
            <div className="view-mode-toggle">
              {[
                { id: 'overlay', label: 'Selezione' },
                { id: 'solo', label: 'Isola parte' },
                { id: 'composite', label: 'Risultato' },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`tab-btn ${view === v.id ? 'active' : ''}`}
                  aria-pressed={view === v.id}
                  onClick={() => setView(v.id as typeof view)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {['region', 'lasso', 'brush'].includes(tool) && (
              <div className="precision-action">
                <button
                  type="button"
                  className={`tab-btn ${action === 'add' ? 'active' : ''}`}
                  aria-pressed={action === 'add'}
                  onClick={() => setAction('add')}
                >
                  Aggiungi
                </button>
                <button
                  type="button"
                  className={`tab-btn ${action === 'remove' ? 'active' : ''}`}
                  aria-pressed={action === 'remove'}
                  onClick={() => setAction('remove')}
                >
                  Togli
                </button>
              </div>
            )}
          </div>
          {tool === 'region' && (
            <label className="precision-slider">
              Tolleranza zona <output>{tolerance}</output>
              <input
                aria-label="Tolleranza zona"
                type="range"
                min="5"
                max="100"
                value={tolerance}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setTolerance(n);
                  if (regionSeed.current)
                    setSelection(
                      selectConnectedRegion(
                        data,
                        width,
                        height,
                        regionSeed.current,
                        n,
                      ),
                    );
                }}
              />
            </label>
          )}
          {tool === 'brush' && (
            <label className="precision-slider">
              Diametro sullo schermo <output>{diameter} px</output>
              <input
                aria-label="Diametro pennello"
                type="range"
                min="4"
                max="80"
                value={diameter}
                onChange={(e) => setDiameter(Number(e.target.value))}
              />
            </label>
          )}
          <div
            className={`precision-viewport checker tool-${tool}`}
            ref={viewport}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(e) => end(e)}
            onPointerCancel={(e) => end(e, true)}
            onLostPointerCapture={(e) => {
              if (points.current.has(e.pointerId)) end(e, true);
            }}
          >
            <div
              ref={paper}
              className="precision-paper"
              style={{
                width,
                height,
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <canvas
                ref={canvas}
                width={width}
                height={height}
                aria-label="Immagine per rifinire le selezioni"
              />
              <svg width={width} height={height}>
                <polyline
                  points={path.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(255,213,85,.15)"
                  stroke="#f5b800"
                  strokeWidth={2 / zoom}
                />
              </svg>
            </div>
          </div>
          <div className="precision-bottom">
            <span>
              Parte attiva: <strong>{active}</strong>
            </span>
            <div className="zoom-controls">
              <button
                type="button"
                className="icon-button"
                aria-label="Riduci zoom selezione"
                onClick={() => setZoom((z) => Math.max(0.03, z / 1.4))}
              >
                <Minus size={17} />
              </button>
              <output>{Math.round(zoom * 100)}%</output>
              <button
                type="button"
                className="icon-button"
                aria-label="Aumenta zoom selezione"
                onClick={() => setZoom((z) => Math.min(8, z * 1.4))}
              >
                <Plus size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Adatta immagine selezione"
                onClick={fit}
              >
                <Maximize size={17} />
              </button>
            </div>
          </div>
          {selection && (
            <div className="precision-pending" role="status">
              <span>
                {selectionCount.toLocaleString('it-IT')} pixel selezionati
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={!selectionCount}
                onClick={assign}
              >
                Assegna a {target}
                <Check size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Svuota selezione"
                onClick={() => {
                  setSelection(null);
                  regionSeed.current = null;
                }}
              >
                <X size={17} />
              </button>
            </div>
          )}
          <p className="precision-hint">{hint}</p>
        </div>
      </div>
      {notice && (
        <p className="success-text" role="status">
          {notice}
        </p>
      )}
      <div className="modal-footer studio-footer">
        <button type="button" className="button secondary" onClick={onBack}>
          <RotateCcw size={17} />
          Opzioni analisi
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() =>
            onApply(
              buildProjectLayersFromMasks(
                sourceLayer,
                masksFromOwners(state.current.present),
              ),
            )
          }
        >
          Applica selezioni
          <Check size={18} />
        </button>
      </div>
    </div>
  );
}
