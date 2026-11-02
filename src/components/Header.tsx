import React from 'react';
import {
  Layers,
  Sparkles,
  HelpCircle,
  Download,
  Share2,
  Maximize2,
  RotateCcw,
  BookOpen,
  FileCheck2,
  Workflow,
  Eye,
} from 'lucide-react';
import { ProjectSettings } from '../types/index';

interface HeaderProps {
  settings: ProjectSettings;
  layerCount: number;
  viewMode: 'raster' | 'vector' | 'wireframe';
  onViewModeChange: (mode: 'raster' | 'vector' | 'wireframe') => void;
  onUpdateSettings: (settings: Partial<ProjectSettings>) => void;
  onOpenGuide: () => void;
  onOpenVectorize: () => void;
  onVectorizeAll: () => void;
  isVectorizingAll?: boolean;
  onOpenExport: () => void;
  onReset: () => void;
  onAutoExtract: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  layerCount,
  viewMode,
  onViewModeChange,
  onUpdateSettings,
  onOpenGuide,
  onOpenVectorize,
  onVectorizeAll,
  isVectorizingAll = false,
  onOpenExport,
  onReset,
  onAutoExtract,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md z-30">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              FrescoLayers <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">Livelli Vettoriali & Fresco</span>
            </h1>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Vettorializza PNG in livelli SVG e PSD per Adobe Fresco su iPad
          </p>
        </div>
      </div>

      {/* Center: View Mode (Raster vs Vector vs Tracciati Wireframe) */}
      <div className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-lg p-0.5 text-xs">
        <button
          type="button"
          onClick={() => onViewModeChange('vector')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
            viewMode === 'vector'
              ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Visualizza tela renderizzata con tracciati vettoriali SVG nitidi"
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Vettoriale (SVG)</span>
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange('wireframe')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
            viewMode === 'wireframe'
              ? 'bg-indigo-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Mostra i contorni geometrici e percorsi vettoriali (Wireframe)"
        >
          <Workflow className="w-3.5 h-3.5" />
          <span>Tracciati</span>
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange('raster')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
            viewMode === 'raster'
              ? 'bg-slate-700 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Visualizza pixel raster originali"
        >
          <span>Pixel</span>
        </button>
      </div>

      {/* Canvas Dimensions & Presets */}
      <div className="hidden xl:flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-xs text-slate-300">
        <Maximize2 className="w-3 h-3 text-slate-400" />
        <select
          aria-label="Preset Dimensioni iPad"
          value={`${settings.width}x${settings.height}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            if (w && h) onUpdateSettings({ width: w, height: h });
          }}
          className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
        >
          <option value="2048x1536" className="bg-slate-900">iPad 9.7"/10.2" (2048 × 1536)</option>
          <option value="2388x1668" className="bg-slate-900">iPad Pro 11" (2388 × 1668)</option>
          <option value="2732x2048" className="bg-slate-900">iPad Pro 12.9" (2732 × 2048)</option>
          <option value="2360x1640" className="bg-slate-900">iPad Air 10.9" (2360 × 1640)</option>
          <option value="1200x900" className="bg-slate-900">Preset Demo (1200 × 900)</option>
          <option value="2000x2000" className="bg-slate-900">Quadrato HD 300 DPI (2000 × 2000)</option>
        </select>
        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold px-1 py-0.5 rounded">300 DPI</span>
      </div>

      {/* Actions */}
      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
        {/* Guida Fresco iPad */}
        <button
          onClick={onOpenGuide}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium transition cursor-pointer"
          title="Guida passo-passo per aprire i livelli vettoriali su Adobe Fresco su iPad"
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Guida Fresco iPad</span>
        </button>

        {/* Separazione Automatica */}
        <button
          onClick={onAutoExtract}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-800 text-xs font-medium transition cursor-pointer"
          title="Rileva e separa automaticamente tutti gli elementi in livelli"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Separa</span>
        </button>

        {/* Vettorializza Tutto in Livelli */}
        <button
          onClick={onVectorizeAll}
          disabled={isVectorizingAll || layerCount === 0}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
          title="Vettorializza istantaneamente tutti i livelli PNG in tracciati SVG"
        >
          <FileCheck2 className={`w-3.5 h-3.5 ${isVectorizingAll ? 'animate-spin' : 'text-rose-200'}`} />
          <span>{isVectorizingAll ? 'Vettorializzazione...' : 'Vettorializza Tutto'}</span>
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition cursor-pointer"
          title="Ricomincia da capo"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Esporta per Fresco */}
        <button
          onClick={onOpenExport}
          disabled={layerCount === 0}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs shadow-lg transition cursor-pointer ${
            layerCount > 0
              ? 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white shadow-rose-600/30'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Esporta per Fresco ({layerCount})</span>
        </button>
      </div>
    </header>
  );
};
