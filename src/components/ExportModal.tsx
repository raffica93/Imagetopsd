import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Share2,
  Check,
  FileImage,
  Layers,
  FolderOpen,
  LoaderCircle,
} from 'lucide-react';
import type { Project } from '../types';
import {
  exportToPsd,
  exportToPng,
  safeFilename,
  downloadBlob,
  shareFile,
} from '../utils/psdExport';
import { exportProject } from '../utils/projectStorage';
import { Modal } from './Modal';

type Format = 'psd' | 'png' | 'project';
export function ExportModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>('psd'),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(''),
    [done, setDone] = useState('');
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  async function prepare() {
    setBusy(true);
    setError('');
    setDone('');
    try {
      // Allow the busy state to paint before encoding.
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
      const blob =
        format === 'psd'
          ? await exportToPsd(project)
          : format === 'png'
            ? await exportToPng(project)
            : await exportProject(project);
      const extension = format === 'project' ? 'frescolayers' : format;
      if (alive.current)
        setFile(
          new File(
            [blob],
            `${safeFilename(project.settings.name)}.${extension}`,
            { type: blob.type },
          ),
        );
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Esportazione non riuscita. Prova con un progetto più piccolo.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const formats = [
    {
      id: 'psd' as Format,
      label: 'PSD a livelli',
      detail: 'Per Adobe Fresco e Photoshop',
      icon: Layers,
    },
    {
      id: 'png' as Format,
      label: 'Immagine PNG',
      detail: 'Un’unica immagine con i livelli visibili',
      icon: FileImage,
    },
    {
      id: 'project' as Format,
      label: 'Progetto riapribile',
      detail: 'Conserva tutti i livelli per questa app',
      icon: FolderOpen,
    },
  ];
  const hidden = project.layers.filter((l) => !l.visible).length;
  return (
    <Modal title="Il tuo lavoro, pronto a partire." onClose={onClose}>
      <p className="modal-intro">
        {project.settings.name} · {project.settings.width} ×{' '}
        {project.settings.height} px
      </p>
      <div className="export-formats">
        {formats.map(({ id, label, detail, icon: Icon }) => (
          <button
            key={id}
            className={`format-option ${format === id ? 'chosen' : ''}`}
            disabled={busy}
            aria-pressed={format === id}
            onClick={() => {
              setFormat(id);
              setFile(null);
              setError('');
              setDone('');
            }}
          >
            <span className="format-icon">
              <Icon size={22} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <span className="radio-dot">{format === id && <span />}</span>
          </button>
        ))}
      </div>
      <div className="note">
        {format === 'psd' ? (
          <>
            <strong>{project.layers.length} livelli pixel</strong>, con nomi,
            posizione, trasparenza e opacità.
            {hidden > 0 && ` ${hidden} livelli resteranno nascosti.`} Lo sfondo
            bianco, se attivo, avrà un livello dedicato.
          </>
        ) : format === 'png' ? (
          'Esporta solo ciò che vedi sulla tela. La trasparenza viene conservata se lo sfondo è trasparente.'
        ) : (
          'Scarica una copia .frescolayers. Per riprendere il lavoro, aprila con “Apri progetto”.'
        )}
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {file && (
        <div className="file-ready">
          <Check size={20} />
          <div>
            <strong>File pronto</strong>
            <span>
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        </div>
      )}
      {done && (
        <p className="success-text" role="status">
          {done}
        </p>
      )}
      <div className="modal-footer">
        {file ? (
          <>
            <button
              className="button secondary"
              onClick={() => {
                downloadBlob(file, file.name);
                setDone(
                  'Download avviato. Su iPad trovi il file in File → Download.',
                );
              }}
            >
              <ArrowDownToLine size={18} />
              Scarica file
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  const result = await shareFile(file);
                  if (result !== 'cancelled')
                    setDone(
                      result === 'shared'
                        ? 'File condiviso.'
                        : 'Download avviato.',
                    );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Share2 size={18} />
              Condividi / Salva
            </button>
          </>
        ) : (
          <>
            <button className="button secondary" onClick={onClose}>
              Chiudi
            </button>
            <button
              className="button primary"
              disabled={busy || !project.layers.length}
              onClick={prepare}
            >
              {busy ? (
                <>
                  <LoaderCircle size={18} className="spin" />
                  Preparo il file…
                </>
              ) : (
                <>
                  Prepara{' '}
                  {format === 'project' ? 'progetto' : format.toUpperCase()}
                  <ArrowDownToLine size={18} />
                </>
              )}
            </button>
          </>
        )}
      </div>
      {format === 'psd' && (
        <p className="export-guide">
          <strong>Su iPad:</strong> salva il PSD nell’app File, poi in Adobe
          Fresco scegli “Importa e apri”. I livelli sono pixel, modificabili con
          i pennelli raster.
        </p>
      )}
    </Modal>
  );
}
