import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Sliders,
  Check,
  Eye,
  Layers,
  Wand2,
  Maximize2,
  Trash2,
  Filter,
  Terminal,
  Copy,
  ChevronDown,
  ChevronUp,
  Palette,
  LayoutGrid,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { BoundingBox, LayerItem } from '../types/index';
import {
  findConnectedComponentsWithDiagnostics,
  segmentImageByColors,
  isPixelBackground,
  expandBoundingBox,
  mergeOverlappingBoxes,
  SegmentationLogEntry,
  ColorClusterInfo,
  rgbToHex,
} from '../utils/segmentationCore';
import { cropCanvas, createCanvas, getNonTransparentBounds } from '../utils/canvasHelpers';

interface AutoExtractModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceCanvas: HTMLCanvasElement | null;
  onExtractLayers: (newLayers: LayerItem[]) => void;
}

export const AutoExtractModal: React.FC<AutoExtractModalProps> = ({
  isOpen,
  onClose,
  sourceCanvas,
  onExtractLayers,
}) => {
  // Strategy: color clusters (ideal for single characters/illustrations) vs spatial islands (stickers/props)
  const [strategy, setStrategy] = useState<'colorClusters' | 'spatialIslands'>('colorClusters');

  // Background detection options
  const [mode, setMode] = useState<'alpha' | 'colorKey'>('alpha');
  const [targetColor, setTargetColor] = useState<{ r: number; g: number; b: number }>({
    r: 255,
    g: 255,
    b: 255,
  });
  const [hexColor, setHexColor] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(35);

  // Spatial options
  const [minPixelCount, setMinPixelCount] = useState(120);
  const [padding, setPadding] = useState(6);
  const [detectedBoxes, setDetectedBoxes] = useState<BoundingBox[]>([]);

  // Color cluster options
  const [numberOfColors, setNumberOfColors] = useState<number>(5);
  const [separateLineart, setSeparateLineart] = useState<boolean>(true);
  const [colorClusters, setColorClusters] = useState<ColorClusterInfo[]>([]);
  const [pixelClusterMap, setPixelClusterMap] = useState<Int16Array | null>(null);
  const [activeHoverCluster, setActiveHoverCluster] = useState<number | null>(null);
  const [selectedClusterIndices, setSelectedClusterIndices] = useState<Set<number>>(new Set());

  // Processing state & diagnostic logging
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<SegmentationLogEntry[]>([]);
  const [isLogOpen, setIsLogOpen] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Hex to RGB
  const handleHexChange = (hex: string) => {
    setHexColor(hex);
    const cleaned = hex.replace('#', '');
    if (cleaned.length === 6) {
      const r = parseInt(cleaned.substring(0, 2), 16);
      const g = parseInt(cleaned.substring(2, 4), 16);
      const b = parseInt(cleaned.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        setTargetColor({ r, g, b });
      }
    }
  };

  // Run detection depending on strategy
  const runDetection = () => {
    if (!sourceCanvas) return;
    setIsProcessing(true);

    setTimeout(() => {
      try {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;
        const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        if (strategy === 'colorClusters') {
          // Color-based decomposition (for single characters/illustrations)
          const result = segmentImageByColors(data, width, height, {
            numberOfColors,
            separateLineart,
            bgMode: mode,
            targetColor,
            tolerance,
            minPixelCount: Math.max(10, Math.round(minPixelCount / 4)),
          });

          setColorClusters(result.clusters);
          setPixelClusterMap(result.pixelClusterIndices);
          setSelectedClusterIndices(new Set(result.clusters.map((_, i) => i)));
          setLogs(result.logs);
        } else {
          // Spatial Connected Components (for stickers/separated props)
          const scale = width > 1600 || height > 1600 ? 0.5 : 1;
          const sW = Math.round(width * scale);
          const sH = Math.round(height * scale);

          let bgCount = 0;
          let fgCount = 0;
          const totalPix = sW * sH;

          const isForeground = (sx: number, sy: number) => {
            const ox = Math.min(width - 1, Math.round(sx / scale));
            const oy = Math.min(height - 1, Math.round(sy / scale));
            const idx = (oy * width + ox) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];

            const isBg = isPixelBackground(r, g, b, a, mode, targetColor, tolerance);
            if (isBg) bgCount++;
            else fgCount++;
            return !isBg;
          };

          const { boxes: rawBoxes, logs: spatialLogs } = findConnectedComponentsWithDiagnostics(
            sW,
            sH,
            isForeground,
            Math.round(minPixelCount * (scale * scale)),
            {
              totalPixels: totalPix,
              bgPixels: bgCount,
              fgPixels: fgCount,
              mode: mode === 'alpha' ? 'Trasparenza Alpha' : `ColorKey (${hexColor})`,
            }
          );

          // Scale back boxes
          const scaledBoxes = rawBoxes.map((box) => ({
            minX: Math.max(0, Math.round(box.minX / scale)),
            minY: Math.max(0, Math.round(box.minY / scale)),
            maxX: Math.min(width - 1, Math.round(box.maxX / scale)),
            maxY: Math.min(height - 1, Math.round(box.maxY / scale)),
            pixelCount: Math.round(box.pixelCount / (scale * scale)),
          }));

          const padded = scaledBoxes.map((box) =>
            expandBoundingBox(box, padding, width, height)
          );

          const merged = mergeOverlappingBoxes(padded);
          setDetectedBoxes(merged);
          setLogs(spatialLogs);
        }
      } catch (err) {
        console.error('Detection failed:', err);
      } finally {
        setIsProcessing(false);
      }
    }, 40);
  };

  // Re-run detection when parameters change
  useEffect(() => {
    if (isOpen && sourceCanvas) {
      runDetection();
    }
  }, [
    isOpen,
    sourceCanvas,
    strategy,
    mode,
    targetColor,
    tolerance,
    minPixelCount,
    padding,
    numberOfColors,
    separateLineart,
  ]);

  // Copy logs to clipboard
  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.category}] ${l.message}${l.details ? ` (${l.details})` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  // Draw overlay preview
  useEffect(() => {
    const pCanvas = previewCanvasRef.current;
    if (!pCanvas || !sourceCanvas) return;

    pCanvas.width = sourceCanvas.width;
    pCanvas.height = sourceCanvas.height;
    const ctx = pCanvas.getContext('2d');
    if (!ctx) return;

    if (strategy === 'colorClusters') {
      if (activeHoverCluster !== null && pixelClusterMap) {
        // Highlight active hover cluster on preview canvas
        const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        if (srcCtx) {
          const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
          const outImg = ctx.createImageData(sourceCanvas.width, sourceCanvas.height);
          const sD = srcData.data;
          const oD = outImg.data;

          for (let i = 0; i < pixelClusterMap.length; i++) {
            const p = i * 4;
            if (pixelClusterMap[i] === activeHoverCluster) {
              oD[p] = sD[p];
              oD[p + 1] = sD[p + 1];
              oD[p + 2] = sD[p + 2];
              oD[p + 3] = sD[p + 3];
            } else {
              // Dim other pixels slightly
              oD[p] = sD[p];
              oD[p + 1] = sD[p + 1];
              oD[p + 2] = sD[p + 2];
              oD[p + 3] = Math.round(sD[p + 3] * 0.15);
            }
          }
          ctx.putImageData(outImg, 0, 0);

          // Draw cluster bounding box outline
          const cl = colorClusters[activeHoverCluster];
          if (cl && cl.bounds) {
            ctx.strokeStyle = cl.hex;
            ctx.lineWidth = 3;
            ctx.strokeRect(
              cl.bounds.minX,
              cl.bounds.minY,
              cl.bounds.maxX - cl.bounds.minX + 1,
              cl.bounds.maxY - cl.bounds.minY + 1
            );
          }
        }
      } else {
        // Draw full source image normally
        ctx.drawImage(sourceCanvas, 0, 0);
      }
    } else {
      // Spatial Islands mode
      ctx.drawImage(sourceCanvas, 0, 0);

      detectedBoxes.forEach((box, i) => {
        const w = box.maxX - box.minX + 1;
        const h = box.maxY - box.minY + 1;

        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = Math.max(2, Math.round(sourceCanvas.width / 500));
        ctx.strokeRect(box.minX, box.minY, w, h);

        ctx.fillStyle = 'rgba(244, 63, 94, 0.15)';
        ctx.fillRect(box.minX, box.minY, w, h);

        const label = `Livello ${i + 1}`;
        ctx.font = `bold ${Math.max(14, Math.round(sourceCanvas.width / 80))}px sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const tagH = Math.max(20, Math.round(sourceCanvas.width / 60));

        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(box.minX, Math.max(0, box.minY - tagH), textWidth + 12, tagH);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, box.minX + 6, Math.max(14, box.minY - tagH + tagH * 0.72));
      });
    }
  }, [sourceCanvas, detectedBoxes, strategy, colorClusters, pixelClusterMap, activeHoverCluster]);

  // Extract layers and finalize
  const handleConfirmExtraction = () => {
    if (!sourceCanvas) return;

    if (strategy === 'colorClusters') {
      if (colorClusters.length === 0 || !pixelClusterMap) return;

      const width = sourceCanvas.width;
      const height = sourceCanvas.height;
      const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      if (!srcCtx) return;
      const srcImg = srcCtx.getImageData(0, 0, width, height);
      const srcData = srcImg.data;

      const newLayers: LayerItem[] = [];

      colorClusters.forEach((cluster, clusterIdx) => {
        if (!selectedClusterIndices.has(clusterIdx)) return;

        // Create canvas for this cluster
        const cCanvas = createCanvas(width, height);
        const cCtx = cCanvas.getContext('2d');
        if (!cCtx) return;

        const cImg = cCtx.createImageData(width, height);
        const cData = cImg.data;

        for (let i = 0; i < pixelClusterMap.length; i++) {
          if (pixelClusterMap[i] === clusterIdx) {
            const p = i * 4;
            cData[p] = srcData[p];
            cData[p + 1] = srcData[p + 1];
            cData[p + 2] = srcData[p + 2];
            cData[p + 3] = srcData[p + 3];
          }
        }

        cCtx.putImageData(cImg, 0, 0);

        // Trim transparent bounds to optimize PSD layer size
        const bounds = getNonTransparentBounds(cCanvas);
        let finalCanvas = cCanvas;
        let finalX = 0;
        let finalY = 0;

        if (bounds) {
          finalCanvas = cropCanvas(cCanvas, bounds);
          finalX = bounds.minX;
          finalY = bounds.minY;
        }

        const previewUrl = finalCanvas.toDataURL('image/png');

        newLayers.push({
          id: `layer-color-${Date.now()}-${clusterIdx}`,
          name: `Livello ${newLayers.length + 1} - ${cluster.name} (${cluster.hex})`,
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          x: finalX,
          y: finalY,
          width: finalCanvas.width,
          height: finalCanvas.height,
          canvas: finalCanvas,
          previewUrl: previewUrl,
          locked: false,
        });
      });

      onExtractLayers(newLayers);
      onClose();
    } else {
      // Spatial Islands mode
      if (detectedBoxes.length === 0) return;

      const newLayers: LayerItem[] = detectedBoxes.map((box, index) => {
        const cropped = cropCanvas(sourceCanvas, box);

        if (mode === 'colorKey') {
          const cCtx = cropped.getContext('2d', { willReadFrequently: true });
          if (cCtx) {
            const imgData = cCtx.getImageData(0, 0, cropped.width, cropped.height);
            const d = imgData.data;
            for (let p = 0; p < d.length; p += 4) {
              const isBg = isPixelBackground(
                d[p],
                d[p + 1],
                d[p + 2],
                d[p + 3],
                'colorKey',
                targetColor,
                tolerance
              );
              if (isBg) {
                d[p + 3] = 0;
              }
            }
            cCtx.putImageData(imgData, 0, 0);
          }
        }

        const bounds = getNonTransparentBounds(cropped);
        let finalCanvas = cropped;
        let finalX = box.minX;
        let finalY = box.minY;

        if (bounds) {
          finalCanvas = cropCanvas(cropped, bounds);
          finalX += bounds.minX;
          finalY += bounds.minY;
        }

        const previewUrl = finalCanvas.toDataURL('image/png');

        return {
          id: `layer-${Date.now()}-${index}`,
          name: `Livello ${index + 1} - Elemento`,
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          x: finalX,
          y: finalY,
          width: finalCanvas.width,
          height: finalCanvas.height,
          canvas: finalCanvas,
          previewUrl: previewUrl,
          locked: false,
        };
      });

      onExtractLayers(newLayers);
      onClose();
    }
  };

  const totalEffectiveLayers =
    strategy === 'colorClusters' ? selectedClusterIndices.size : detectedBoxes.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-rose-500 text-white flex items-center justify-center shadow-md">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Separazione Livelli per Adobe Fresco
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  {totalEffectiveLayers} {totalEffectiveLayers === 1 ? 'livello pronto' : 'livelli pronti'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Scomponi un PNG o illustrazione in livelli separati trasparenti modificabili singolarmente
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

        {/* Strategy Switcher Bar */}
        <div className="bg-slate-950/90 px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Metodo di Separazione:</span>
            <div className="inline-flex bg-slate-800/90 p-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setStrategy('colorClusters')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  strategy === 'colorClusters'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Per Tinte & Colori (Soggetto Singolo)</span>
                <span className="text-[10px] bg-rose-500/30 text-rose-200 px-1.5 py-0.2 rounded font-normal">
                  Consigliato
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStrategy('spatialIslands')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  strategy === 'spatialIslands'
                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Isole Spaziali (Sticker & Props Staccati)</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            {strategy === 'colorClusters'
              ? 'Scompone pelle, abiti, capelli e lineart in livelli trasparenti sovrapposti'
              : 'Isola elementi staccati tra loro da spazi vuoti o trasparenza'}
          </div>
        </div>

        {/* Body Grid */}
        <div className="flex-1 grid md:grid-cols-12 overflow-hidden min-h-[380px]">
          {/* Controls Panel */}
          <div className="md:col-span-5 p-4 border-r border-slate-800 space-y-4 overflow-y-auto bg-slate-900/90 text-xs text-slate-300">
            {/* Background detection mode */}
            <div>
              <label className="font-semibold text-white block mb-1.5">
                Modalità di Rilevamento Sfondo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('alpha')}
                  className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                    mode === 'alpha'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs">Trasparenza Alpha</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    L'immagine ha già sfondo trasparente (PNG)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('colorKey')}
                  className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                    mode === 'colorKey'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white font-medium'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-xs">Sfondo Tinta Unita</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Rimuovi sfondo bianco o colore solido
                  </div>
                </button>
              </div>
            </div>

            {/* Color picker if colorKey mode */}
            {mode === 'colorKey' && (
              <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 space-y-2">
                <label className="font-semibold text-white block">
                  Colore Sfondo da Trattare come Trasparente
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Colore sfondo"
                    value={hexColor}
                    onChange={(e) => handleHexChange(e.target.value)}
                    className="w-7 h-7 rounded border border-slate-600 cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    aria-label="Codice colore HEX"
                    value={hexColor}
                    onChange={(e) => handleHexChange(e.target.value)}
                    placeholder="#ffffff"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 uppercase font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleHexChange('#ffffff')}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[10px] text-white"
                  >
                    Bianco
                  </button>
                </div>
              </div>
            )}

            {/* STRATEGY 1: Color Clusters settings */}
            {strategy === 'colorClusters' ? (
              <div className="space-y-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-semibold text-white">Numero di Livelli Cromatici</span>
                    <span className="font-mono text-indigo-400 font-bold">{numberOfColors} livelli</span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-2">
                    {[2, 3, 4, 5, 6, 8].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNumberOfColors(n)}
                        className={`flex-1 py-1 rounded border text-xs font-medium cursor-pointer transition ${
                          numberOfColors === n
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <input
                    type="range"
                    min="2"
                    max="10"
                    value={numberOfColors}
                    onChange={(e) => setNumberOfColors(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500">
                    Scegli quanti livelli separati estrarre dal personaggio.
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-700/50">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={separateLineart}
                      onChange={(e) => setSeparateLineart(e.target.checked)}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                    />
                    <div>
                      <span className="font-medium text-white block">
                        Isola Tratto & Lineart (Livello Superiore)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Crea un livello dedicato per i contorni scuri, ideale per ridipingere sotto in Fresco.
                      </span>
                    </div>
                  </label>
                </div>

                {/* List of generated color clusters with checkboxes and swatches */}
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white">Livelli Rilevati ({colorClusters.length})</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedClusterIndices(
                          selectedClusterIndices.size === colorClusters.length
                            ? new Set()
                            : new Set(colorClusters.map((_, i) => i))
                        )
                      }
                      className="text-[10px] text-indigo-400 hover:underline cursor-pointer"
                    >
                      {selectedClusterIndices.size === colorClusters.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {colorClusters.map((cluster, idx) => {
                      const isSelected = selectedClusterIndices.has(idx);
                      const isHovered = activeHoverCluster === idx;

                      return (
                        <div
                          key={idx}
                          onMouseEnter={() => setActiveHoverCluster(idx)}
                          onMouseLeave={() => setActiveHoverCluster(null)}
                          className={`flex items-center justify-between p-1.5 rounded-lg border transition text-xs cursor-pointer ${
                            isHovered
                              ? 'bg-indigo-950/60 border-indigo-400'
                              : isSelected
                              ? 'bg-slate-800/80 border-slate-700'
                              : 'bg-slate-900/50 border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedClusterIndices);
                                if (e.target.checked) next.add(idx);
                                else next.delete(idx);
                                setSelectedClusterIndices(next);
                              }}
                              className="accent-indigo-500 rounded cursor-pointer"
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-sm"
                              style={{ backgroundColor: cluster.hex }}
                            />
                            <div className="truncate">
                              <span className="font-semibold text-slate-200 block truncate">
                                {cluster.name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {cluster.hex} • {cluster.pixelCount.toLocaleString()} px
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-indigo-300 shrink-0 px-1.5 py-0.5 rounded bg-indigo-500/10">
                            {cluster.percentage}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* STRATEGY 2: Spatial Islands settings */
              <div className="space-y-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                {/* Single component alert */}
                {detectedBoxes.length === 1 && (
                  <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-200 block text-xs">
                          Rilevato solo 1 elemento contiguo!
                        </span>
                        <p className="text-[11px] text-amber-300/80 mt-0.5">
                          Il soggetto dell'immagine è un unico disegno continuo. Per separare vestiti, pelle, capelli e accessori in livelli distinti:
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStrategy('colorClusters')}
                      className="w-full py-1.5 px-3 rounded-lg bg-gradient-to-r from-indigo-500 to-rose-600 hover:from-indigo-400 hover:to-rose-500 text-white font-bold text-xs shadow transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Palette className="w-3.5 h-3.5" />
                      <span>Passa a Scomposizione per Colore Ora</span>
                    </button>
                  </div>
                )}

                {/* Tolerance */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-slate-300">Tolleranza Colore</span>
                    <span className="font-mono text-indigo-400">{tolerance}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="120"
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500">
                    Aumenta se rimangono aloni attorno agli oggetti.
                  </span>
                </div>

                {/* Min pixel count filter */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-slate-300">Filtro Rumore / Min Area</span>
                    <span className="font-mono text-indigo-400">{minPixelCount} px</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="1000"
                    step="10"
                    value={minPixelCount}
                    onChange={(e) => setMinPixelCount(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Padding */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-slate-300">Margine di Ritaglio (Padding)</span>
                    <span className="font-mono text-indigo-400">{padding} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={padding}
                    onChange={(e) => setPadding(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Hint */}
            <div className="text-[11px] text-slate-400 bg-indigo-950/30 border border-indigo-800/40 p-2.5 rounded-lg flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                Ogni livello esportato manterrà le sue coordinate e trasparenza per essere dipinto e animato su Adobe Fresco.
              </span>
            </div>
          </div>

          {/* Right Visual Preview Area + Live Terminal Drawer */}
          <div className="md:col-span-7 bg-slate-950 flex flex-col overflow-hidden relative">
            {/* Visual Canvas Canvas View */}
            <div className="flex-1 p-3 flex flex-col items-center justify-center overflow-auto relative">
              <div className="max-w-full max-h-[360px] overflow-auto rounded-lg border border-slate-800 shadow-inner p-2 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]">
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full h-auto object-contain block mx-auto rounded shadow"
                />
              </div>

              {isProcessing && (
                <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center">
                  <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold">
                    <Sparkles className="w-4 h-4 animate-spin" />
                    <span>Segmentazione elementi in corso...</span>
                  </div>
                </div>
              )}
            </div>

            {/* LIVE DIAGNOSTIC LOG TERMINAL ("metti log") */}
            <div className="border-t border-slate-800 bg-slate-950/95 flex flex-col shrink-0">
              {/* Terminal Header */}
              <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-semibold text-slate-200">Terminale Diagnostico & Log</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
                    {logs.length} eventi
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyLogs}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition cursor-pointer"
                    title="Copia log negli appunti"
                  >
                    {copyFeedback ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold">Copiato!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copia Log</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title="Pulisci log"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsLogOpen(!isLogOpen)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    title={isLogOpen ? 'Riduci terminale' : 'Espandi terminale'}
                  >
                    {isLogOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Log stream view */}
              {isLogOpen && (
                <div
                  ref={logContainerRef}
                  className="h-28 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed space-y-1 bg-black/70 select-text"
                >
                  {logs.length === 0 ? (
                    <div className="text-slate-600 italic">In attesa di analisi...</div>
                  ) : (
                    logs.map((log) => {
                      const badgeColors: Record<string, string> = {
                        ANALISI: 'text-sky-400 bg-sky-950/60 border-sky-800/50',
                        ALPHA: 'text-purple-400 bg-purple-950/60 border-purple-800/50',
                        SEGMENTAZIONE: 'text-indigo-400 bg-indigo-950/60 border-indigo-800/50',
                        COLORI: 'text-pink-400 bg-pink-950/60 border-pink-800/50',
                        DIAGNOSTICA: 'text-amber-400 bg-amber-950/60 border-amber-800/50',
                        SUCCESSO: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50',
                      };

                      return (
                        <div key={log.id} className="flex items-start gap-1.5 text-slate-300">
                          <span className="text-slate-600 shrink-0 text-[10px]">{log.timestamp}</span>
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded border font-semibold shrink-0 ${
                              badgeColors[log.category] || 'text-slate-400 bg-slate-800'
                            }`}
                          >
                            [{log.category}]
                          </span>
                          <span
                            className={
                              log.level === 'warn'
                                ? 'text-amber-300'
                                : log.level === 'success'
                                ? 'text-emerald-300 font-medium'
                                : 'text-slate-300'
                            }
                          >
                            {log.message}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {totalEffectiveLayers === 0 ? (
              <span className="text-amber-400">Nessun livello selezionato o rilevato.</span>
            ) : (
              <span className="text-emerald-400 font-medium">
                ✓ {totalEffectiveLayers} {totalEffectiveLayers === 1 ? 'livello pronto' : 'livelli pronti'} per essere esportati in Adobe Fresco!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer font-medium"
            >
              Annulla
            </button>

            <button
              onClick={handleConfirmExtraction}
              disabled={totalEffectiveLayers === 0}
              className={`flex items-center space-x-1.5 px-5 py-2 rounded-lg text-xs font-bold transition shadow-lg cursor-pointer ${
                totalEffectiveLayers > 0
                  ? 'bg-gradient-to-r from-indigo-500 to-rose-600 hover:from-indigo-400 hover:to-rose-500 text-white shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>
                {strategy === 'colorClusters'
                  ? `Estrai ${totalEffectiveLayers} Livelli Cromatici`
                  : `Estrai ${totalEffectiveLayers} Livelli Separati`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
