import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck2,
  Sliders,
  Download,
  Sparkles,
  Layers,
  ZoomIn,
  Eye,
  CheckCircle2,
  Workflow,
  Check,
  ListOrdered,
} from 'lucide-react';
import { LayerItem, ProjectSettings } from '../types/index';
import {
  traceImageDataToSvg,
  vectorizeCanvas,
  VectorizeOptions,
  DEFAULT_VECTOR_OPTIONS,
  createMultiLayerSvg,
  SimplificationLevel,
  getSimplificationParams,
  countSvgPaths,
} from '../utils/vectorizer';
import { downloadBlob, shareOrDownloadFile } from '../utils/psdExport';

interface VectorizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerItem[];
  activeLayer: LayerItem | null;
  settings: ProjectSettings;
  onAddVectorLayer?: (svgString: string, layerName: string) => void;
  onApplyAllVectorLayers?: (updatedLayers: LayerItem[]) => void;
  onUpdateSingleVectorLayer?: (layerId: string, svg: string, pathCount: number) => void;
}

export const VectorizeModal: React.FC<VectorizeModalProps> = ({
  isOpen,
  onClose,
  layers,
  activeLayer,
  settings,
  onAddVectorLayer,
  onApplyAllVectorLayers,
  onUpdateSingleVectorLayer,
}) => {
  // Default to 'all' so multi-layer vectorization is front and center!
  const [targetScope, setTargetScope] = useState<'all' | 'active'>('all');
  const [selectedLayerId, setSelectedLayerId] = useState<string>(activeLayer ? activeLayer.id : layers[0]?.id || '');
  const [preset, setPreset] = useState<'standard' | 'detailed' | 'flat' | 'mono'>('standard');
  const [simplificationLevel, setSimplificationLevel] = useState<SimplificationLevel>('medium');
  const [numberOfColors, setNumberOfColors] = useState<number>(12);
  const [curveSmoothness, setCurveSmoothness] = useState<'sharp' | 'balanced' | 'smooth'>('balanced');
  const [pathOmit, setPathOmit] = useState<number>(4);
  const [svgPreview, setSvgPreview] = useState<string>('');
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'vector' | 'raster'>('vector');

  // Vectorized layers cache when scope is 'all'
  const [vectorizedLayers, setVectorizedLayers] = useState<LayerItem[]>([]);

  // Sync selected layer when active layer changes
  useEffect(() => {
    if (activeLayer) {
      setSelectedLayerId(activeLayer.id);
    } else if (layers.length > 0 && !selectedLayerId) {
      setSelectedLayerId(layers[0].id);
    }
  }, [activeLayer, layers]);

  // Handle Preset changes
  const applyPreset = (newPreset: 'standard' | 'detailed' | 'flat' | 'mono') => {
    setPreset(newPreset);
    switch (newPreset) {
      case 'detailed':
        setNumberOfColors(24);
        setSimplificationLevel('high');
        setCurveSmoothness('balanced');
        setPathOmit(2);
        break;
      case 'flat':
        setNumberOfColors(8);
        setSimplificationLevel('low');
        setCurveSmoothness('smooth');
        setPathOmit(6);
        break;
      case 'mono':
        setNumberOfColors(2);
        setSimplificationLevel('medium');
        setCurveSmoothness('sharp');
        setPathOmit(3);
        break;
      case 'standard':
      default:
        setNumberOfColors(12);
        setSimplificationLevel('medium');
        setCurveSmoothness('balanced');
        setPathOmit(4);
        break;
    }
  };

  // Run vector tracing for either the single selected layer or ALL layers separately
  useEffect(() => {
    if (!isOpen || layers.length === 0) return;

    setIsTracing(true);
    const timer = setTimeout(() => {
      try {
        if (targetScope === 'active') {
          // Trace only the selected layer
          const layerToTrace = layers.find((l) => l.id === selectedLayerId) || layers[0];
          if (layerToTrace) {
            const { svg, pathCount } = vectorizeCanvas(layerToTrace.canvas, {
              numberOfColors,
              curveSmoothness,
              pathOmit,
              simplificationLevel,
            });
            setSvgPreview(svg);
          }
        } else {
          // VETTORIALIZZAZIONE MULTI-LIVELLO SEPARATA:
          // Ogni livello viene vettorializzato INDIPENDENTEMENTE, preservando livelli, nomi, trasparenza e coordinate!
          const multiVectorized: LayerItem[] = layers.map((layer) => {
            const { svg, pathCount } = vectorizeCanvas(layer.canvas, {
              numberOfColors,
              curveSmoothness,
              pathOmit,
              simplificationLevel,
            });
            return {
              ...layer,
              isVector: true,
              svgContent: svg,
              vectorPathsCount: pathCount,
            };
          });

          setVectorizedLayers(multiVectorized);
          const combinedSvg = createMultiLayerSvg(settings.width, settings.height, multiVectorized);
          setSvgPreview(combinedSvg);
        }
      } catch (err) {
        console.error('Vector trace failed:', err);
      } finally {
        setIsTracing(false);
      }
    }, 40);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    selectedLayerId,
    targetScope,
    numberOfColors,
    curveSmoothness,
    pathOmit,
    simplificationLevel,
    layers,
    settings,
  ]);

  const currentLayer = layers.find((l) => l.id === selectedLayerId) || layers[0];
  const totalPaths = countSvgPaths(svgPreview);

  // Download SVG
  const handleDownloadSvg = () => {
    if (!svgPreview) return;
    const blob = new Blob([svgPreview], { type: 'image/svg+xml;charset=utf-8' });
    const filename = targetScope === 'all'
      ? `${settings.name || 'fresco_progetto'}_multi_livello.svg`
      : `${currentLayer?.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'livello'}_vettoriale.svg`;
    shareOrDownloadFile(blob, filename, 'Tracciati Vettoriali per Adobe Fresco');
  };

  // Apply to all layers
  const handleApplyToAll = () => {
    if (onApplyAllVectorLayers && vectorizedLayers.length > 0) {
      onApplyAllVectorLayers(vectorizedLayers);
      onClose();
    }
  };

  // Apply to single layer
  const handleApplyToSingle = () => {
    if (onUpdateSingleVectorLayer && currentLayer && svgPreview) {
      onUpdateSingleVectorLayer(currentLayer.id, svgPreview, countSvgPaths(svgPreview));
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Vettorializzazione Immagine (Raster to Vector)
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                  {targetScope === 'all' ? `${layers.length} Livelli Vettoriali Separati` : 'Livello Singolo'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Converte i pixel raster in curve Bézier vettoriali per i pennelli vettoriali di Fresco
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid md:grid-cols-12 overflow-hidden min-h-[360px]">
          {/* Controls */}
          <div className="md:col-span-5 p-4 border-r border-slate-800 space-y-4 overflow-y-auto bg-slate-900/80 text-xs text-slate-300">
            {/* Target Scope: Multi-Livello vs Singolo */}
            <div className="bg-indigo-950/40 p-3 rounded-xl border border-indigo-800/60 space-y-2">
              <label className="font-semibold text-white block">
                Ambito di Vettorializzazione
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetScope('all')}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    targetScope === 'all'
                      ? 'bg-gradient-to-r from-rose-600 to-indigo-600 border-rose-400 text-white font-bold shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Tutti i Livelli ({layers.length})</span>
                  </div>
                  <div className="text-[10px] text-slate-200 mt-1 font-normal">
                    Mantiene ogni elemento separato in livelli SVG
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetScope('active')}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                    targetScope === 'active'
                      ? 'bg-rose-600/30 border-rose-500 text-white font-bold shadow-md'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Livello Singolo</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 font-normal">
                    Vettorializza solo l'elemento selezionato
                  </div>
                </button>
              </div>

              {targetScope === 'active' && (
                <div className="pt-1">
                  <select
                    aria-label="Seleziona Livello da Vettorializzare"
                    value={selectedLayerId}
                    onChange={(e) => setSelectedLayerId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-500"
                  >
                    {layers.map((l, idx) => (
                      <option key={l.id} value={l.id}>
                        {idx + 1}. {l.name} ({l.width}×{l.height}px)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetScope === 'all' && vectorizedLayers.length > 0 && (
                <div className="bg-slate-900/90 rounded-lg p-2 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-rose-300">
                    <span>Livelli Vettoriali Pronti:</span>
                    <span>{vectorizedLayers.length} livelli ({totalPaths} tracciati tot.)</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-0.5 text-[10px] text-slate-400">
                    {vectorizedLayers.map((vl, idx) => (
                      <div key={vl.id} className="flex justify-between items-center py-0.5 border-b border-slate-800/60 last:border-0">
                        <span className="truncate max-w-[170px]">{idx + 1}. {vl.name}</span>
                        <span className="font-mono text-emerald-400 shrink-0">{vl.vectorPathsCount || 0} tracciati</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Semplificazione Percorsi (Livelli di Dettaglio) */}
            <div className="space-y-2 bg-slate-800/60 p-3 rounded-xl border border-slate-700/70">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-white flex items-center gap-1.5 text-xs">
                  <Workflow className="w-3.5 h-3.5 text-rose-400" />
                  <span>Semplificazione Percorsi</span>
                </label>
                {svgPreview && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                    {totalPaths} tracciati
                  </span>
                )}
              </div>

              {/* 3 levels: Basso, Medio, Alto */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  {
                    level: 'low' as const,
                    title: 'Basso',
                    badge: 'Pochi nodi',
                    desc: 'Massima fluidità, curve lisce per Fresco',
                  },
                  {
                    level: 'medium' as const,
                    title: 'Medio',
                    badge: 'Consigliato',
                    desc: 'Bilanciato per sticker e grafica',
                  },
                  {
                    level: 'high' as const,
                    title: 'Alto',
                    badge: 'Fedele',
                    desc: 'Massimo dettaglio e micro-angoli',
                  },
                ].map((item) => (
                  <button
                    key={item.level}
                    type="button"
                    onClick={() => setSimplificationLevel(item.level)}
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      simplificationLevel === item.level
                        ? 'bg-rose-600/30 border-rose-500 ring-1 ring-rose-500/50 text-white'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{item.title}</span>
                      {simplificationLevel === item.level && (
                        <Check className="w-3 h-3 text-rose-400" />
                      )}
                    </div>
                    <div className="text-[9px] px-1 py-0.2 rounded bg-slate-900/60 text-slate-300 font-medium inline-block mt-1">
                      {item.badge}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 italic pt-0.5">
                {getSimplificationParams(simplificationLevel).description}
              </p>
            </div>

            {/* Presets */}
            <div>
              <label className="font-semibold text-white block mb-1.5">Preset Stile Vettoriale</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'standard', label: '🎨 Standard Fresco', desc: '12 colori bilanciati' },
                  { id: 'detailed', label: '✨ Dettagliato', desc: '24 colori ricchi' },
                  { id: 'flat', label: '🏷️ Pop / Flat Art', desc: '8 colori e curve lisce' },
                  { id: 'mono', label: '🖋️ Contorno / B&W', desc: '2 colori silhouette' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyPreset(item.id as any)}
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      preset === item.id
                        ? 'bg-rose-600/20 border-rose-500 text-white font-medium'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-medium text-xs text-slate-200">{item.label}</div>
                    <div className="text-[10px] text-slate-400">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Fine Tuning Controls */}
            <div className="space-y-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
              {/* Number of colors */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-slate-300">Numero di Colori Tracciati</span>
                  <span className="font-mono text-rose-400 font-bold">{numberOfColors}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="32"
                  value={numberOfColors}
                  onChange={(e) => setNumberOfColors(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              {/* Curve Smoothness */}
              <div>
                <label className="font-medium text-slate-300 block mb-1">Lisciatura Curve</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['sharp', 'balanced', 'smooth'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCurveSmoothness(s)}
                      className={`py-1 text-center rounded text-[11px] capitalize cursor-pointer transition ${
                        curveSmoothness === s
                          ? 'bg-rose-500 text-white font-semibold'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s === 'sharp' ? 'Rigido' : s === 'balanced' ? 'Equilibrato' : 'Morbido'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Preview */}
          <div className="md:col-span-7 bg-slate-950 p-4 flex flex-col items-center justify-center relative overflow-hidden">
            {/* View Mode Toggle */}
            <div className="absolute top-4 right-4 z-10 flex bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('vector')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  viewMode === 'vector' ? 'bg-rose-600 text-white font-semibold' : 'text-slate-400'
                }`}
              >
                Vettoriale (SVG)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raster')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  viewMode === 'raster' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'
                }`}
              >
                Raster Originale (Pixel)
              </button>
            </div>

            {/* Display container */}
            <div className="w-full max-w-[460px] h-[380px] overflow-hidden rounded-xl border border-slate-800 p-4 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] flex items-center justify-center shadow-inner">
              {viewMode === 'vector' ? (
                svgPreview ? (
                  <div
                    className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-[400px] [&>svg]:max-h-[340px] [&>svg]:object-contain drop-shadow-md"
                    dangerouslySetInnerHTML={{ __html: svgPreview }}
                  />
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Generazione anteprima vettoriale...
                  </div>
                )
              ) : (
                currentLayer && (
                  <img
                    src={currentLayer.previewUrl}
                    alt={currentLayer.name}
                    className="max-w-full max-h-[340px] object-contain drop-shadow-md"
                  />
                )
              )}
            </div>

            {isTracing && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center">
                <div className="flex items-center space-x-2 text-rose-400 text-xs font-semibold">
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Vettorializzazione in corso ({targetScope === 'all' ? `${layers.length} livelli` : 'livello singolo'})...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {targetScope === 'all'
                ? `${layers.length} livelli separati pronti per Adobe Fresco (${totalPaths} tracciati)`
                : `Livello "${currentLayer?.name}" pronto (${totalPaths} tracciati)`}
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
            >
              Chiudi
            </button>

            {targetScope === 'all' ? (
              <>
                <button
                  type="button"
                  onClick={handleApplyToAll}
                  disabled={vectorizedLayers.length === 0}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer disabled:opacity-50"
                  title="Applica i tracciati vettoriali a tutti i livelli del progetto mantenendoli divisi"
                >
                  <Layers className="w-4 h-4" />
                  <span>Applica a Tutti i {layers.length} Livelli</span>
                </button>

                <button
                  onClick={handleDownloadSvg}
                  disabled={!svgPreview}
                  className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Scarica SVG Multi-Livello ({layers.length} Livelli)</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleApplyToSingle}
                  disabled={!svgPreview}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer"
                  title="Applica la vettorializzazione a questo livello"
                >
                  <Check className="w-4 h-4" />
                  <span>Applica al Livello</span>
                </button>

                {onAddVectorLayer && currentLayer && (
                  <button
                    type="button"
                    onClick={() => {
                      if (svgPreview) {
                        onAddVectorLayer(svgPreview, `${currentLayer.name} (Vettoriale)`);
                        onClose();
                      }
                    }}
                    disabled={!svgPreview}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Nuovo Livello Copia</span>
                  </button>
                )}

                <button
                  onClick={handleDownloadSvg}
                  disabled={!svgPreview}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white text-xs font-bold shadow transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Scarica SVG</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
