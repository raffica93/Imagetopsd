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
} from 'lucide-react';
import { BoundingBox, LayerItem } from '../types/index';
import {
  findConnectedComponents,
  isPixelBackground,
  expandBoundingBox,
  mergeOverlappingBoxes,
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
  const [mode, setMode] = useState<'alpha' | 'colorKey'>('alpha');
  const [targetColor, setTargetColor] = useState<{ r: number; g: number; b: number }>({
    r: 255,
    g: 255,
    b: 255,
  });
  const [hexColor, setHexColor] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(35);
  const [minPixelCount, setMinPixelCount] = useState(150);
  const [padding, setPadding] = useState(6);
  const [detectedBoxes, setDetectedBoxes] = useState<BoundingBox[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Run detection
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

        // Downsample slightly for ultra-fast connected component detection if canvas is huge (> 1500px)
        const scale = width > 1600 || height > 1600 ? 0.5 : 1;
        const sW = Math.round(width * scale);
        const sH = Math.round(height * scale);

        // Helper to check pixel foreground in scaled space
        const isForeground = (sx: number, sy: number) => {
          const ox = Math.min(width - 1, Math.round(sx / scale));
          const oy = Math.min(height - 1, Math.round(sy / scale));
          const idx = (oy * width + ox) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];

          const isBg = isPixelBackground(r, g, b, a, mode, targetColor, tolerance);
          return !isBg;
        };

        const rawBoxes = findConnectedComponents(
          sW,
          sH,
          isForeground,
          Math.round(minPixelCount * (scale * scale))
        );

        // Scale back boxes to original coordinates
        const scaledBoxes = rawBoxes.map((box) => ({
          minX: Math.max(0, Math.round(box.minX / scale)),
          minY: Math.max(0, Math.round(box.minY / scale)),
          maxX: Math.min(width - 1, Math.round(box.maxX / scale)),
          maxY: Math.min(height - 1, Math.round(box.maxY / scale)),
          pixelCount: Math.round(box.pixelCount / (scale * scale)),
        }));

        // Apply padding
        const padded = scaledBoxes.map((box) =>
          expandBoundingBox(box, padding, width, height)
        );

        // Merge very close/overlapping boxes
        const merged = mergeOverlappingBoxes(padded);
        setDetectedBoxes(merged);
      } catch (err) {
        console.error('Detection failed:', err);
      } finally {
        setIsProcessing(false);
      }
    }, 50);
  };

  // Re-run detection when parameters change
  useEffect(() => {
    if (isOpen && sourceCanvas) {
      runDetection();
    }
  }, [isOpen, sourceCanvas, mode, targetColor, tolerance, minPixelCount, padding]);

  // Draw overlay preview
  useEffect(() => {
    const pCanvas = previewCanvasRef.current;
    if (!pCanvas || !sourceCanvas) return;

    pCanvas.width = sourceCanvas.width;
    pCanvas.height = sourceCanvas.height;
    const ctx = pCanvas.getContext('2d');
    if (!ctx) return;

    // Draw source image
    ctx.drawImage(sourceCanvas, 0, 0);

    // Draw detected boxes
    detectedBoxes.forEach((box, i) => {
      const w = box.maxX - box.minX + 1;
      const h = box.maxY - box.minY + 1;

      // Box highlight
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = Math.max(2, Math.round(sourceCanvas.width / 500));
      ctx.strokeRect(box.minX, box.minY, w, h);

      // Semi-transparent fill
      ctx.fillStyle = 'rgba(244, 63, 94, 0.15)';
      ctx.fillRect(box.minX, box.minY, w, h);

      // Label tag
      const label = `Livello ${i + 1}`;
      ctx.font = `bold ${Math.max(14, Math.round(sourceCanvas.width / 80))}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const tagH = Math.max(20, Math.round(sourceCanvas.width / 60));

      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(box.minX, Math.max(0, box.minY - tagH), textWidth + 12, tagH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, box.minX + 6, Math.max(14, box.minY - tagH + tagH * 0.72));
    });
  }, [sourceCanvas, detectedBoxes]);

  // Extract layers and finalize
  const handleConfirmExtraction = () => {
    if (!sourceCanvas || detectedBoxes.length === 0) return;

    const newLayers: LayerItem[] = detectedBoxes.map((box, index) => {
      const cropped = cropCanvas(sourceCanvas, box);

      // If in colorKey mode, remove the background color inside the cropped element
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
              d[p + 3] = 0; // set alpha to 0 (transparent)
            }
          }
          cCtx.putImageData(imgData, 0, 0);
        }
      }

      // Check if we can trim transparent margins
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Separazione Automatica degli Elementi
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                  {detectedBoxes.length} elementi rilevati
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Isola ogni soggetto o sticker della foto in un livello indipendente trasparente
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

        {/* Body Grid */}
        <div className="flex-1 grid md:grid-cols-12 overflow-hidden min-h-[350px]">
          {/* Controls Panel */}
          <div className="md:col-span-5 p-4 border-r border-slate-800 space-y-4 overflow-y-auto bg-slate-900/80 text-xs text-slate-300">
            {/* Mode selection */}
            <div>
              <label className="font-semibold text-white block mb-1.5">
                Modalità di Rilevamento Sfondo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('alpha')}
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
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
                  className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
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
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-2">
                <label className="font-semibold text-white block">
                  Colore dello Sfondo da Rimuovere
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Colore sfondo"
                    value={hexColor}
                    onChange={(e) => handleHexChange(e.target.value)}
                    className="w-8 h-8 rounded border border-slate-600 cursor-pointer bg-transparent"
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

            {/* Sliders */}
            <div className="space-y-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
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
                <span className="text-[10px] text-slate-500">
                  Ignora macchioline o frammenti minuscoli.
                </span>
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

            {/* Hint */}
            <div className="text-[11px] text-slate-400 bg-indigo-950/30 border border-indigo-800/40 p-2.5 rounded-lg">
              💡 I rettangoli rossi nell'anteprima mostrano esattamente i livelli separati che verranno creati.
            </div>
          </div>

          {/* Interactive Visual Preview Area */}
          <div className="md:col-span-7 bg-slate-950 p-4 flex flex-col items-center justify-center overflow-auto relative">
            <div className="max-w-full max-h-[480px] overflow-auto rounded-lg border border-slate-800 shadow-inner p-2 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%),linear-gradient(-45deg,#1e293b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e293b_75%),linear-gradient(-45deg,transparent_75%,#1e293b_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full h-auto object-contain block mx-auto rounded shadow"
              />
            </div>

            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center">
                <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold">
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Rilevamento elementi in corso...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {detectedBoxes.length === 0 ? (
              <span className="text-amber-400">Nessun elemento rilevato con i parametri attuali. Prova a regolare la tolleranza o il colore di sfondo.</span>
            ) : (
              <span className="text-emerald-400 font-medium">
                ✓ {detectedBoxes.length} elementi pronti per essere trasformati in {detectedBoxes.length} livelli Adobe Fresco separati!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
            >
              Annulla
            </button>

            <button
              onClick={handleConfirmExtraction}
              disabled={detectedBoxes.length === 0}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-lg cursor-pointer ${
                detectedBoxes.length > 0
                  ? 'bg-gradient-to-r from-indigo-500 to-rose-600 hover:from-indigo-400 hover:to-rose-500 text-white shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Estrai {detectedBoxes.length} Livelli Separati</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
