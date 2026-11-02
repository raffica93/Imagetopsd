import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Layers,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Tablet,
  FolderOpen,
  Palette,
  Info,
} from 'lucide-react';

interface FrescoExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSample: () => void;
}

export const FrescoExplanationModal: React.FC<FrescoExplanationModalProps> = ({
  isOpen,
  onClose,
  onStartSample,
}) => {
  const [activeTab, setActiveTab] = useState<'workflow' | 'vectorVsRaster' | 'ipadFrescoSteps'>('workflow');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Guida Definitiva: Adobe Fresco su iPad</h2>
              <p className="text-xs text-slate-400">
                Capiamo come funziona: Livelli separati, Raster vs Vettoriale e apertura su iPad
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/90 px-4 pt-2 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('workflow')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'workflow'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>1. Come Funziona il Processo</span>
          </button>
          <button
            onClick={() => setActiveTab('vectorVsRaster')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'vectorVsRaster'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>2. Raster vs Vettoriale</span>
          </button>
          <button
            onClick={() => setActiveTab('ipadFrescoSteps')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'ipadFrescoSteps'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tablet className="w-4 h-4" />
            <span>3. I 4 Passaggi su iPad</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-300 text-sm leading-relaxed">
          {activeTab === 'workflow' && (
            <div className="space-y-4">
              <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-indigo-200 text-sm">
                      Perché Adobe Fresco da solo non divide un'immagine piatta?
                    </p>
                    <p className="text-slate-300">
                      Adobe Fresco su iPad è un'app di pittura eccezionale, ma se importi una foto piatta JPG o PNG,
                      Fresco la tratta come <strong>un unico livello piatto</strong>. Fresco non include uno strumento per "spezzettare" automaticamente gli oggetti in livelli distinti.
                    </p>
                    <p className="text-slate-300">
                      <strong>La soluzione professionale:</strong> questa applicazione analizza la tua immagine,
                      ritaglia ogni elemento/PNG su un livello trasparente dedicato, e la impacchetta in un formato
                      <strong> PSD nativo per Photoshop/Fresco</strong> o in <strong>SVG vettoriale</strong>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <h4 className="font-semibold text-white text-xs">Carica o Incolla</h4>
                  <p className="text-slate-400 text-xs">
                    Carica il foglio di sticker, il collage, o seleziona una serie di PNG insieme.
                  </p>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <h4 className="font-semibold text-white text-xs">Separazione Smart</h4>
                  <p className="text-slate-400 text-xs">
                    Il rilevatore isola automaticamente ogni elemento (tramite trasparenza alpha o rimozione sfondo bianco).
                  </p>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <h4 className="font-semibold text-white text-xs">Esporta in PSD o SVG</h4>
                  <p className="text-slate-400 text-xs">
                    Scarica il file .PSD. Su iPad lo apri direttamente in Adobe Fresco con tutti i livelli pronti.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vectorVsRaster' && (
            <div className="space-y-4">
              <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Palette className="w-4 h-4 text-rose-400" />
                  "Devo per forza vettorializzare l'immagine?" — La risposta chiara:
                </h3>
                <p className="text-xs text-slate-300">
                  Dipende dal tipo di lavoro che vuoi fare in Adobe Fresco:
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Opzione 1: Raster PSD */}
                <div className="bg-gradient-to-b from-indigo-950/40 to-slate-900 border border-indigo-700/40 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                      Metodo 1: Livelli Pixel (PSD)
                    </span>
                    <span className="text-emerald-400 text-[10px] font-semibold bg-emerald-500/20 px-1.5 py-0.5 rounded">
                      Consigliato
                    </span>
                  </div>
                  <h4 className="font-semibold text-white text-sm">NON serve vettorializzare</h4>
                  <p className="text-xs text-slate-300">
                    Se l'immagine contiene foto, texture, dettagli sottili, sfumature o colori complessi:
                  </p>
                  <ul className="text-xs text-slate-400 space-y-1.5">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Conserva al 100% i dettagli e i pixel originali</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Compatibile con tutti i Pennelli Pixel, Acquerello dinamico e Olio di Fresco</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Ogni elemento è isolato con trasparenza nel file .PSD</span>
                    </li>
                  </ul>
                </div>

                {/* Opzione 2: Vettoriale SVG */}
                <div className="bg-gradient-to-b from-rose-950/40 to-slate-900 border border-rose-700/40 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                      Metodo 2: Vettoriale (SVG)
                    </span>
                    <span className="text-rose-400 text-[10px] font-semibold bg-rose-500/20 px-1.5 py-0.5 rounded">
                      Tracciati
                    </span>
                  </div>
                  <h4 className="font-semibold text-white text-sm">Sì, Vettorializzazione (Image Tracing)</h4>
                  <p className="text-xs text-slate-300">
                    Se l'immagine è un logo, un disegno al tratto, uno sticker o un'icona:
                  </p>
                  <ul className="text-xs text-slate-400 space-y-1.5">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>Converte i pixel in curve Bézier scalabili all'infinito</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>Compatibile con i Pennelli Vettoriali e la Gomma Vettoriale di Fresco</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>Puoi usare il pulsante "Vettorializza (SVG)" in quest'app con 1 tocco!</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ipadFrescoSteps' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">
                Ecco la sequenza esatta da fare sul tuo iPad dopo aver cliccato <strong>"Esporta Livelli Fresco"</strong>:
              </p>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                  <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    1
                  </div>
                  <div>
                    <h5 className="font-semibold text-white">Scarica o Condividi su iPad</h5>
                    <p className="text-slate-400 mt-0.5">
                      Tocca <strong>"Scarica file PSD"</strong> oppure <strong>"Condividi su iPad"</strong>. Seleziona <em>"Salva su File"</em> (ad esempio nella cartella iCloud Drive o "Sul mio iPad").
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                  <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    2
                  </div>
                  <div>
                    <h5 className="font-semibold text-white">Apri l'app Adobe Fresco su iPad</h5>
                    <p className="text-slate-400 mt-0.5">
                      Avvia Adobe Fresco sul tuo iPad con la tua Apple Pencil pronta.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                  <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    3
                  </div>
                  <div>
                    <h5 className="font-semibold text-white">Tocca "Importa e apri" (in basso a sinistra)</h5>
                    <p className="text-slate-400 mt-0.5">
                      Nella schermata Home di Fresco, guarda la barra laterale sinistra in basso: tocca <strong>"Importa e apri"</strong> e seleziona <strong>"File"</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    4
                  </div>
                  <div>
                    <h5 className="font-semibold text-emerald-300">Tutti i livelli sono separati e pronti!</h5>
                    <p className="text-slate-400 mt-0.5">
                      Fresco apre il documento: guarda il pannello Livelli sulla destra dello schermo. Ogni singolo elemento PNG è un livello indipendente con la sua trasparenza, nome e posizione, pronto per essere modificato, trasformato, mascherato o dipinto!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => {
              onStartSample();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 text-xs font-medium transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Prova con Immagine Demo (Sticker Sheet)</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer"
          >
            Ho capito, andiamo avanti
          </button>
        </div>
      </div>
    </div>
  );
};
