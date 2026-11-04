import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Layers,
  ArrowUpRight,
  ArrowRight,
  Upload,
  FolderOpen,
  Undo2,
  Redo2,
  Download,
  Ellipsis,
  CircleHelp,
  FilePlus2,
  Check,
  Circle,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  X,
  LoaderCircle,
  Pencil,
  CheckCheck,
  Settings2,
} from 'lucide-react';
import type { LayerItem, Project, Tool } from './types';
import { MAX_LAYERS, MAX_PROJECT_PIXELS } from './types';
import {
  fileToCanvas,
  makeLayer,
  validateBudget,
  cutLayer,
  generateSampleStickerSheet,
} from './utils/canvasHelpers';
import { generateWarriorSampleCanvas } from './utils/characterPrototypes';
import { preserveSemanticLayerEdits } from './utils/semanticSegmentation';
import {
  readDraft,
  writeDraft,
  serializeProject,
  deserializeProject,
  importProject,
} from './utils/projectStorage';
import { useProject } from './hooks/useProject';
import { Workspace } from './components/Workspace';
import { LayerPanel } from './components/LayerPanel';
import { Modal } from './components/Modal';
import { ExtractModal } from './components/ExtractModal';
import { ExportModal } from './components/ExportModal';
import { AISettings } from './components/AISettings';

type Dialog =
  'guide' | 'settings' | 'ai' | 'extract' | 'export' | 'replace' | null;
type SaveState = 'saved' | 'saving' | 'error';
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Qualcosa non ha funzionato. Riprova.';

