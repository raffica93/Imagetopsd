import React, { useRef, useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Move,
  Crop,
  Sparkles,
  Upload,
  Plus,
  MousePointer,
  Scissors,
  Layers,
  FileCheck2,
  Workflow,
} from 'lucide-react';
import { LayerItem, ProjectSettings } from '../types/index';
import { cropCanvas, createCanvas, getNonTransparentBounds } from '../utils/canvasHelpers';

interface WorkspaceProps {
  settings: ProjectSettings;
  layers: LayerItem[];
  activeLayerId: string | null;
  viewMode: 'raster' | 'vector' | 'wireframe';
  onSelectLayer: (id: string | null) => void;
  onUpdateLayer: (id: string, updates: Partial<LayerItem>) => void;
  onAddLayer: (newLayer: LayerItem) => void;
  onAutoExtract: () => void;
  onOpenVectorize: () => void;
  onUploadFileClick: () => void;
  onLoadDemo: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  settings,
  layers,
  activeLayerId,
  viewMode,
  onSelectLayer,
  onUpdateLayer,
  onAddLayer,
  onAutoExtract,
  onOpenVectorize,
  onUploadFileClick,
  onLoadDemo,
}) => {
  const [tool, setTool] = useState<'move' | 'crop'>('move');
  const [zoom, setZoom] = useState<number>(0.65);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging active layer
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; layerX: number; layerY: number }>({
    mouseX: 0,
    mouseY: 0,
    layerX: 0,
    layerY: 0,
  });

  // Manual Crop Box state
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropCurrent, setCropCurrent] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeLayer = layers.find((l) => l.id === activeLayerId) || null;

  // Render canvas layers composite
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    canvas.width = settings.width;
    canvas.height = settings.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, settings.width, settings.height);

    // If in pure vector or wireframe mode and all layers have vector representation,
    // canvas can stay clean or show base layers
    const drawOrder = [...layers].reverse();

    drawOrder.forEach((layer) => {
      if (!layer.visible) return;

      // In pure vector mode, we let SVG elements render them smoothly unless not vectorized
      if (viewMode === 'vector' && layer.svgContent) {
        return; // rendered by SVG layer
      }

      ctx.save();
      ctx.globalAlpha = layer.opacity;
      if (layer.blendMode === 'normal') ctx.globalCompositeOperation = 'source-over';
      else if (layer.blendMode === 'multiply') ctx.globalCompositeOperation = 'multiply';
      else if (layer.blendMode === 'screen') ctx.globalCompositeOperation = 'screen';
      else if (layer.blendMode === 'overlay') ctx.globalCompositeOperation = 'overlay';
      else if (layer.blendMode === 'darken') ctx.globalCompositeOperation = 'darken';
      else if (layer.blendMode === 'lighten') ctx.globalCompositeOperation = 'lighten';
      else if (layer.blendMode === 'color dodge') ctx.globalCompositeOperation = 'color-dodge';
      else if (layer.blendMode === 'color burn') ctx.globalCompositeOperation = 'color-burn';
      else if (layer.blendMode === 'hard light') ctx.globalCompositeOperation = 'hard-light';
      else if (layer.blendMode === 'soft light') ctx.globalCompositeOperation = 'soft-light';
      else if (layer.blendMode === 'difference') ctx.globalCompositeOperation = 'difference';

      ctx.drawImage(layer.canvas, layer.x, layer.y, layer.width, layer.height);
      ctx.restore();
    });
  }, [layers, settings, viewMode]);

  // Convert client mouse/touch point to canvas pixel coordinates
  const clientToCanvasCoord = (clientX: number, clientY: number) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = settings.width / rect.width;
    const scaleY = settings.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const { x, y } = clientToCanvasCoord(e.clientX, e.clientY);

    if (tool === 'crop') {
      setCropStart({ x, y });
      setCropCurrent({ x, y });
      return;
    }

    const hitLayer = layers.find((layer) => {
      if (!layer.visible) return false;
      return (
        x >= layer.x &&
        x <= layer.x + layer.width &&
        y >= layer.y &&
        y <= layer.y + layer.height
      );
    });

    if (hitLayer) {
      onSelectLayer(hitLayer.id);
      setIsDraggingLayer(true);
      setDragStart({
        mouseX: x,
        mouseY: y,
        layerX: hitLayer.x,
        layerY: hitLayer.y,
      });
    } else {
      onSelectLayer(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    const { x, y } = clientToCanvasCoord(e.clientX, e.clientY);

    if (tool === 'crop' && cropStart) {
      setCropCurrent({ x, y });
      return;
    }

    if (isDraggingLayer && activeLayer) {
      const deltaX = x - dragStart.mouseX;
      const deltaY = y - dragStart.mouseY;
      onUpdateLayer(activeLayer.id, {
        x: Math.round(dragStart.layerX + deltaX),
        y: Math.round(dragStart.layerY + deltaY),
      });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDraggingLayer) {
      setIsDraggingLayer(false);
    }

    if (tool === 'crop' && cropStart && cropCurrent) {
      const minX = Math.round(Math.min(cropStart.x, cropCurrent.x));
      const maxX = Math.round(Math.max(cropStart.x, cropCurrent.x));
      const minY = Math.round(Math.min(cropStart.y, cropCurrent.y));
      const maxY = Math.round(Math.max(cropStart.y, cropCurrent.y));
      const w = maxX - minX;
      const h = maxY - minY;

      if (w > 10 && h > 10 && mainCanvasRef.current) {
        const cropped = cropCanvas(mainCanvasRef.current, { minX, minY, maxX, maxY });
        const bounds = getNonTransparentBounds(cropped);
        let finalCanvas = cropped;
        let finalX = minX;
        let finalY = minY;

        if (bounds) {
          finalCanvas = cropCanvas(cropped, bounds);
          finalX += bounds.minX;
          finalY += bounds.minY;
        }

        const newLayer: LayerItem = {
          id: `layer-${Date.now()}`,
          name: `Ritaglio Manuale ${layers.length + 1}`,
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          x: finalX,
          y: finalY,
          width: finalCanvas.width,
          height: finalCanvas.height,
          canvas: finalCanvas,
          previewUrl: finalCanvas.toDataURL('image/png'),
        };

        onAddLayer(newLayer);
        setTool('move');
      }

      setCropStart(null);
      setCropCurrent(null);
    }
  };

  const handleFitZoom = () => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const padding = 60;
    const scaleX = (clientWidth - padding) / settings.width;
    const scaleY = (clientHeight - padding) / settings.height;
    const bestScale = Math.min(scaleX, scaleY, 1);
    setZoom(Number(bestScale.toFixed(2)));
    setPan({ x: 0, y: 0 });
  };

  // Helper to extract inner SVG for rendering
  const getCleanInnerSvg = (svgContent?: string) => {
    if (!svgContent) return '';
    const openMatch = svgContent.indexOf('>');
    const closeMatch = svgContent.lastIndexOf('</svg>');
    if (openMatch !== -1 && closeMatch !== -1) {
      return svgContent.substring(openMatch + 1, closeMatch);
    }
    return svgContent;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden select-none">
      {/* Top Floating Toolbar */}
      <div className="absolute top-3 left-4 z-20 flex flex-wrap items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl text-xs">
        {/* Tool: Move / Select */}
        <button
          type="button"
          onClick={() => setTool('move')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
            tool === 'move'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Seleziona e sposta livelli (V)"
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>Sposta</span>
        </button>

        {/* Tool: Manual Crop to Layer */}
        <button
          type="button"
          onClick={() => setTool('crop')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
            tool === 'crop'
              ? 'bg-rose-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Trascina un rettangolo per ritagliare qualsiasi elemento in un nuovo livello"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Ritaglio Manuale</span>
        </button>

        <div className="w-[1px] h-4 bg-slate-800 mx-1" />

        {/* Carica File */}
        <button
          type="button"
          onClick={onUploadFileClick}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 font-medium transition cursor-pointer"
          title="Carica un'immagine, foglio sticker o PNG da separare"
        >
          <Upload className="w-3.5 h-3.5 text-indigo-400" />
          <span>Carica PNG</span>
        </button>

        {/* Separa Automaticamente */}
        <button
          type="button"
          onClick={onAutoExtract}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/80 font-medium transition cursor-pointer"
          title="Rileva e separa automaticamente tutti gli oggetti dell'immagine"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Separa</span>
        </button>

        {/* Demo Sticker Sheet */}
        <button
          type="button"
          onClick={onLoadDemo}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition cursor-pointer text-[11px]"
          title="Carica foglio sticker dimostrativo pronto da provare"
        >
          <span>⭐ Foglio Demo</span>
        </button>

        {/* Status indicator of current render mode */}
        <div className="ml-1 hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 text-[11px] text-slate-300 border border-slate-700/60">
          {viewMode === 'vector' ? (
            <>
              <FileCheck2 className="w-3 h-3 text-rose-400" />
              <span className="text-rose-300 font-semibold">Modalità Vettoriale SVG</span>
            </>
          ) : viewMode === 'wireframe' ? (
            <>
              <Workflow className="w-3 h-3 text-indigo-400" />
              <span className="text-indigo-300 font-semibold">Tracciati Vettoriali</span>
            </>
          ) : (
            <span className="text-slate-400">Modalità Pixel</span>
          )}
        </div>
      </div>

      {/* Floating Bottom Zoom & Canvas View Controls */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-1.5 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 shadow-xl text-xs text-slate-300">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.1).toFixed(2))))}
          className="p-1 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          title="Rimpicciolisci"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-slate-200 min-w-[45px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
          className="p-1 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          title="Ingrandisci"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="w-[1px] h-3 bg-slate-700 mx-1" />
        <button
          type="button"
          onClick={handleFitZoom}
          className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white cursor-pointer"
          title="Adatta tela alla finestra"
        >
          <Maximize className="w-3 h-3" />
          <span>Adatta</span>
        </button>
      </div>

      {/* Canvas Viewport Area */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-${
          isPanning ? 'grabbing' : tool === 'crop' ? 'crosshair' : 'default'
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            width: settings.width,
            height: settings.height,
          }}
          className="relative shadow-2xl transition-transform duration-75 ease-out select-none"
        >
          {/* Transparent Checkerboard Pattern Background */}
          <div
            className="absolute inset-0 border border-slate-700/60 shadow-2xl bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[size:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]"
            style={{ backgroundColor: '#0f172a' }}
          />

          {/* Main Layer Composite Canvas */}
          <canvas
            ref={mainCanvasRef}
            className="absolute inset-0 block pointer-events-none"
          />

          {/* SVG Vector Layer Overlay (Active in Vector and Wireframe Modes) */}
          {(viewMode === 'vector' || viewMode === 'wireframe') && (
            <svg
              className={`absolute inset-0 pointer-events-none ${
                viewMode === 'wireframe'
                  ? '[&_path]:stroke-[#38bdf8] [&_path]:stroke-[1.5px] [&_path]:fill-[rgba(56,189,248,0.12)]'
                  : ''
              }`}
              width={settings.width}
              height={settings.height}
              viewBox={`0 0 ${settings.width} ${settings.height}`}
            >
              {[...layers].reverse().map((layer) => {
                if (!layer.visible || !layer.svgContent) return null;
                const innerSvg = getCleanInnerSvg(layer.svgContent);
                return (
                  <g
                    key={layer.id}
                    id={`view_${layer.id}`}
                    opacity={layer.opacity}
                    transform={`translate(${layer.x}, ${layer.y})`}
                    dangerouslySetInnerHTML={{ __html: innerSvg }}
                  />
                );
              })}
            </svg>
          )}

          {/* Selection Box around active layer */}
          {activeLayer && activeLayer.visible && (
            <div
              style={{
                position: 'absolute',
                left: activeLayer.x,
                top: activeLayer.y,
                width: activeLayer.width,
                height: activeLayer.height,
              }}
              className="border-2 border-indigo-400 pointer-events-none ring-2 ring-indigo-400/20"
            >
              {/* Corner Handles */}
              <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-xs" />
              <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-xs" />
              <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-xs" />
              <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-500 rounded-xs" />

              {/* Tag with layer name & dimension */}
              <div className="absolute -top-6 left-0 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap flex items-center gap-1">
                {activeLayer.isVector && <span className="text-[9px] bg-rose-500 px-1 rounded">VETTORE</span>}
                <span>{activeLayer.name} ({Math.round(activeLayer.width)}×{Math.round(activeLayer.height)}px)</span>
              </div>
            </div>
          )}

          {/* Manual Crop Box Preview */}
          {tool === 'crop' && cropStart && cropCurrent && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(cropStart.x, cropCurrent.x),
                top: Math.min(cropStart.y, cropCurrent.y),
                width: Math.abs(cropCurrent.x - cropStart.x),
                height: Math.abs(cropCurrent.y - cropStart.y),
              }}
              className="border-2 border-dashed border-rose-400 bg-rose-500/20 pointer-events-none"
            >
              <div className="absolute -top-6 left-0 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                Rilascia per creare nuovo livello
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
