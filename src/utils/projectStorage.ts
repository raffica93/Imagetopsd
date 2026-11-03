import type { Project, ProjectSettings, BlendMode } from '../types';
import {
  MAX_EDGE,
  MAX_IMAGE_PIXELS,
  MAX_PROJECT_PIXELS,
  MAX_LAYERS,
  MAX_FILE_BYTES,
  MAX_PROJECT_FILE_BYTES,
} from '../types';
import {
  canvasBlob,
  blobToCanvas,
  makeLayer,
  validateBudget,
} from './canvasHelpers';

interface StoredLayer {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
  locked: boolean;
  image: Blob;
}
export interface StoredProject {
  version: 1;
  settings: ProjectSettings;
  layers: StoredLayer[];
}

export async function serializeProject(
  project: Project,
): Promise<StoredProject> {
  const layers: StoredLayer[] = [];
  for (const l of project.layers)
    layers.push({
      name: l.name,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      opacity: l.opacity,
      blendMode: l.blendMode,
      visible: l.visible,
      locked: l.locked,
      pixelWidth: l.canvas.width,
      pixelHeight: l.canvas.height,
      image: await canvasBlob(l.canvas),
    });
  return { version: 1, settings: project.settings, layers };
}

const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const dimension = (v: unknown): v is number =>
  finite(v, 1, MAX_EDGE) && Number.isInteger(v);
export function validateStoredProject(
  value: unknown,
): asserts value is StoredProject {
  const p = value as StoredProject;
  if (
    !p ||
    p.version !== 1 ||
    !p.settings ||
    !Array.isArray(p.layers) ||
    !p.layers.length ||
    p.layers.length > MAX_LAYERS
  )
    throw new Error('Progetto non valido o versione non supportata.');
  const s = p.settings;
  if (
    typeof s.name !== 'string' ||
    !s.name.trim() ||
    s.name.length > 80 ||
    !dimension(s.width) ||
    !dimension(s.height) ||
    ![72, 150, 300].includes(s.dpi) ||
    !['transparent', 'white'].includes(s.backgroundColor)
  )
    throw new Error('Impostazioni del progetto non valide.');
  let pixelCount = 0;
  for (const l of p.layers) {
    if (
      !l ||
      typeof l.name !== 'string' ||
      !l.name.trim() ||
      l.name.length > 100 ||
      !dimension(l.pixelWidth) ||
      !dimension(l.pixelHeight) ||
      l.pixelWidth * l.pixelHeight > MAX_IMAGE_PIXELS ||
      !finite(l.width, 1, MAX_EDGE) ||
      !finite(l.height, 1, MAX_EDGE) ||
      !finite(l.x, -MAX_EDGE, MAX_EDGE) ||
      !finite(l.y, -MAX_EDGE, MAX_EDGE) ||
      !finite(l.opacity, 0, 1) ||
      !['normal', 'multiply', 'screen'].includes(l.blendMode) ||
      typeof l.visible !== 'boolean' ||
      typeof l.locked !== 'boolean'
    )
      throw new Error('Uno dei livelli del progetto non è valido.');
    pixelCount += l.pixelWidth * l.pixelHeight;
  }
  if (pixelCount > MAX_PROJECT_PIXELS)
    throw new Error('Il progetto supera il limite di memoria per iPad.');
}

export async function deserializeProject(
  stored: StoredProject,
): Promise<Project> {
  validateStoredProject(stored);
  const layers = [];
  for (const l of stored.layers) {
    if (!(l.image instanceof Blob) || l.image.size > MAX_FILE_BYTES)
      throw new Error('Immagine del livello non valida.');
    const { canvas } = await blobToCanvas(l.image, {
      width: l.pixelWidth,
      height: l.pixelHeight,
    });
    layers.push({
      ...makeLayer(canvas, l.name, l.x, l.y),
      width: l.width,
      height: l.height,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      blendMode: l.blendMode,
    });
  }
  validateBudget(layers);
  return {
    settings: stored.settings,
    layers,
    activeLayerId: layers[0]?.id ?? null,
  };
}

let databasePromise: Promise<IDBDatabase> | undefined;
function database() {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('frescolayers', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Salvataggio locale non disponibile.'));
    request.onblocked = () =>
      reject(new Error('Chiudi le altre schede di FrescoLayers per salvare.'));
  });
  return databasePromise;
}

