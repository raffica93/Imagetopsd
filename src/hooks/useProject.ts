import { useRef, useState } from 'react';
import type { Project } from '../types';
import { validateBudget } from '../utils/canvasHelpers';

interface History {
  past: Project[];
  present: Project | null;
  future: Project[];
}
export function useProject() {
  const [history, setHistory] = useState<History>({
    past: [],
    present: null,
    future: [],
  });
  const current = useRef(history);
  function set(next: History) {
    current.current = next;
    setHistory(next);
  }
  function commit(next: Project | ((p: Project) => Project)) {
    const h = current.current;
    const project =
      typeof next === 'function' ? h.present && next(h.present) : next;
    if (!project) return;
    validateBudget(project.layers);
    // Bound both count and unique pixel memory retained by undo.
    let past = h.present ? [...h.past, h.present].slice(-15) : [];
    const memory = (items: Project[]) => {
      const canvases = new Set(
        items.flatMap((p) => p.layers.map((l) => l.canvas)),
      );
      return [...canvases].reduce((n, c) => n + c.width * c.height, 0);
    };
    while (past.length && memory([...past, project]) > 24_000_000)
      past = past.slice(1);
    set({ past, present: project, future: [] });
  }
  function reset(project: Project | null) {
    set({ past: [], present: project, future: [] });
  }
  function select(id: string | null) {
    const h = current.current;
    if (h.present) set({ ...h, present: { ...h.present, activeLayerId: id } });
  }
  function undo() {
    const h = current.current,
      previous = h.past.at(-1);
    if (previous && h.present)
      set({
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
      });
  }
  function redo() {
    const h = current.current,
      next = h.future[0];
    if (next && h.present)
      set({
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      });
  }
  return {
    project: history.present,
    commit,
    reset,
    select,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
  };
}
