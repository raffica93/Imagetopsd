import { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Plus,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import type { LayerItem, Project } from '../types';

function LayerProperties({
  layer,
  onUpdate,
}: {
  layer: LayerItem;
  onUpdate: (updates: Partial<LayerItem>) => void;
}) {
  const [name, setName] = useState(layer.name),
    [opacity, setOpacity] = useState(layer.opacity);
  useEffect(() => setName(layer.name), [layer.name]);
  useEffect(() => setOpacity(layer.opacity), [layer.opacity]);
  const saveName = () => {
    const next = name.trim().slice(0, 100) || layer.name;
    setName(next);
    if (next !== layer.name) onUpdate({ name: next });
  };
  return (
    <div className="layer-properties">
      <div className="section-eyebrow">
        <SlidersHorizontal size={14} /> LIVELLO SELEZIONATO
      </div>
      <label className="field-label" htmlFor="layer-name">
        Nome
      </label>
      <input
        id="layer-name"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <div className="range-label">
        <label htmlFor="opacity">Opacità</label>
        <output>{Math.round(opacity * 100)}%</output>
      </div>
      <input
        id="opacity"
        type="range"
        min="0"
        max="100"
        value={Math.round(opacity * 100)}
        disabled={layer.locked}
        onChange={(e) => setOpacity(Number(e.target.value) / 100)}
        onPointerUp={() => {
          if (opacity !== layer.opacity) onUpdate({ opacity });
        }}
        onBlur={() => {
          if (opacity !== layer.opacity) onUpdate({ opacity });
        }}
        onKeyUp={(e) => {
          if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')
            onUpdate({ opacity });
        }}
      />
      <label className="field-label" htmlFor="blend-mode">
        Fusione
      </label>
      <select
        id="blend-mode"
        value={layer.blendMode}
        disabled={layer.locked}
        onChange={(e) =>
          onUpdate({ blendMode: e.target.value as LayerItem['blendMode'] })
        }
      >
        <option value="normal">Normale</option>
        <option value="multiply">Moltiplica</option>
        <option value="screen">Scolora</option>
      </select>
      <div className="layer-meta">
        <span>
          {Math.round(layer.width)} × {Math.round(layer.height)} px
        </span>
        <span>
          x {layer.x} · y {layer.y}
        </span>
      </div>
    </div>
  );
}

export function LayerPanel({
  project,
  onSelect,
  onUpdate,
  onDuplicate,
  onDelete,
  onReorder,
  onAdd,
}: {
  project: Project;
  onSelect: (id: string) => void;
  onUpdate: (id: string, u: Partial<LayerItem>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  onAdd: () => void;
}) {
  const active = project.layers.find((l) => l.id === project.activeLayerId),
    index = project.layers.findIndex((l) => l.id === project.activeLayerId);
  return (
    <aside className="layer-panel" aria-label="Pannello livelli">
      <div className="panel-heading">
        <h2>
          <Layers size={18} />
          Livelli <span className="count">{project.layers.length}</span>
        </h2>
        <button
          className="icon-button"
          aria-label="Aggiungi immagini come livelli"
          onClick={onAdd}
        >
          <Plus size={20} />
        </button>
      </div>
      <p className="panel-hint">Il primo livello è quello più in alto.</p>
      <div className="layer-list" aria-label="Elenco livelli">
        {project.layers.map((l, i) => (
          <div
            key={l.id}
            className={`layer-row ${l.id === project.activeLayerId ? 'selected' : ''} ${!l.visible ? 'muted' : ''}`}
          >
            <button
              className="layer-select"
              aria-label={`Seleziona ${l.name}`}
              aria-pressed={l.id === project.activeLayerId}
              onClick={() => onSelect(l.id)}
            >
              <span className="layer-thumb checker">
                <img src={l.previewUrl} alt="" />
              </span>
              <span className="layer-text">
                <strong>{l.name}</strong>
                <small>
                  {l.locked ? (
                    <>
                      <LockKeyhole size={11} /> Bloccato
                    </>
                  ) : (
                    `Livello ${project.layers.length - i}`
                  )}
                </small>
              </span>
            </button>
            <button
              className="icon-button visibility-button"
              aria-label={`${l.visible ? 'Nascondi' : 'Mostra'} ${l.name}`}
              aria-pressed={l.visible}
              onClick={() => onUpdate(l.id, { visible: !l.visible })}
            >
              {l.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
        ))}
        {!project.layers.length && (
          <div className="empty-layers">
            <Layers size={28} />
            <p>
              Aggiungi un’immagine
              <br />
              per ricominciare.
            </p>
            <button className="button secondary" onClick={onAdd}>
              Aggiungi immagine
            </button>
          </div>
        )}
      </div>
      <div
        className="layer-actions"
        role="group"
        aria-label="Azioni sul livello selezionato"
      >
        <button
          className="icon-button"
          aria-label="Porta livello sopra"
          disabled={!active || index === 0 || active.locked}
          onClick={() => active && onReorder(active.id, -1)}
        >
          <ArrowUp size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="Porta livello sotto"
          disabled={
            !active || index === project.layers.length - 1 || active.locked
          }
          onClick={() => active && onReorder(active.id, 1)}
        >
          <ArrowDown size={18} />
        </button>
        <span className="divider" />
        <button
          className="icon-button"
          aria-label="Duplica livello"
          disabled={!active}
          onClick={() => active && onDuplicate(active.id)}
        >
          <Copy size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={active?.locked ? 'Sblocca livello' : 'Blocca livello'}
          disabled={!active}
          onClick={() =>
            active && onUpdate(active.id, { locked: !active.locked })
          }
        >
          {active?.locked ? (
            <LockKeyhole size={17} />
          ) : (
            <LockKeyholeOpen size={17} />
          )}
        </button>
        <button
          className="icon-button danger"
          aria-label="Elimina livello"
          disabled={!active || active.locked}
          onClick={() => active && onDelete(active.id)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      {active ? (
        <LayerProperties
          key={active.id}
          layer={active}
          onUpdate={(u) => onUpdate(active.id, u)}
        />
      ) : (
        <p className="no-selection">Tocca un livello per modificarlo.</p>
      )}
    </aside>
  );
}
