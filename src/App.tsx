/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Workspace } from './components/Workspace';
import { LayerSidebar } from './components/LayerSidebar';
import { FrescoExplanationModal } from './components/FrescoExplanationModal';
import { AutoExtractModal } from './components/AutoExtractModal';
import { VectorizeModal } from './components/VectorizeModal';
import { ExportModal } from './components/ExportModal';
import { LayerItem, ProjectSettings } from './types/index';
import {
  generateSampleStickerSheet,
  cropCanvas,
  getNonTransparentBounds,
  fileToCanvas,
} from './utils/canvasHelpers';
import { findConnectedComponents, expandBoundingBox } from './utils/segmentationCore';
import { vectorizeCanvas } from './utils/vectorizer';

export default function App() {
  const [settings, setSettings] = useState<ProjectSettings>({
    name: 'Progetto_Vettoriale_Fresco',
    width: 2048,
    height: 1536,
    dpi: 300,
    backgroundColor: 'transparent',
  });

  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'vector' | 'wireframe' | 'raster'>('vector');
  const [isVectorizingAll, setIsVectorizingAll] = useState<boolean>(false);

  // Modals
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isAutoExtractOpen, setIsAutoExtractOpen] = useState<boolean>(false);
  const [isVectorizeOpen, setIsVectorizeOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

  // Raw canvas for auto-extraction modal
  const [extractionCanvas, setExtractionCanvas] = useState<HTMLCanvasElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load demo sample sticker sheet into separate vector layers
  const loadDemoStickerSheet = () => {
    const sampleCanvas = generateSampleStickerSheet();
    setExtractionCanvas(sampleCanvas);

    // Auto extract components from the sample
    const width = sampleCanvas.width;
    const height = sampleCanvas.height;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Detect connected alpha components
    const boxes = findConnectedComponents(
      width,
      height,
      (x, y) => {
        const a = data[(y * width + x) * 4 + 3];
        return a > 25;
      },
      120
    );

    const layerNames = [
      'Stella Kawaii (Vettore)',
      'Pianeta Saturno (Vettore)',
      'Cuore Pop (Vettore)',
      'Fulmine Elettrico (Vettore)',
      'Diamante Cristallo (Vettore)',
    ];

    const newLayers: LayerItem[] = boxes.map((box, idx) => {
      const padded = expandBoundingBox(box, 8, width, height);
      const cropped = cropCanvas(sampleCanvas, padded);
      const bounds = getNonTransparentBounds(cropped);

      let finalCanvas = cropped;
      let finalX = padded.minX;
      let finalY = padded.minY;

      if (bounds) {
        finalCanvas = cropCanvas(cropped, bounds);
        finalX += bounds.minX;
        finalY += bounds.minY;
      }

      // Generate vector curves for each layer
      const { svg, pathCount } = vectorizeCanvas(finalCanvas, { numberOfColors: 12, curveSmoothness: 'balanced' });

      return {
        id: `demo-vector-layer-${idx + 1}`,
        name: layerNames[idx] || `Elemento Vettoriale ${idx + 1}`,
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        x: finalX,
        y: finalY,
        width: finalCanvas.width,
        height: finalCanvas.height,
        canvas: finalCanvas,
        previewUrl: finalCanvas.toDataURL('image/png'),
        locked: false,
        isVector: true,
        svgContent: svg,
        vectorPathsCount: pathCount,
      };
    });

    setSettings((s) => ({
      ...s,
      width: sampleCanvas.width,
      height: sampleCanvas.height,
    }));
    setLayers(newLayers);
    setActiveLayerId(newLayers[0]?.id || null);
  };

  // Initialize with demo project on first load
  useEffect(() => {
    loadDemoStickerSheet();
  }, []);

  // Vectorize all layers in project
  const handleVectorizeAll = () => {
    if (layers.length === 0) return;
    setIsVectorizingAll(true);

    setTimeout(() => {
      try {
        const updated = layers.map((layer) => {
          const { svg, pathCount } = vectorizeCanvas(layer.canvas, {
            numberOfColors: 12,
            curveSmoothness: 'balanced',
          });
          return {
            ...layer,
            isVector: true,
            svgContent: svg,
            vectorPathsCount: pathCount,
          };
        });

        setLayers(updated);
        setViewMode('vector');
      } catch (err) {
        console.error('Vectorize all failed:', err);
      } finally {
        setIsVectorizingAll(false);
      }
    }, 50);
  };

  // Handle file uploads (supports single image or multiple PNGs simultaneously!)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length === 1) {
      const file = files[0];
      const { canvas } = await fileToCanvas(file);
      setExtractionCanvas(canvas);

      setSettings((s) => ({
        ...s,
        width: Math.max(canvas.width, s.width),
        height: Math.max(canvas.height, s.height),
      }));

      const { svg, pathCount } = vectorizeCanvas(canvas, { numberOfColors: 12 });

      const newLayer: LayerItem = {
        id: `uploaded-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        x: Math.round(Math.max(0, (settings.width - canvas.width) / 2)),
        y: Math.round(Math.max(0, (settings.height - canvas.height) / 2)),
        width: canvas.width,
        height: canvas.height,
        canvas: canvas,
        previewUrl: canvas.toDataURL('image/png'),
        locked: false,
        isVector: true,
        svgContent: svg,
        vectorPathsCount: pathCount,
      };

      setLayers([newLayer]);
      setActiveLayerId(newLayer.id);
      setIsAutoExtractOpen(true);
    } else {
      const loadedLayers: LayerItem[] = [];
      let maxWidth = settings.width;
      let maxHeight = settings.height;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { canvas } = await fileToCanvas(file);
        if (canvas.width > maxWidth) maxWidth = canvas.width;
        if (canvas.height > maxHeight) maxHeight = canvas.height;

        const { svg, pathCount } = vectorizeCanvas(canvas, { numberOfColors: 12 });

        loadedLayers.push({
          id: `batch-${Date.now()}-${i}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          x: 40 + i * 30,
          y: 40 + i * 30,
          width: canvas.width,
          height: canvas.height,
          canvas: canvas,
          previewUrl: canvas.toDataURL('image/png'),
          locked: false,
          isVector: true,
          svgContent: svg,
          vectorPathsCount: pathCount,
        });
      }

      setSettings((s) => ({ ...s, width: maxWidth, height: maxHeight }));
      setLayers(loadedLayers);
      setActiveLayerId(loadedLayers[0]?.id || null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Layer manipulation handlers
  const handleUpdateLayer = (id: string, updates: Partial<LayerItem>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const handleDeleteLayer = (id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (activeLayerId === id) {
      const remaining = layers.filter((l) => l.id !== id);
      setActiveLayerId(remaining[0]?.id || null);
    }
  };

  const handleDuplicateLayer = (id: string) => {
    const target = layers.find((l) => l.id === id);
    if (!target) return;

    const clonedCanvas = document.createElement('canvas');
    clonedCanvas.width = target.canvas.width;
    clonedCanvas.height = target.canvas.height;
    const ctx = clonedCanvas.getContext('2d');
    if (ctx) ctx.drawImage(target.canvas, 0, 0);

    const newLayer: LayerItem = {
      ...target,
      id: `copy-${Date.now()}`,
      name: `${target.name} (Copia)`,
      x: target.x + 25,
      y: target.y + 25,
      canvas: clonedCanvas,
      previewUrl: clonedCanvas.toDataURL('image/png'),
    };

    setLayers((prev) => [newLayer, ...prev]);
    setActiveLayerId(newLayer.id);
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex((l) => l.id === id);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= layers.length) return;

    const newLayers = [...layers];
    const [moved] = newLayers.splice(idx, 1);
    newLayers.splice(targetIdx, 0, moved);
    setLayers(newLayers);
  };

  const handleAddLayer = (newLayer: LayerItem) => {
    // Vectorize new layer automatically
    const { svg, pathCount } = vectorizeCanvas(newLayer.canvas, { numberOfColors: 12 });
    const vectorLayer: LayerItem = {
      ...newLayer,
      isVector: true,
      svgContent: svg,
      vectorPathsCount: pathCount,
    };
    setLayers((prev) => [vectorLayer, ...prev]);
    setActiveLayerId(vectorLayer.id);
  };

  const handleReset = () => {
    if (window.confirm('Vuoi davvero reimpostare il progetto e ricaricare il foglio demo vettoriale?')) {
      loadDemoStickerSheet();
    }
  };

  const handleAddVectorLayer = (svgString: string, layerName: string) => {
    try {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const vCanvas = document.createElement('canvas');
        vCanvas.width = img.width || 400;
        vCanvas.height = img.height || 400;
        const ctx = vCanvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);

        const newLayer: LayerItem = {
          id: `vector-${Date.now()}`,
          name: layerName,
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          x: activeLayer ? activeLayer.x + 30 : 60,
          y: activeLayer ? activeLayer.y + 30 : 60,
          width: vCanvas.width,
          height: vCanvas.height,
          canvas: vCanvas,
          previewUrl: vCanvas.toDataURL('image/png'),
          locked: false,
          isVector: true,
          svgContent: svgString,
          vectorPathsCount: (svgString.match(/<path/g) || []).length,
        };

        setLayers((prev) => [newLayer, ...prev]);
        setActiveLayerId(newLayer.id);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (e) {
      console.error('Failed to create vector layer:', e);
    }
  };

  const handleApplyAllVectorLayers = (updatedLayers: LayerItem[]) => {
    setLayers(updatedLayers);
    setViewMode('vector');
  };

  const handleUpdateSingleVectorLayer = (layerId: string, svg: string, pathCount: number) => {
    setLayers((prev) =>
      prev.map((l) =>
        l.id === layerId
          ? { ...l, isVector: true, svgContent: svg, vectorPathsCount: pathCount }
          : l
      )
    );
    setViewMode('vector');
  };

  const activeLayer = layers.find((l) => l.id === activeLayerId) || null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-white font-sans">
      {/* Hidden File Picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        multiple
        aria-label="Carica immagini PNG o foto"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Top Header */}
      <Header
        settings={settings}
        layerCount={layers.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onUpdateSettings={(s) => setSettings((prev) => ({ ...prev, ...s }))}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenVectorize={() => setIsVectorizeOpen(true)}
        onVectorizeAll={handleVectorizeAll}
        isVectorizingAll={isVectorizingAll}
        onOpenExport={() => setIsExportOpen(true)}
        onReset={handleReset}
        onAutoExtract={() => {
          if (activeLayer) {
            setExtractionCanvas(activeLayer.canvas);
          } else if (layers.length > 0) {
            setExtractionCanvas(layers[0].canvas);
          }
          setIsAutoExtractOpen(true);
        }}
      />

      {/* Main Workspace & Sidebar Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        <Workspace
          settings={settings}
          layers={layers}
          activeLayerId={activeLayerId}
          viewMode={viewMode}
          onSelectLayer={setActiveLayerId}
          onUpdateLayer={handleUpdateLayer}
          onAddLayer={handleAddLayer}
          onAutoExtract={() => {
            if (activeLayer) setExtractionCanvas(activeLayer.canvas);
            else if (layers.length > 0) setExtractionCanvas(layers[0].canvas);
            setIsAutoExtractOpen(true);
          }}
          onOpenVectorize={() => setIsVectorizeOpen(true)}
          onUploadFileClick={() => fileInputRef.current?.click()}
          onLoadDemo={loadDemoStickerSheet}
        />

        {/* Right Layer Sidebar */}
        <LayerSidebar
          layers={layers}
          activeLayerId={activeLayerId}
          onSelectLayer={setActiveLayerId}
          onUpdateLayer={handleUpdateLayer}
          onDeleteLayer={handleDeleteLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onMoveLayer={handleMoveLayer}
          onAddNewLayerClick={() => fileInputRef.current?.click()}
          onOpenVectorizeForLayer={(layer) => {
            setActiveLayerId(layer.id);
            setIsVectorizeOpen(true);
          }}
        />
      </div>

      {/* Fresco Explanation & Guide Modal */}
      <FrescoExplanationModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onStartSample={loadDemoStickerSheet}
      />

      {/* Auto Extraction Modal */}
      <AutoExtractModal
        isOpen={isAutoExtractOpen}
        onClose={() => setIsAutoExtractOpen(false)}
        sourceCanvas={extractionCanvas || layers[0]?.canvas || null}
        onExtractLayers={(newLayers) => {
          // Auto vectorize newly extracted layers!
          const vectorized = newLayers.map((l) => {
            const { svg, pathCount } = vectorizeCanvas(l.canvas, { numberOfColors: 12 });
            return {
              ...l,
              isVector: true,
              svgContent: svg,
              vectorPathsCount: pathCount,
            };
          });
          setLayers(vectorized);
          if (vectorized.length > 0) setActiveLayerId(vectorized[0].id);
        }}
      />

      {/* Vectorize Image Tracing Modal */}
      <VectorizeModal
        isOpen={isVectorizeOpen}
        onClose={() => setIsVectorizeOpen(false)}
        layers={layers}
        activeLayer={activeLayer}
        settings={settings}
        onAddVectorLayer={handleAddVectorLayer}
        onApplyAllVectorLayers={handleApplyAllVectorLayers}
        onUpdateSingleVectorLayer={handleUpdateSingleVectorLayer}
      />

      {/* Export to Fresco Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        settings={settings}
        layers={layers}
      />
    </div>
  );
}
