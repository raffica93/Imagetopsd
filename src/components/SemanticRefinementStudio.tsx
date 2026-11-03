/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Paintbrush,
  Eraser,
  Undo2,
  Redo2,
  RotateCcw,
  Check,
  Layers,
  Sparkles,
  Info,
  ShieldCheck,
  ArrowRightLeft,
  Merge,
} from 'lucide-react';
import type { LayerItem } from '../types';
import type {
  SemanticLabel,
  SemanticRefinementMask,
} from '../utils/semanticSegmentation';
import {
  buildProjectLayersFromMasks,
  SEMANTIC_HIERARCHY,
} from '../utils/semanticSegmentation';
import { createCanvas, context } from '../utils/canvasHelpers';

interface Props {
  sourceLayer: LayerItem;
  initialMasks: SemanticRefinementMask[];
  isMock: boolean;
  modelUsed: string;
  onApply: (layers: LayerItem[]) => void;
  onBack: () => void;
}

type ViewMode = 'overlay' | 'solo' | 'composite';
type BrushTool = 'brush' | 'eraser';

export function SemanticRefinementStudio({
  sourceLayer,
  initialMasks,
  isMock,
  modelUsed,
  onApply,
  onBack,
}: Props) {
  // Deep clone initial masks so we can mutate cleanly and support undo/redo
  const [masks, setMasks] = useState<SemanticRefinementMask[]>(() =>
    initialMasks.map((m) => ({
      ...m,
      mask: new Uint8Array(m.mask),
    })),
  );

  const [activeLabel, setActiveLabel] = useState<SemanticLabel>(() => {
    return initialMasks[0]?.label || 'Pelle';
  });

  const [visibleLabels, setVisibleLabels] = useState<Set<SemanticLabel>>(
    () => new Set(initialMasks.map((m) => m.label)),
  );

  const [viewMode, setViewMode] = useState<ViewMode>('overlay');
  const [brushTool, setBrushTool] = useState<BrushTool>('brush');
  const [brushSize, setBrushSize] = useState<number>(18);
  const [overlayAlpha, setOverlayAlpha] = useState<number>(0.55);

  // History stack for undo/redo
  const [history, setHistory] = useState<Uint8Array[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const width = sourceLayer.canvas.width;
  const height = sourceLayer.canvas.height;

  // Save state to undo history
  const pushHistoryState = useCallback(
    (nextMasks: SemanticRefinementMask[]) => {
      const snapshot = nextMasks.map((m) => new Uint8Array(m.mask));
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, snapshot].slice(-15); // keep max 15
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 14));
    },
    [historyIndex],
  );

  // Initial history snapshot
  useEffect(() => {
    if (history.length === 0 && masks.length > 0) {
      const initialSnapshot = masks.map((m) => new Uint8Array(m.mask));
      setHistory([initialSnapshot]);
      setHistoryIndex(0);
    }
  }, [masks, history.length]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const targetSnapshot = history[historyIndex - 1];
    setHistoryIndex((idx) => idx - 1);
    setMasks((current) =>
      current.map((m, i) => {
        const restored = new Uint8Array(targetSnapshot[i]);
        let pixelCount = 0;
        for (let p = 0; p < restored.length; p++) {
          if (restored[p] === 1) pixelCount++;
        }
        return {
          ...m,
          mask: restored,
          pixelCount,
        };
      }),
    );
  }, [canUndo, history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const targetSnapshot = history[historyIndex + 1];
    setHistoryIndex((idx) => idx + 1);
    setMasks((current) =>
      current.map((m, i) => {
        const restored = new Uint8Array(targetSnapshot[i]);
        let pixelCount = 0;
        for (let p = 0; p < restored.length; p++) {
          if (restored[p] === 1) pixelCount++;
        }
        return {
          ...m,
          mask: restored,
          pixelCount,
        };
      }),
    );
  }, [canRedo, history, historyIndex]);

  // Toggle visibility of a layer
  const toggleVisibility = (label: SemanticLabel) => {
    setVisibleLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Reassign all active mask pixels from one layer to another (e.g. from Pelle to Accessori)
  const handleReassign = (targetLabel: SemanticLabel) => {
    if (activeLabel === targetLabel) return;
    const activeMaskIdx = masks.findIndex((m) => m.label === activeLabel);
    const targetMaskIdx = masks.findIndex((m) => m.label === targetLabel);
    if (activeMaskIdx === -1 || targetMaskIdx === -1) return;

    const nextMasks = masks.map((m, idx) => {
      if (idx === activeMaskIdx) {
        return {
          ...m,
          mask: new Uint8Array(width * height),
          pixelCount: 0,
        };
      }
      if (idx === targetMaskIdx) {
        const newMask = new Uint8Array(m.mask);
        const sourceMask = masks[activeMaskIdx].mask;
        let count = 0;
        for (let i = 0; i < width * height; i++) {
          if (sourceMask[i] === 1 || newMask[i] === 1) {
            newMask[i] = 1;
            count++;
          }
        }
        return {
          ...m,
          mask: newMask,
          pixelCount: count,
        };
      }
      return m;
    });

    setMasks(nextMasks);
    pushHistoryState(nextMasks);
    setActiveLabel(targetLabel);
  };

  // Re-render the canvas whenever masks, viewMode, activeLabel, or visibility change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = context(canvas);

    ctx.clearRect(0, 0, width, height);

    const srcCtx = context(sourceLayer.canvas);
    const srcImgData = srcCtx.getImageData(0, 0, width, height);
    const srcData = srcImgData.data;

    if (viewMode === 'composite') {
      // Draw composite of all visible layers according to hierarchy
      const outImgData = ctx.createImageData(width, height);
      const outData = outImgData.data;

      // Bottom to top
      const reversedMasks = [...masks].reverse();
      for (const m of reversedMasks) {
        if (!visibleLabels.has(m.label)) continue;
        for (let i = 0; i < width * height; i++) {
          if (m.mask[i] === 1) {
            const p = i * 4;
            outData[p] = srcData[p];
            outData[p + 1] = srcData[p + 1];
            outData[p + 2] = srcData[p + 2];
            outData[p + 3] = srcData[p + 3];
          }
        }
      }
      ctx.putImageData(outImgData, 0, 0);
    } else if (viewMode === 'solo') {
      // Draw only the active layer
      const activeMask = masks.find((m) => m.label === activeLabel);
      if (activeMask) {
        const outImgData = ctx.createImageData(width, height);
        const outData = outImgData.data;
        for (let i = 0; i < width * height; i++) {
          if (activeMask.mask[i] === 1) {
            const p = i * 4;
            outData[p] = srcData[p];
            outData[p + 1] = srcData[p + 1];
            outData[p + 2] = srcData[p + 2];
            outData[p + 3] = srcData[p + 3];
          }
        }
        ctx.putImageData(outImgData, 0, 0);
      }
    } else {
      // Overlay mode: base image + colored translucent mask overlays
      ctx.drawImage(sourceLayer.canvas, 0, 0);

      // Create translucent mask color overlay
      const overlayImgData = ctx.createImageData(width, height);
      const overlayData = overlayImgData.data;

      for (const m of masks) {
        if (!visibleLabels.has(m.label)) continue;
        // Parse hex color
        const hex = m.colorHex.replace('#', '');
        const cr = parseInt(hex.substring(0, 2), 16) || 200;
        const cg = parseInt(hex.substring(2, 4), 16) || 200;
        const cb = parseInt(hex.substring(4, 6), 16) || 200;
        const alphaVal = Math.round(overlayAlpha * 255);

        const isCurrent = m.label === activeLabel;
        const finalAlpha = isCurrent
          ? Math.min(255, alphaVal + 60)
          : Math.max(20, alphaVal - 30);

        for (let i = 0; i < width * height; i++) {
          if (m.mask[i] === 1) {
            const p = i * 4;
            overlayData[p] = cr;
            overlayData[p + 1] = cg;
            overlayData[p + 2] = cb;
            overlayData[p + 3] = finalAlpha;
          }
        }
      }

      // Draw overlay onto temporary canvas and blend
      const tempCanvas = createCanvas(width, height);
      context(tempCanvas).putImageData(overlayImgData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
    }
  }, [
    masks,
    viewMode,
    activeLabel,
    visibleLabels,
    overlayAlpha,
    sourceLayer.canvas,
    width,
    height,
  ]);

  // Touch and Pointer Drawing Logic
  const applyBrushToPixel = useCallback(
    (
      cx: number,
      cy: number,
      radius: number,
      tool: BrushTool,
      targetLabel: SemanticLabel,
    ) => {
      setMasks((prevMasks) => {
        const targetIdx = prevMasks.findIndex((m) => m.label === targetLabel);
        if (targetIdx === -1) return prevMasks;

        const nextMasks = [...prevMasks];
        const currentTargetMask = new Uint8Array(nextMasks[targetIdx].mask);
        let countDelta = 0;

        const r2 = radius * radius;
        const minX = Math.max(0, Math.floor(cx - radius));
        const maxX = Math.min(width - 1, Math.ceil(cx + radius));
        const minY = Math.max(0, Math.floor(cy - radius));
        const maxY = Math.min(height - 1, Math.ceil(cy + radius));

        for (let y = minY; y <= maxY; y++) {
          const dy = y - cy;
          for (let x = minX; x <= maxX; x++) {
            const dx = x - cx;
            if (dx * dx + dy * dy <= r2) {
              const idx = y * width + x;
              if (tool === 'brush') {
                if (currentTargetMask[idx] === 0) {
                  currentTargetMask[idx] = 1;
                  countDelta++;
                }
                // When brushing into targetLabel, remove from other body layers to prevent conflicting overlap
                if (targetLabel !== 'Tratto') {
                  for (let mIdx = 0; mIdx < nextMasks.length; mIdx++) {
                    if (
                      mIdx !== targetIdx &&
                      nextMasks[mIdx].label !== 'Tratto' &&
                      nextMasks[mIdx].mask[idx] === 1
                    ) {
                      const otherMask = new Uint8Array(nextMasks[mIdx].mask);
                      otherMask[idx] = 0;
                      nextMasks[mIdx] = {
                        ...nextMasks[mIdx],
                        mask: otherMask,
                        pixelCount: Math.max(
                          0,
                          nextMasks[mIdx].pixelCount - 1,
                        ),
                      };
                    }
                  }
                }
              } else {
                // Eraser
                if (currentTargetMask[idx] === 1) {
                  currentTargetMask[idx] = 0;
                  countDelta--;
                }
              }
            }
          }
        }

        nextMasks[targetIdx] = {
          ...nextMasks[targetIdx],
          mask: currentTargetMask,
          pixelCount: Math.max(
            0,
            nextMasks[targetIdx].pixelCount + countDelta,
          ),
        };

        return nextMasks;
      });
    },
    [width, height],
  );

  const getCanvasCoords = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (viewMode === 'composite') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    lastPos.current = coords;
    applyBrushToPixel(
      coords.x,
      coords.y,
      brushSize,
      brushTool,
      activeLabel,
    );
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Interpolate between lastPos and coords to ensure continuous stroke
    const prev = lastPos.current || coords;
    const dist = Math.hypot(coords.x - prev.x, coords.y - prev.y);
    const steps = Math.max(1, Math.ceil(dist / (brushSize * 0.4)));

    for (let s = 1; s <= steps; s++) {
      const ix = prev.x + (coords.x - prev.x) * (s / steps);
      const iy = prev.y + (coords.y - prev.y) * (s / steps);
      applyBrushToPixel(ix, iy, brushSize, brushTool, activeLabel);
    }

    lastPos.current = coords;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Commit stroke to history
    pushHistoryState(masks);
  };

  const handleCommitLayers = () => {
    const generated = buildProjectLayersFromMasks(sourceLayer, masks);
    onApply(generated);
  };

  const totalFgPixels = masks.reduce(
    (acc, m) => (m.label !== 'Tratto' ? acc + m.pixelCount : acc),
    0,
  );

  return (
    <div className="semantic-studio">
      <div className="studio-topbar">
        <div className="studio-badge-group">
          <span className="ai-badge">
            <Sparkles size={14} />
            {modelUsed}
          </span>
          {isMock && (
            <span className="test-badge">
              <ShieldCheck size={14} />
              Verifica Test Fallback (Dichiarata)
            </span>
          )}
        </div>
        <div className="history-group">
          <button
            type="button"
            className="icon-button"
            disabled={!canUndo}
            onClick={handleUndo}
            title="Annulla modifica maschera"
            aria-label="Annulla"
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={!canRedo}
            onClick={handleRedo}
            title="Ripristina modifica maschera"
            aria-label="Ripristina"
          >
            <Redo2 size={18} />
          </button>
        </div>
      </div>

      <div className="studio-main-grid">
        {/* Left Column: 9-Tier Layer Hierarchy List */}
        <div className="hierarchy-panel">
          <div className="hierarchy-header">
            <strong>Gerarchia Livelli Fresco</strong>
            <small>Dall’alto verso il basso (1 → 9)</small>
          </div>
          <div className="hierarchy-list" role="radiogroup">
            {masks.map((maskItem, idx) => {
              const isSelected = maskItem.label === activeLabel;
              const isVisible = visibleLabels.has(maskItem.label);
              const percentage =
                totalFgPixels > 0
                  ? ((maskItem.pixelCount / totalFgPixels) * 100).toFixed(1)
                  : '0';

              return (
                <div
                  key={maskItem.label}
                  className={`hierarchy-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => setActiveLabel(maskItem.label)}
                >
                  <button
                    type="button"
                    className="vis-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVisibility(maskItem.label);
                    }}
                    title={isVisible ? 'Nascondi livello' : 'Mostra livello'}
                  >
                    {isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <span
                    className="color-swatch"
                    style={{ backgroundColor: maskItem.colorHex }}
                  />
                  <div className="hierarchy-info">
                    <div className="row-title">
                      <span className="tier-num">{idx + 1}.</span>
                      <strong>{maskItem.name}</strong>
                    </div>
                    <span className="pixel-stat">
                      {maskItem.pixelCount.toLocaleString('it-IT')} px{' '}
                      {maskItem.label !== 'Tratto' && `(${percentage}%)`}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Hidden original layer indicator */}
            <div className="hierarchy-row hidden-original">
              <span className="vis-btn muted">
                <EyeOff size={16} />
              </span>
              <span className="color-swatch orig-swatch" />
              <div className="hierarchy-info">
                <div className="row-title">
                  <span className="tier-num">9.</span>
                  <strong>Originale (Recupero)</strong>
                </div>
                <span className="pixel-stat">
                  Livello intatto per ripristino sicuro
                </span>
              </div>
            </div>
          </div>

          {/* Quick Reassign Section */}
          <div className="reassign-section">
            <span className="section-label">
              <ArrowRightLeft size={13} />
              Riassegna tutto a un altro livello:
            </span>
            <div className="reassign-buttons">
              {['Accessori', 'Capelli', 'Pelle', 'Vestiti'].map((target) => (
                <button
                  key={target}
                  type="button"
                  className="reassign-chip"
                  disabled={activeLabel === target}
                  onClick={() => handleReassign(target as SemanticLabel)}
                >
                  → {target}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center / Right Column: Touch Refinement Canvas */}
        <div className="canvas-view-column">
          {/* View Mode & Brush Toolbar */}
          <div className="studio-canvas-toolbar">
            <div className="view-mode-toggle">
              <button
                type="button"
                className={`tab-btn ${viewMode === 'overlay' ? 'active' : ''}`}
                onClick={() => setViewMode('overlay')}
              >
                Mappa Maschere
              </button>
              <button
                type="button"
                className={`tab-btn ${viewMode === 'solo' ? 'active' : ''}`}
                onClick={() => setViewMode('solo')}
              >
                Isola Livello
              </button>
              <button
                type="button"
                className={`tab-btn ${viewMode === 'composite' ? 'active' : ''}`}
                onClick={() => setViewMode('composite')}
              >
                Anteprima Fresco
              </button>
            </div>

            <div className="brush-controls">
              <button
                type="button"
                className={`tool-chip ${brushTool === 'brush' ? 'active' : ''}`}
                onClick={() => setBrushTool('brush')}
                title="Aggiungi pixel col pennello"
              >
                <Paintbrush size={15} />
                Aggiungi
              </button>
              <button
                type="button"
                className={`tool-chip ${brushTool === 'eraser' ? 'active' : ''}`}
                onClick={() => setBrushTool('eraser')}
                title="Sottrai pixel con la gomma"
              >
                <Eraser size={15} />
                Sottrai
              </button>
              <div className="size-slider-box">
                <span>Dimensione: {brushSize}px</span>
                <input
                  type="range"
                  min="4"
                  max="48"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Interactive Canvas Box */}
          <div className="studio-canvas-wrapper checker">
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              className={`refine-canvas ${viewMode !== 'composite' ? 'brushing' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>

          <div className="touch-hint">
            <Info size={14} />
            <span>
              Tocca e trascina con il dito o Apple Pencil per ritoccare la
              maschera di <strong>{activeLabel}</strong>. La separazione
              garantisce zero perdita di pixel.
            </span>
          </div>
        </div>
      </div>

      <div className="modal-footer studio-footer">
        <button type="button" className="button secondary" onClick={onBack}>
          <RotateCcw size={16} />
          Torna alle opzioni
        </button>
        <button
          type="button"
          className="button primary"
          onClick={handleCommitLayers}
        >
          Applica Livelli a FrescoLayers
          <Check size={18} />
        </button>
      </div>
    </div>
  );
}