function ProjectSettings({
  project,
  onClose,
  onSave,
}: {
  project: Project;
  onClose: () => void;
  onSave: (name: string, dpi: number, bg: 'transparent' | 'white') => void;
}) {
  const [name, setName] = useState(project.settings.name),
    [dpi, setDpi] = useState(project.settings.dpi);
  return (
    <Modal title="Il tuo progetto" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim(), dpi, project.settings.backgroundColor);
          onClose();
        }}
      >
        <label className="form-field">
          Nome del progetto
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="form-field">
            Risoluzione
            <select
              aria-label="Risoluzione"
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value))}
            >
              {[72, 150, 300].map((n) => (
                <option key={n} value={n}>
                  {n} ppi
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="note">
          Tela di {project.settings.width} × {project.settings.height} pixel,
          adattata alle immagini importate. La risoluzione ppi è un dato di
          stampa: non modifica il numero di pixel.
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Annulla
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!name.trim()}
          >
            Salva modifiche
            <Check size={18} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Welcome({
  onImport,
  onOpen,
  onDemo,
}: {
  onImport: () => void;
  onOpen: () => void;
  onDemo: (type: 'stickers' | 'character') => void;
}) {
  const [sampleStickers] = useState(() => {
    const canvas = generateSampleStickerSheet();
    const url = canvas.toDataURL();
    canvas.width = 1;
    canvas.height = 1;
    return url;
  });
  const [sampleWarrior] = useState(() => {
    const canvas = generateWarriorSampleCanvas();
    const url = canvas.toDataURL();
    canvas.width = 1;
    canvas.height = 1;
    return url;
  });

  return (
    <main className="welcome">
      <div className="welcome-intro">
        <div className="eyebrow">
          <span /> MENO PASSAGGI. PIÙ CREATIVITÀ.
        </div>
        <h1>
          Un’immagine.
          <br />
          <span>Tutti i tuoi livelli.</span>
        </h1>
        <p>
          Riconosci le parti della tua immagine e portale in Adobe Fresco come
          livelli ordinati, con la complessità che scegli tu.
          <br className="desktop-break" /> Il tuo prossimo progetto inizia qui.
        </p>
      </div>
      <div className="welcome-grid">
        <section className="upload-card">
          <div className="upload-icon">
            <Upload size={29} strokeWidth={1.5} />
          </div>
          <h2>Fai spazio alle tue idee.</h2>
          <p>
            Scegli un’illustrazione o una foto.
            <br />
            Separa automaticamente parti, oggetti e tratto.
          </p>
          <button className="button primary" onClick={onImport}>
            Carica immagini
            <ArrowUpRight size={19} />
          </button>
          <span className="formats">
            PNG, JPG, WebP · fino a 30 MB per file
          </span>
          <div className="upload-card-footer">
            <span>Hai già iniziato?</span>
            <button className="text-button" onClick={onOpen}>
              Apri progetto
              <FolderOpen size={16} />
            </button>
          </div>
        </section>

        <div
          className="sample-cards-column"
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          {/* Character Demo Card */}
          <button
            className="sample-card"
            onClick={() => onDemo('character')}
            aria-label="Prova con il Guerriero con Spada"
            style={{ minHeight: '175px' }}
          >
            <div className="sample-card-top" style={{ padding: '12px 18px' }}>
              <span>PARTI DEL SOGGETTO</span>
              <span
                className="sample-tag"
                style={{
                  background: '#ede9fe',
                  borderColor: '#c4b5fd',
                  color: '#6d28d9',
                }}
              >
                ESEMPIO
              </span>
            </div>
            <div
              className="sample-card-bottom"
              style={{ padding: '14px 18px', marginTop: 'auto' }}
            >
              <div>
                <strong>Guerriero con Spada</strong>
                <span>Isola spada, capelli, pelle, occhi e vestiti.</span>
              </div>
              <span className="round-arrow">
                <ArrowUpRight size={20} />
              </span>
            </div>
          </button>

          {/* Stickers Demo Card */}
          <button
            className="sample-card"
            onClick={() => onDemo('stickers')}
            aria-label="Prova con sticker botanici"
            style={{ minHeight: '175px' }}
          >
            <div className="sample-card-top" style={{ padding: '12px 18px' }}>
              <span>OGGETTI SEPARATI</span>
              <span className="sample-tag">STICKER</span>
            </div>
            <div
              className="sample-card-bottom"
              style={{ padding: '14px 18px', marginTop: 'auto' }}
            >
              <div>
                <strong>Sticker Botanici</strong>
                <span>Quattro elementi distanziati su trasparente.</span>
              </div>
              <span className="round-arrow">
                <ArrowUpRight size={20} />
              </span>
            </div>
          </button>
        </div>
      </div>
      <div className="welcome-foot">
        <span>
          <ShieldCheck size={17} />
          Progetti locali. Analisi AI solo con consenso.
        </span>
        <span>
          <CheckCheck size={17} />
          PSD con livelli pixel indipendenti.
        </span>
        <span>
          <Pencil size={17} />
          Pensato per dita e Apple Pencil.
        </span>
      </div>
      <div className="how-it-works">
        <span>
          01 <strong>Carica</strong>
        </span>
        <ArrowRight size={17} />
        <span>
          02 <strong>Separa e sistema</strong>
        </span>
        <ArrowRight size={17} />
        <span>
          03 <strong>Esporta in PSD</strong>
        </span>
      </div>
    </main>
  );
}

export default function App() {
  const { project, commit, reset, select, undo, redo, canUndo, canRedo } =
    useProject();
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(''),
    [dialog, setDialog] = useState<Dialog>(null),
    [tool, setTool] = useState<Tool>('move');
  const [saveState, setSaveState] = useState<SaveState>('saved'),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [drop, setDrop] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    menu = useRef<HTMLDetailsElement>(null);
  const replacement = useRef<(() => void) | null>(null),
    noticeTimer = useRef<number | undefined>(undefined),
    dragDepth = useRef(0),
    saveQueue = useRef<Promise<void>>(Promise.resolve());
  const current = useRef(project);
  current.current = project;
  const currentSave = useRef(saveState);
  currentSave.current = saveState;
  const notify = useCallback((text: string, error = false) => {
    clearTimeout(noticeTimer.current);
    setNotice({ text, error });
    noticeTimer.current = window.setTimeout(
      () => setNotice(null),
      error ? 12000 : 6500,
    );
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const draft = await readDraft();
        if (draft) {
          const restored = await deserializeProject(draft);
          if (alive) {
            reset(restored);
            notify('Progetto recuperato dal salvataggio locale.');
          }
        }
      } catch {
        if (alive) {
          setSaveState('error');
          notify(
            'Recupero locale non disponibile. Puoi aprire una copia .frescolayers e salvarne una nuova.',
            true,
          );
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(noticeTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    let obsolete = false;
    setSaveState('saving');
    const timer = window.setTimeout(async () => {
      try {
        const stored =
          project && project.layers.length
            ? await serializeProject(project)
            : null;
        if (obsolete) return;
        saveQueue.current = saveQueue.current
          .catch(() => {})
          .then(() => writeDraft(stored));
        await saveQueue.current;
        if (!obsolete) setSaveState('saved');
      } catch {
        if (!obsolete) {
          setSaveState('error');
          notify(
            'Salvataggio locale non riuscito. Esporta una copia del progetto per conservarlo.',
            true,
          );
        }
      }
    }, 650);
    return () => {
      obsolete = true;
      clearTimeout(timer);
    };
  }, [project, ready]);

  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (current.current?.layers.length && currentSave.current !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        dialog ||
        busy ||
        !ready ||
        (e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,select,[contenteditable]'))
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dialog, busy, ready, undo, redo]);

  function safeCommit(next: Project | ((p: Project) => Project)) {
    try {
      commit(next);
      return true;
    } catch (e) {
      notify(message(e), true);
      return false;
    }
  }
  function updateLayer(id: string, updates: Partial<LayerItem>) {
    safeCommit((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  }
  function replace(action: () => void) {
    if (project?.layers.length) {
      replacement.current = action;
      setDialog('replace');
    } else action();
  }
  function closeMenu() {
    if (menu.current) menu.current.open = false;
  }
  async function addImages(files: File[]) {
    if (!files.length || busy || !ready) return;
    if (files.length + (project?.layers.length ?? 0) > MAX_LAYERS) {
      notify('Puoi usare fino a 32 livelli. Importa meno immagini.', true);
      return;
    }
    setBusy('Importo le immagini…');
    try {
      // Atomic batch: retain the current project if any image fails.
      const loaded: LayerItem[] = [];
      let resized = false,
        pixelCount = (project?.layers ?? []).reduce(
          (n, l) => n + l.canvas.width * l.canvas.height,
          0,
        );
      for (const file of files) {
        const result = await fileToCanvas(file);
        resized ||= result.resized;
        pixelCount += result.canvas.width * result.canvas.height;
        if (pixelCount > MAX_PROJECT_PIXELS)
          throw new Error(
            'Queste immagini richiedono troppa memoria. Importa meno file o riducine le dimensioni.',
          );
        loaded.push(
          makeLayer(
            result.canvas,
            file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Immagine',
          ),
        );
      }
      const width = Math.max(
          project?.settings.width ?? 1,
          ...loaded.map((l) => l.width),
        ),
        height = Math.max(
          project?.settings.height ?? 1,
          ...loaded.map((l) => l.height),
        );
      loaded.forEach((l) => {
        l.x = Math.round((width - l.width) / 2);
        l.y = Math.round((height - l.height) / 2);
      });
      const next: Project = {
        settings: project
          ? { ...project.settings, width, height }
          : {
              name: files.length === 1 ? loaded[0].name : 'Il mio progetto',
              width,
              height,
              dpi: 300,
              backgroundColor: 'transparent',
            },
        layers: [...loaded.reverse(), ...(project?.layers ?? [])],
        activeLayerId: loaded[0].id,
      };
      validateBudget(next.layers);
      commit(next);
      setTool('move');
      notify(
        resized
          ? 'Immagini importate e ridotte per mantenere il progetto fluido su iPad (massimo 2560 px e 4 MP per immagine).'
          : `${files.length === 1 ? 'Immagine importata' : 'Immagini importate'}. Ora puoi separare e sistemare i livelli.`,
      );
    } catch (e) {
      notify(message(e), true);
    } finally {
      setBusy('');
    }
  }
  async function openProject(file: File | undefined) {
    if (!file || busy || !ready) return;
    setBusy('Apro il progetto…');
    try {
      const next = await importProject(file);
      replace(() => {
        reset(next);
        setTool('move');
        notify('Progetto aperto. Puoi riprendere da dove eri rimasto.');
      });
    } catch (e) {
      notify(`Impossibile aprire il progetto. ${message(e)}`, true);
    } finally {
      setBusy('');
    }
  }
  function demo(type: 'stickers' | 'character' = 'stickers') {
    replace(() => {
      const isCharacter = type === 'character';
      const canvas = isCharacter
        ? generateWarriorSampleCanvas()
        : generateSampleStickerSheet();
      const name = isCharacter ? 'Guerriero con Spada' : 'Sticker botanici';
      const layer = makeLayer(canvas, name);
      reset({
        settings: {
          name: isCharacter ? 'Guerriero Fresco' : 'Piccole cose belle',
          width: canvas.width,
          height: canvas.height,
          dpi: 300,
          backgroundColor: 'transparent',
        },
        layers: [layer],
        activeLayerId: layer.id,
      });
      setTool('move');
      notify(
        isCharacter
          ? 'Personaggio caricato. Tocca “Separa in livelli” per riconoscere e selezionare le sue parti.'
          : 'Esempio pronto. Tocca “Separa in livelli” per isolare i quattro sticker.',
      );
    });
  }
  function duplicate(id: string) {
    safeCommit((p) => {
      const l = p.layers.find((l) => l.id === id)!;
      const copy = {
        ...l,
        id: crypto.randomUUID(),
        name: `${l.name.slice(0, 90)} · copia`,
        x: Math.min(p.settings.width - 16, l.x + 20),
        y: Math.min(p.settings.height - 16, l.y + 20),
        locked: false,
        semanticGroupId: undefined,
        semanticRole: undefined,
        semanticLeft: undefined,
        semanticTop: undefined,
        semanticInventory: undefined,
      };
      const idx = p.layers.indexOf(l),
        layers = [...p.layers];
      layers.splice(idx, 0, copy);
      return { ...p, layers, activeLayerId: copy.id };
    });
  }
  function remove(id: string) {
    if (
      safeCommit((p) => {
        const layers = p.layers.filter((l) => l.id !== id);
        return { ...p, layers, activeLayerId: layers[0]?.id ?? null };
      })
    )
      notify('Livello eliminato. Puoi recuperarlo con Annulla.');
  }
  function reorder(id: string, dir: -1 | 1) {
    safeCommit((p) => {
      const layers = [...p.layers],
        i = layers.findIndex((l) => l.id === id),
        j = i + dir;
      if (j < 0 || j >= layers.length) return p;
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...p, layers };
    });
  }
  function cut(rect: { x: number; y: number; width: number; height: number }) {
    const layer = project?.layers.find((l) => l.id === project.activeLayerId);
    if (!layer || layer.locked) return;
    try {
      const { extracted, remainder } = cutLayer(layer, rect);
      if (
        safeCommit((p) => ({
          ...p,
          layers: p.layers.flatMap((l) =>
            l.id === layer.id ? [extracted, remainder] : [l],
          ),
          activeLayerId: extracted.id,
        }))
      ) {
        setTool('move');
        notify('Ritaglio spostato in un nuovo livello.');
      }
    } catch (e) {
      notify(message(e), true);
    }
  }
  const active = project?.layers.find((l) => l.id === project.activeLayerId);
  const canExtract = !!active && !active.locked && active.visible;
  const semanticGroup = active?.semanticGroupId
    ? (project?.layers.filter(
        (l) => l.semanticGroupId === active.semanticGroupId,
      ) ?? [])
    : [];
  const extractionSource =
    semanticGroup.find((l) => l.semanticRole === 'Originale') ?? active;
  return (
    <div
      className={`app ${project ? 'has-project' : ''}`}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          dragDepth.current++;
          setDrop(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDrop(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDrop(false);
        const files = [...e.dataTransfer.files];
        if (files.length === 1 && files[0].name.endsWith('.frescolayers'))
          void openProject(files[0]);
        else void addImages(files);
      }}
    >
      <input
        className="sr-only"
        tabIndex={-1}
        ref={imageInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        aria-label="Carica immagini"
        onChange={(e) => {
          void addImages([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <input
        className="sr-only"
        tabIndex={-1}
        ref={projectInput}
        type="file"
        accept=".frescolayers"
        aria-label="Apri progetto FrescoLayers"
        onChange={(e) => {
          void openProject(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <header className="app-header">
        <div className="brand">
          <span className="brand-symbol">
            <Layers size={24} strokeWidth={1.7} />
          </span>
          <div>
            Fresco<span>Layers</span>
            <small>IL TUO STUDIO, PIÙ LEGGERO.</small>
          </div>
          <span className="beta-badge">MVP</span>
        </div>
        {project && (
          <button
            className="project-title"
            onClick={() => setDialog('settings')}
          >
            <span>{project.settings.name}</span>
            <ChevronDown size={15} />
          </button>
        )}
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Impostazioni AI"
            onClick={() => setDialog('ai')}
          >
            <Settings2 size={20} />
          </button>
          {project && (
            <>
              <span
                className={`save-state ${saveState}`}
                title={
                  saveState === 'saved'
                    ? 'Salvato solo su questo browser. Esporta il progetto per una copia.'
                    : saveState === 'saving'
                      ? 'Salvataggio sul dispositivo in corso'
                      : 'Esporta una copia per conservare il lavoro'
                }
              >
                {saveState === 'saved' ? (
                  <Check size={14} />
                ) : saveState === 'saving' ? (
                  <Circle size={11} />
                ) : (
                  <CircleHelp size={15} />
                )}
                <span>
                  {saveState === 'saved'
                    ? 'Salvato qui'
                    : saveState === 'saving'
                      ? 'Salvo…'
                      : 'Salva una copia'}
                </span>
              </span>
              <div className="history-controls">
                <button
                  className="icon-button"
                  aria-label="Annulla ultima modifica"
                  disabled={!canUndo || !!busy}
                  onClick={undo}
                >
                  <Undo2 size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Ripristina modifica"
                  disabled={!canRedo || !!busy}
                  onClick={redo}
                >
                  <Redo2 size={19} />
                </button>
              </div>
              <button
                className="button primary export-button"
                disabled={!project.layers.length || !!busy}
                onClick={() => setDialog('export')}
              >
                <Download size={17} />
                <span>Esporta</span>
              </button>
            </>
          )}
          <details className="app-menu" ref={menu}>
            <summary className="icon-button" aria-label="Menu progetto">
              <Ellipsis size={23} />
            </summary>
            <div className="menu-popover">
              <button
                disabled={!!busy || !ready}
                onClick={() => {
                  closeMenu();
                  replace(() => {
                    reset(null);
                    setTool('move');
                  });
                }}
              >
                <FilePlus2 size={17} />
                Nuovo progetto
              </button>
              <button
                disabled={!!busy || !ready}
                onClick={() => {
                  closeMenu();
                  projectInput.current?.click();
                }}
              >
                <FolderOpen size={17} />
                Apri progetto
              </button>
              {project && (
                <button
                  onClick={() => {
                    closeMenu();
                    setDialog('settings');
                  }}
                >
                  <Pencil size={17} />
                  Impostazioni progetto
                </button>
              )}
              <button
                onClick={() => {
                  closeMenu();
                  setDialog('guide');
                }}
              >
                <CircleHelp size={17} />
                Guida rapida
              </button>
            </div>
          </details>
        </div>
      </header>
      {!ready ? (
        <div className="boot-screen">
          <LoaderCircle size={30} className="spin" />
          <p>Preparo il tuo studio…</p>
        </div>
      ) : project ? (
        <>
          <div className="project-strip">
            <div className="project-steps">
              <span>
                <Check size={13} />
                Immagini caricate
              </span>
              <i />
              <strong>
                <Layers size={15} />
                {project.layers.length}{' '}
                {project.layers.length === 1 ? 'livello' : 'livelli'}
              </strong>
              <i />
              <span>Pronto per Fresco</span>
            </div>
            <button
              className="button extract-button"
              disabled={!canExtract || !!busy}
              onClick={() => setDialog('extract')}
            >
              <Sparkles size={17} />
              Separa in livelli
              <ArrowRight size={16} />
            </button>
          </div>
          <main className="editor">
            <Workspace
              project={project}
              tool={tool}
              onTool={setTool}
              onSelect={select}
              onMove={(id, pos) => updateLayer(id, pos)}
              onCut={cut}
            />
            <LayerPanel
              project={project}
              onSelect={select}
              onUpdate={updateLayer}
              onDuplicate={duplicate}
              onDelete={remove}
              onReorder={reorder}
              onAdd={() => imageInput.current?.click()}
            />
          </main>
          <footer className="editor-footer">
            <span>
              <ShieldCheck size={13} />
              Solo sul tuo dispositivo
            </span>
            <span>
              {project.settings.backgroundColor === 'transparent'
                ? 'Sfondo trasparente'
                : 'Sfondo bianco'}
              <b>·</b>
              {project.settings.dpi} ppi
              <button
                className="text-button"
                onClick={() => setDialog('settings')}
              >
                Modifica
              </button>
            </span>
          </footer>
        </>
      ) : (
        <Welcome
          onImport={() => imageInput.current?.click()}
          onOpen={() => projectInput.current?.click()}
          onDemo={demo}
        />
      )}
      {dialog === 'ai' && <AISettings onClose={() => setDialog(null)} />}
      {dialog === 'guide' && (
        <Modal
          title="Dall’immagine al tuo prossimo progetto."
          onClose={() => setDialog(null)}
        >
          <div className="guide-steps">
            <div>
              <span>01</span>
              <section>
                <h3>Carica le immagini</h3>
                <p>
                  Scegli uno o più PNG, JPG o WebP da Foto o File. Il PNG
                  trasparente è ideale per i fogli di sticker. Le immagini
                  grandi vengono ridotte per proteggere la memoria.
                </p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>Separa e sistema</h3>
                <p>
                  Seleziona un livello e tocca “Separa in livelli”: scegli la
                  complessità per avviare riconoscimento e selezione automatici.
                  Con “Ritaglia” sposti una zona rettangolare in un nuovo
                  livello. Trascina per spostare; usa due dita per navigare.
                </p>
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>Porta i livelli in Fresco</h3>
                <p>
                  Esporta un PSD, salvalo in File e aprilo da Adobe Fresco con
                  “Importa e apri”. I livelli sono pixel, non vettori. La
                  separazione non ricostruisce soggetti coperti o parti nascoste
                  di una foto.
                </p>
              </section>
            </div>
          </div>
          <div className="note">
            <strong>Conserva una copia.</strong> Il salvataggio automatico
            recupera l’ultimo progetto su questo browser. Per archiviarlo o
            cambiare dispositivo esporta un “Progetto riapribile”. Usa una sola
            scheda alla volta per lo stesso lavoro.
          </div>
          <div className="modal-footer">
            <span className="subtle">
              Progetti locali. L’analisi AI invia l’immagine a Google.
            </span>
            <button className="button primary" onClick={() => setDialog(null)}>
              Ho capito
              <Check size={18} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'settings' && project && (
        <ProjectSettings
          project={project}
          onClose={() => setDialog(null)}
          onSave={(name, dpi, backgroundColor) =>
            safeCommit((p) => ({
              ...p,
              settings: { ...p.settings, name, dpi, backgroundColor },
            }))
          }
        />
      )}
      {dialog === 'extract' && active && (
        <ExtractModal
          layer={extractionSource!}
          onClose={() => setDialog(null)}
          onSettings={() => setDialog('ai')}
          onApply={(generated, warning) => {
            const layers = preserveSemanticLayerEdits(generated, semanticGroup);
            const applied = safeCommit((p) => ({
              ...p,
              layers: p.layers.flatMap((l) => {
                if (active.semanticGroupId) {
                  if (l.semanticGroupId !== active.semanticGroupId) return [l];
                  return l.id === active.id ? layers : [];
                }
                return l.id === active.id ? layers : [l];
              }),
              activeLayerId: layers[0]?.id ?? null,
            }));
            if (applied)
              notify(
                warning ||
                  'Livelli creati e ordinati. Tratto e sfondo separati automaticamente.',
              );
            return applied;
          }}
        />
      )}
      {dialog === 'export' && project && (
        <ExportModal project={project} onClose={() => setDialog(null)} />
      )}
      {dialog === 'replace' && (
        <Modal
          title="Sostituire il progetto attuale?"
          onClose={() => {
            replacement.current = null;
            setDialog(null);
          }}
        >
          <p className="modal-intro">
            Il progetto attuale e il suo salvataggio locale verranno sostituiti.
            Per conservarlo, esporta prima una copia come “Progetto riapribile”.
          </p>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => {
                replacement.current = null;
                setDialog(null);
              }}
            >
              Annulla
            </button>
            <button
              className="button primary"
              onClick={() => {
                const action = replacement.current;
                replacement.current = null;
                setDialog(null);
                action?.();
              }}
            >
              Sostituisci progetto
              <ArrowRight size={18} />
            </button>
          </div>
        </Modal>
      )}
      {busy && (
        <div className="busy-overlay" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={28} />
          <span>{busy}</span>
        </div>
      )}
      {notice && (
        <div
          className={`toast ${notice.error ? 'toast-error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.error ? <CircleHelp size={19} /> : <Check size={19} />}
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="Chiudi messaggio"
            onClick={() => setNotice(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {drop && (
        <div className="drop-overlay">
          <Upload size={38} />
          <strong>Lascia qui le tue immagini</strong>
          <span>Oppure un progetto .frescolayers</span>
        </div>
      )}
    </div>
  );
}
