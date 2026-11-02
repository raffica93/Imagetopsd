import React, { useState } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  Scissors,
  Download,
  ArrowUp,
  ArrowDown,
  Edit2,
  Check,
  Plus,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { LayerItem, BlendMode } from '../types/index';
import { cropCanvas, getNonTransparentBounds } from '../utils/canvasHelpers';
import { downloadBlob } from '../utils/psdExport';

interface LayerSidebarProps {
  layers: LayerItem[];
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (id: string, updates: Partial<LayerItem>) => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onMoveLayer: (id: string, direction: 'up' | 'down') => void;
  onAddNewLayerClick: () => void;
  onOpenVectorizeForLayer: (layer: LayerItem) => void;
}

export const LayerSidebar: React.FC<LayerSidebarProps> = ({
  layers,
  activeLayerId,
  onSelectLayer,
  onUpdateLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onMoveLayer,
  onAddNewLayerClick,
  onOpenVectorizeForLayer,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const activeLayer = layers.find((l) => l.id === activeLayerId) || layers[0] || null;

  const handleStartRename = (layer: LayerItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(layer.id);
    setEditingName(layer.name);
  };

  const handleSaveRename = (layerId: string) => {
    if (editingName.trim()) {
      onUpdateLayer(layerId, { name: editingName.trim() });
    }
    setEditingId(null);
  };

  // Trim layer to tight bounding box
  const handleTrimLayer = (layer: LayerItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const bounds = getNonTransparentBounds(layer.canvas);
    if (!bounds) return;

    const trimmed = cropCanvas(layer.canvas, bounds);
    onUpdateLayer(layer.id, {
      canvas: trimmed,
      x: layer.x + bounds.minX,
      y: layer.y + bounds.minY,
      width: trimmed.width,
      height: trimmed.height,
      previewUrl: trimmed.toDataURL('image/png'),
    });
  };

  // Download single layer as transparent PNG
  const handleDownloadSinglePng = (layer: LayerItem, e: React.MouseEvent) => {
    e.stopPropagation();
    layer.canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${layer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`);
      }
    });
  };

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-20 text-slate-300">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            Pannello Livelli ({layers.length})
          </h2>
        </div>
        <button
          onClick={onAddNewLayerClick}
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-medium transition cursor-pointer"
          title="Aggiungi o carica un nuovo livello PNG"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nuovo</span>
        </button>
      </div>

      {/* Active Layer Quick Properties Panel */}
      {activeLayer && (
        <div className="p-3 border-b border-slate-800 bg-slate-950/30 space-y-2.5 text-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-semibold text-slate-200 truncate max-w-[170px]">
              {activeLayer.name}
            </span>
            <span className="font-mono text-slate-400">
              {Math.round(activeLayer.width)}×{Math.round(activeLayer.height)}px
            </span>
          </div>

          {/* Opacity slider */}
          <div>
            <div className="flex justify-between items-center text-[11px] mb-1">
              <span className="text-slate-400">Opacità</span>
              <span className="font-mono text-indigo-400 font-semibold">
                {Math.round(activeLayer.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(activeLayer.opacity * 100)}
              onChange={(e) =>
                onUpdateLayer(activeLayer.id, { opacity: Number(e.target.value) / 100 })
              }
              className="w-full accent-indigo-500 cursor-pointer h-1.5"
            />
          </div>

          {/* Blend Mode */}
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400 shrink-0">Fusione</span>
            <select
              aria-label="Modalità di Fusione Livello"
              value={activeLayer.blendMode}
              onChange={(e) =>
                onUpdateLayer(activeLayer.id, { blendMode: e.target.value as BlendMode })
              }
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="normal">Normale</option>
              <option value="multiply">Moltiplica (Multiply)</option>
              <option value="screen">Scolora (Screen)</option>
              <option value="overlay">Sovrapponi (Overlay)</option>
              <option value="darken">Scurisci (Darken)</option>
              <option value="lighten">Schiarisci (Lighten)</option>
              <option value="color dodge">Scherma Colore</option>
              <option value="color burn">Brucia Colore</option>
              <option value="hard light">Luce Intensa</option>
              <option value="soft light">Luce Soffusa</option>
              <option value="difference">Differenza</option>
            </select>
          </div>

          {/* Actions for active layer */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
            <button
              onClick={(e) => handleTrimLayer(activeLayer, e)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1 transition cursor-pointer"
              title="Ritaglia bordi trasparenti (Trim)"
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span>Trim</span>
            </button>

            <button
              onClick={() => onOpenVectorizeForLayer(activeLayer)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-300 text-[11px] flex items-center gap-1 transition cursor-pointer"
              title="Vettorializza questo livello in SVG per Adobe Fresco"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-rose-400" />
              <span>{activeLayer.isVector ? 'Ri-Vettorializza' : 'Trace SVG'}</span>
            </button>

            {activeLayer.svgContent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const blob = new Blob([activeLayer.svgContent || ''], { type: 'image/svg+xml;charset=utf-8' });
                  downloadBlob(blob, `${activeLayer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.svg`);
                }}
                className="p-1 rounded hover:bg-slate-800 text-rose-300 hover:text-rose-200 text-[11px] flex items-center gap-1 transition cursor-pointer"
                title="Scarica singolo livello vettoriale SVG per Fresco"
              >
                <Download className="w-3.5 h-3.5 text-rose-400" />
                <span>SVG</span>
              </button>
            )}

            <button
              onClick={(e) => handleDownloadSinglePng(activeLayer, e)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-300 text-[11px] flex items-center gap-1 transition cursor-pointer"
              title="Scarica singolo PNG trasparente"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>PNG</span>
            </button>

            <button
              onClick={() => onDuplicateLayer(activeLayer.id)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-300 transition cursor-pointer"
              title="Duplica livello"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-400" />
            </button>

            <button
              onClick={() => onDeleteLayer(activeLayer.id)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title="Elimina livello"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            </button>
          </div>
        </div>
      )}

      {/* Layer List Stack */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {layers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 space-y-2">
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <p>Nessun livello presente.</p>
            <p className="text-[11px] text-slate-600">
              Carica una foto con elementi PNG oppure premi "Nuovo" o "Separa Elementi".
            </p>
          </div>
        ) : (
          layers.map((layer, index) => {
            const isActive = layer.id === activeLayerId;
            return (
              <div
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`group relative p-2 rounded-xl border flex items-center gap-2.5 transition cursor-pointer ${
                  isActive
                    ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/40 text-white'
                    : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 text-slate-300'
                }`}
              >
                {/* Visibility Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateLayer(layer.id, { visible: !layer.visible });
                  }}
                  className={`p-1 rounded hover:bg-slate-700 transition cursor-pointer ${
                    layer.visible ? 'text-slate-300 hover:text-white' : 'text-slate-600'
                  }`}
                  title={layer.visible ? 'Nascondi livello' : 'Mostra livello'}
                >
                  {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>

                {/* Layer Thumbnail */}
                <div className="w-10 h-10 rounded-lg border border-slate-700/80 overflow-hidden shrink-0 flex items-center justify-center bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[size:8px_8px] bg-[position:0_0,0_4px,4px_-4px,-4px_0]">
                  <img
                    src={layer.previewUrl}
                    alt={layer.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>

                {/* Name & Subtitle */}
                <div className="flex-1 min-w-0">
                  {editingId === layer.id ? (
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(layer.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="w-full bg-slate-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleSaveRename(layer.id)}
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs font-medium truncate block select-none"
                        title={layer.name}
                      >
                        {layer.name}
                      </span>
                      <button
                        onClick={(e) => handleStartRename(layer, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white transition"
                        title="Rinomina livello"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-400 mt-0.5">
                    {layer.isVector ? (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                        VETTORE {layer.vectorPathsCount ? `(${layer.vectorPathsCount}p)` : ''}
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        RASTER
                      </span>
                    )}
                    <span>{Math.round(layer.width)}×{Math.round(layer.height)}px</span>
                    <span>•</span>
                    <span className="capitalize">{layer.blendMode}</span>
                  </div>
                </div>

                {/* Layer Reorder Buttons */}
                <div className="flex flex-col gap-0.5 opacity-60 group-hover:opacity-100">
                  <button
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, 'up');
                    }}
                    className="p-0.5 hover:text-white disabled:opacity-20 text-slate-400 cursor-pointer"
                    title="Sposta su"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    disabled={index === layers.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, 'down');
                    }}
                    className="p-0.5 hover:text-white disabled:opacity-20 text-slate-400 cursor-pointer"
                    title="Sposta giù"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Pronto per Adobe Fresco</span>
        <span className="text-emerald-400 font-medium">PSD / SVG Ready</span>
      </div>
    </aside>
  );
};
