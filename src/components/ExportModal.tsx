import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  FileCheck2,
  Archive,
  Layers,
  Sparkles,
  CheckCircle2,
  Tablet,
  FolderOpen,
  Workflow,
} from 'lucide-react';
import { LayerItem, ProjectSettings } from '../types/index';
import { exportToPsd, exportToMultiLayerSvg, exportToZip, shareOrDownloadFile, downloadBlob } from '../utils/psdExport';
import confetti from 'canvas-confetti';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProjectSettings;
  layers: LayerItem[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  settings,
  layers,
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const fireSuccessConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  // Export to Multi-Layer SVG (Vector for Fresco)
  const handleExportSvg = async (useShareSheet: boolean = false) => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const svgString = await exportToMultiLayerSvg(settings, layers);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const filename = `${settings.name || 'fresco_progetto'}_vettoriale.svg`;

      if (useShareSheet) {
        await shareOrDownloadFile(blob, filename, 'Progetto Vettoriale per Adobe Fresco');
      } else {
        downloadBlob(blob, filename);
      }

      setExportSuccess('File SVG vettoriale a più livelli esportato con successo! Pronto per Adobe Fresco.');
      fireSuccessConfetti();
    } catch (err) {
      console.error('SVG export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export to PSD (Adobe Photoshop & Fresco format)
  const handleExportPsd = async (useShareSheet: boolean = false) => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const blob = await exportToPsd(settings, layers);
      const filename = `${settings.name || 'fresco_progetto'}.psd`;

      if (useShareSheet) {
        await shareOrDownloadFile(blob, filename, 'Progetto Livelli per Adobe Fresco');
      } else {
        downloadBlob(blob, filename);
      }

      setExportSuccess('File PSD esportato con successo! Pronto per Adobe Fresco.');
      fireSuccessConfetti();
    } catch (err) {
      console.error('PSD export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export to ZIP bundle
  const handleExportZip = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    try {
      const blob = await exportToZip(settings, layers);
      const filename = `${settings.name || 'fresco_progetto'}_livelli_bundle.zip`;

      downloadBlob(blob, filename);
      setExportSuccess('Archivio ZIP con tutti i file SVG e PNG scaricato!');
      fireSuccessConfetti();
    } catch (err) {
      console.error('ZIP export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-rose-500/20">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Esporta Livelli Vettoriali per Adobe Fresco
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                  {layers.length} Livelli Vettoriali
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Ottimizzato per lavorare con Apple Pencil, Pennelli Vettoriali e Gomma Vettoriale su iPad
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

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {exportSuccess && (
            <div className="bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
          )}

          {/* Cards for Export Options */}
          <div className="space-y-3">
            {/* Option 1: Multi-Layer SVG Vector (Primary for Vector Layers in Adobe Fresco) */}
            <div className="bg-gradient-to-r from-rose-950/60 via-slate-900 to-slate-900 border-2 border-rose-500/70 rounded-xl p-4 space-y-3 shadow-lg ring-1 ring-rose-500/30">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center font-bold text-xs border border-rose-500/40">
                    SVG
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">
                        File Vettoriale Multi-Livello (.svg)
                      </h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40">
                        Consigliato: Livelli Vettoriali
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Tracciati Bézier scalabili all'infinito. In Adobe Fresco ogni elemento si apre come un vero <strong>livello vettoriale</strong>, modificabile con i Pennelli Vettoriali e la Gomma Vettoriale!
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons for SVG */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExportSvg(false)}
                  className="flex-1 min-w-[160px] flex items-center justify-center space-x-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold transition shadow-md shadow-rose-600/30 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Scarica File Vettoriale .SVG ({layers.length} Livelli)</span>
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExportSvg(true)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-xs font-medium transition cursor-pointer"
                  title="Apre il foglio di condivisione di iPad per salvare direttamente su File o inviare a Fresco"
                >
                  <Share2 className="w-4 h-4 text-rose-400" />
                  <span>Condividi Vettore su iPad</span>
                </button>
              </div>
            </div>

            {/* Option 2: PSD Layered (Photoshop / Fresco Pixel Layers) */}
            <div className="bg-slate-800/40 border border-slate-700/70 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
                    PSD
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">
                        File Photoshop PSD (.psd)
                      </h3>
                      <span className="text-[10px] font-medium text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        Livelli Raster / Pixel
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Apri su Fresco preservando opacità e metodi di fusione raster a 300 DPI.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => handleExportPsd(false)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-700/50 text-xs font-semibold transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Scarica File .PSD</span>
                </button>
              </div>
            </div>

            {/* Option 3: ZIP Archive with PNGs + SVGs */}
            <div className="bg-slate-800/40 border border-slate-700/70 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30">
                    ZIP
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      Archivio Completo ZIP (.zip)
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Include il file SVG multi-livello, i singoli file SVG per ogni elemento e la guida Fresco iPad.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex pt-1">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExportZip}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-700/50 text-xs font-semibold transition cursor-pointer"
                >
                  <Archive className="w-4 h-4 text-amber-400" />
                  <span>Scarica Pacchetto ZIP Vettoriale</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick reminder for iPad user */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-rose-300">
              <Tablet className="w-3.5 h-3.5" />
              <span>Come aprire e usare i Livelli Vettoriali in Adobe Fresco su iPad:</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-slate-400">
              <li>Salva il file <strong>.SVG</strong> nell'app <strong>File</strong> del tuo iPad.</li>
              <li>In Adobe Fresco, tocca <strong>"Importa e apri"</strong> in basso a sinistra e seleziona il file .SVG.</li>
              <li>Nel pannello Livelli a destra vedrai l'icona del <strong>livello vettoriale</strong>: tocca lo strumento <strong>Pennelli Vettoriali</strong> per disegnare dettagli scalabili all'infinito, oppure usa la <strong>Gomma Vettoriale</strong> per cancellare percorsi interi o all'incrocio!</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