export async function writeDraft(value: StoredProject | null) {
  const db = await database();
  // WebKit can reject Blob records even when IndexedDB itself is available.
  // Encode before opening the transaction so async work cannot expire it.
  const record = value && {
    ...value,
    layers: await Promise.all(
      value.layers.map(async ({ image, ...layer }) => ({
        ...layer,
        image: await image.arrayBuffer(),
      })),
    ),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    if (record) tx.objectStore('projects').put(record, 'current');
    else tx.objectStore('projects').delete('current');
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(
        new Error('Spazio locale insufficiente. Salva una copia del progetto.'),
      );
  });
}
export async function readDraft() {
  const db = await database();
  type DiskProject = Omit<StoredProject, 'layers'> & {
    layers: (Omit<StoredLayer, 'image'> & { image: ArrayBuffer | Blob })[];
  };
  const record = await new Promise<DiskProject | undefined>(
    (resolve, reject) => {
      const req = db
        .transaction('projects', 'readonly')
        .objectStore('projects')
        .get('current');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(new Error('Impossibile recuperare il progetto salvato.'));
    },
  );
  if (!record) return undefined;
  validateStoredProject(record);
  return {
    ...record,
    layers: record.layers.map((layer) => ({
      ...layer,
      image:
        layer.image instanceof ArrayBuffer
          ? new Blob([layer.image], { type: 'image/png' })
          : layer.image,
    })),
  };
}

export async function exportProject(project: Project): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip(),
    stored = await serializeProject(project);
  const layers = stored.layers.map(({ image, ...l }, i) => {
    const file = `layers/${i}.png`;
    zip.file(file, image);
    return { ...l, file };
  });
  zip.file(
    'project.json',
    JSON.stringify({ version: 1, settings: stored.settings, layers }),
  );
  // PNGs are compressed already; STORE keeps project saving fast on tablet.
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export async function importProject(file: File): Promise<Project> {
  if (file.size > MAX_PROJECT_FILE_BYTES)
    throw new Error('Il file progetto supera 64 MB.');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  // Bound declared uncompressed sizes before inflating any entry (ZIP bombs).
  let expanded = 0;
  const entries = Object.values(zip.files);
  if (entries.length > MAX_LAYERS + 3)
    throw new Error('Archivio progetto non valido.');
  for (const entry of entries) {
    if (entry.dir) continue;
    const size = (entry as unknown as { _data: { uncompressedSize: number } })
      ._data.uncompressedSize;
    if (!finite(size, 0, MAX_IMAGE_PIXELS * 4 + 65536))
      throw new Error('Contenuto del progetto troppo grande.');
    expanded += size;
  }
  if (expanded > MAX_PROJECT_PIXELS * 4 + 65536)
    throw new Error('Contenuto del progetto troppo grande.');
  const manifest = zip.file('project.json');
  if (!manifest)
    throw new Error('Questo file non contiene un progetto FrescoLayers.');
  const manifestText = await manifest.async('string');
  if (manifestText.length > 65536)
    throw new Error('Manifesto del progetto troppo grande.');
  const parsed = JSON.parse(manifestText);
  validateStoredProject(parsed);
  const stored: StoredProject = { ...parsed, layers: [] };
  for (let i = 0; i < parsed.layers.length; i++) {
    const l = parsed.layers[i] as StoredLayer & { file: string };
    if (l.file !== `layers/${i}.png`)
      throw new Error('Riferimento al livello non valido.');
    const image = zip.file(l.file);
    if (!image) throw new Error('Manca un’immagine del progetto.');
    const bytes = await image.async('uint8array');
    // Validate PNG dimensions before decoding.
    if (
      bytes.length < 24 ||
      bytes[0] !== 137 ||
      bytes[1] !== 80 ||
      bytes[2] !== 78 ||
      bytes[3] !== 71
    )
      throw new Error('Immagine del progetto non valida.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      view.getUint32(16) !== l.pixelWidth ||
      view.getUint32(20) !== l.pixelHeight
    )
      throw new Error('Dimensioni del livello non valide.');
    stored.layers.push({
      ...l,
      image: new Blob([bytes as Uint8Array<ArrayBuffer>], {
        type: 'image/png',
      }),
    });
  }
  return deserializeProject(stored);
}
