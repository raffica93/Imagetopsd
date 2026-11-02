import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Minus, Plus, Maximize, Hand, Move, Scissors } from 'lucide-react';
import type { LayerItem, Project, Tool } from '../types';
import { drawProject, context } from '../utils/canvasHelpers';

type Point = { x: number; y: number };
interface Gesture {
  mode: 'move' | 'pan' | 'cut' | 'pinch';
  start: Point;
  pan: Point;
  layer?: LayerItem;
  position?: Point;
  distance?: number;
  zoom?: number;
  center?: Point;
}
export function Workspace({
  project,
  tool,
  onTool,
  onSelect,
  onMove,
  onCut,
}: {
  project: Project;
  tool: Tool;
  onTool: (t: Tool) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: Point) => void;
  onCut: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    paper = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [selection, setSelection] = useState<{
    start: Point;
    end: Point;
  } | null>(null);
  const points = useRef(new Map<number, Point>()),
    gesture = useRef<Gesture | null>(null);
  const zoomRef = useRef(zoom),
    panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;
  const { settings } = project;
  const active = project.layers.find((l) => l.id === project.activeLayerId);
  const movedActive =
    active && drag?.id === active.id ? { ...active, ...drag } : active;

  function fit() {
    const el = viewport.current;
    if (!el) return;
    setZoom(
      Math.max(
        0.05,
        Math.min(
          (el.clientWidth - 64) / settings.width,
          (el.clientHeight - 64) / settings.height,
          1,
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
  }, [settings.width, settings.height]);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const displayed = drag
      ? {
          ...project,
          layers: project.layers.map((l) =>
            l.id === drag.id ? { ...l, ...drag } : l,
          ),
        }
      : project;
    drawProject(target, displayed);
  }, [project, drag]);

  const coords = (p: Point) => {
    const rect = paper.current!.getBoundingClientRect();
    return {
      x: (p.x - rect.left) / zoomRef.current,
      y: (p.y - rect.top) / zoomRef.current,
    };
  };
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    points.current.set(e.pointerId, p);
    if (points.current.size === 2) {
      setDrag(null);
      setSelection(null);
      const [a, b] = [...points.current.values()];
      gesture.current = {
        mode: 'pinch',
        start: p,
        pan: panRef.current,
        zoom: zoomRef.current,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    if (points.current.size > 2) return;
    const position = coords(p);
    if (tool === 'pan') {
      gesture.current = { mode: 'pan', start: p, pan: panRef.current };
      return;
    }
    if (tool === 'cut') {
      if (!active || active.locked || !active.visible) return;
      gesture.current = { mode: 'cut', start: position, pan: panRef.current };
      setSelection({ start: position, end: position });
      return;
    }
    const hit = project.layers.find((l) => {
      if (
        !l.visible ||
        l.opacity === 0 ||
        position.x < l.x ||
        position.y < l.y ||
        position.x >= l.x + l.width ||
        position.y >= l.y + l.height
      )
        return false;
      const px = Math.floor(((position.x - l.x) * l.canvas.width) / l.width),
        py = Math.floor(((position.y - l.y) * l.canvas.height) / l.height);
      return context(l.canvas).getImageData(px, py, 1, 1).data[3] > 8;
    });
    onSelect(hit?.id ?? null);
    if (hit && !hit.locked)
      gesture.current = {
        mode: 'move',
        start: position,
        pan: panRef.current,
        layer: hit,
      };
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!points.current.has(e.pointerId)) return;
    const p = { x: e.clientX, y: e.clientY };
    points.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'pinch') {
      if (points.current.size < 2) return;
      const [a, b] = [...points.current.values()],
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nextZoom = Math.max(
        0.05,
        Math.min(
          4,
          (g.zoom! * Math.hypot(a.x - b.x, a.y - b.y)) /
            Math.max(1, g.distance!),
        ),
      );
      const rect = viewport.current!.getBoundingClientRect(),
        origin = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      const ratio = nextZoom / g.zoom!;
      setZoom(nextZoom);
      setPan({
        x: center.x - origin.x - (g.center!.x - origin.x - g.pan.x) * ratio,
        y: center.y - origin.y - (g.center!.y - origin.y - g.pan.y) * ratio,
      });
      return;
    }
    if (g.mode === 'pan') {
      setPan({ x: g.pan.x + p.x - g.start.x, y: g.pan.y + p.y - g.start.y });
      return;
    }
    const pt = coords(p);
    if (g.mode === 'cut') {
      setSelection({ start: g.start, end: pt });
      g.position = pt;
      return;
    }
    if (g.layer) {
      const x = Math.round(
        Math.max(
          -g.layer.width + 16,
          Math.min(settings.width - 16, g.layer.x + pt.x - g.start.x),
        ),
      );
      const y = Math.round(
        Math.max(
          -g.layer.height + 16,
          Math.min(settings.height - 16, g.layer.y + pt.y - g.start.y),
        ),
      );
      g.position = { x, y };
      setDrag({ id: g.layer.id, x, y });
    }
  }
  function end(e: ReactPointerEvent<HTMLDivElement>, cancel = false) {
    points.current.delete(e.pointerId);
    const g = gesture.current;
    if (
      !cancel &&
      g?.mode === 'move' &&
      g.layer &&
      g.position &&
      (g.position.x !== g.layer.x || g.position.y !== g.layer.y)
    )
      onMove(g.layer.id, g.position);
    if (!cancel && g?.mode === 'cut' && g.position) {
      const r = {
        x: Math.min(g.start.x, g.position.x),
        y: Math.min(g.start.y, g.position.y),
        width: Math.abs(g.start.x - g.position.x),
        height: Math.abs(g.start.y - g.position.y),
      };
      if (r.width * zoom > 6 && r.height * zoom > 6) onCut(r);
    }
    gesture.current = null;
    setDrag(null);
    setSelection(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const tools = [
    { id: 'move' as Tool, icon: Move, label: 'Sposta' },
    { id: 'pan' as Tool, icon: Hand, label: 'Naviga' },
    { id: 'cut' as Tool, icon: Scissors, label: 'Ritaglia' },
  ];
  return (
    <section className="workspace" aria-label="Area di lavoro">
      <div className="workspace-bar">
        <div className="tool-group" role="group" aria-label="Strumenti">
          {tools.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={tool === id ? 'tool-button active' : 'tool-button'}
              aria-pressed={tool === id}
              disabled={
                id === 'cut' && (!active || active.locked || !active.visible)
              }
              onClick={() => onTool(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <span className="canvas-dimensions">
          {settings.width} × {settings.height} px
        </span>
      </div>
      <div
        className={`viewport tool-${tool}`}
        ref={viewport}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onLostPointerCapture={(e) => {
          if (points.current.has(e.pointerId)) end(e, true);
        }}
      >
        <div
          className="paper checker"
          ref={paper}
          style={{
            width: settings.width,
            height: settings.height,
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <canvas ref={canvas} aria-label="Anteprima dei livelli" />
          {movedActive?.visible && (
            <div
              className={`layer-selection ${movedActive.locked ? 'is-locked' : ''}`}
              style={{
                left: movedActive.x,
                top: movedActive.y,
                width: movedActive.width,
                height: movedActive.height,
                borderWidth: 1.5 / zoom,
              }}
            >
              <span
                className="selection-name"
                style={{ transform: `scale(${1 / zoom})` }}
              >
                {movedActive.name}
              </span>
              {[0, 1, 2, 3].map((n) => (
                <i
                  key={n}
                  className={`handle h${n}`}
                  style={{
                    width: 7 / zoom,
                    height: 7 / zoom,
                    borderWidth: 1 / zoom,
                  }}
                />
              ))}
            </div>
          )}
          {selection && (
            <div
              className="cut-selection"
              style={{
                left: Math.min(selection.start.x, selection.end.x),
                top: Math.min(selection.start.y, selection.end.y),
                width: Math.abs(selection.end.x - selection.start.x),
                height: Math.abs(selection.end.y - selection.start.y),
                borderWidth: 2 / zoom,
              }}
            />
          )}
        </div>
      </div>
      <div className="workspace-bottom">
        <span className="gesture-hint">
          {tool === 'cut'
            ? 'Traccia un rettangolo: i pixel passano in un nuovo livello.'
            : 'Due dita per ingrandire e navigare'}
        </span>
        <div className="zoom-controls">
          <button
            className="icon-button"
            aria-label="Riduci zoom"
            onClick={() => setZoom((z) => Math.max(0.05, z / 1.25))}
          >
            <Minus size={17} />
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button
            className="icon-button"
            aria-label="Aumenta zoom"
            onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
          >
            <Plus size={17} />
          </button>
          <span className="divider" />
          <button
            className="icon-button"
            aria-label="Adatta tela"
            title="Adatta tela"
            onClick={fit}
          >
            <Maximize size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
