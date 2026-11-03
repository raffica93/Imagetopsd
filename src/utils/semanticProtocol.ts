export const SEMANTIC_LABELS = [
  'Tratto',
  'Accessori',
  'Occhi',
  'Bocca',
  'Capelli',
  'Pelle',
  'Vestiti',
  'Sfondo',
  'Da assegnare',
] as const;
export type DynamicPartId = `part:${number}`;
export type SemanticLabel = (typeof SEMANTIC_LABELS)[number] | DynamicPartId;
export const MAX_DETECTED_PARTS = 14;
export interface DetectedPart {
  id: DynamicPartId;
  name: string;
  description: string;
  box_2d: [number, number, number, number];
}
export interface SemanticInventory {
  id: string;
  subject: string;
  /** Front to back. System layers are added separately. */
  parts: DetectedPart[];
}
/** Nested details sit above the larger region containing them; preserve other proposed ordering. */
export function orderDetectedParts(parts: DetectedPart[]): DetectedPart[] {
  const area = (p: DetectedPart) =>
    (p.box_2d[2] - p.box_2d[0]) * (p.box_2d[3] - p.box_2d[1]);
  const precedes = (small: DetectedPart, large: DetectedPart) => {
    const size = area(small);
    const overlap =
      Math.max(
        0,
        Math.min(small.box_2d[2], large.box_2d[2]) -
          Math.max(small.box_2d[0], large.box_2d[0]),
      ) *
      Math.max(
        0,
        Math.min(small.box_2d[3], large.box_2d[3]) -
          Math.max(small.box_2d[1], large.box_2d[1]),
      );
    return size < area(large) * 0.65 && overlap >= size * 0.8;
  };
  const remaining = [...parts],
    ordered: DetectedPart[] = [];
  while (remaining.length) {
    const next = remaining.findIndex(
      (candidate) =>
        !remaining.some(
          (other) => other !== candidate && precedes(other, candidate),
        ),
    );
    ordered.push(remaining.splice(next < 0 ? 0 : next, 1)[0]);
  }
  return ordered;
}
export function isDynamicPartId(value: unknown): value is DynamicPartId {
  return (
    typeof value === 'string' &&
    /^part:[1-9]\d?$/.test(value) &&
    Number(value.slice(5)) <= MAX_DETECTED_PARTS
  );
}
export function isSemanticLabel(value: unknown): value is SemanticLabel {
  return (
    SEMANTIC_LABELS.includes(value as (typeof SEMANTIC_LABELS)[number]) ||
    isDynamicPartId(value)
  );
}
const validBox = (box: unknown): box is DetectedPart['box_2d'] =>
  Array.isArray(box) &&
  box.length === 4 &&
  box.every(
    (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000,
  ) &&
  box[0] < box[2] &&
  box[1] < box[3];
const safeText = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  !!value.trim() &&
  value.length <= max &&
  !/[\u0000-\u001f\u007f]/.test(value);

/** Discovery proposes names and rough locations, never pixel selections. */
export function validateSemanticInventory(
  value: unknown,
  requireIds = true,
): SemanticInventory {
  const raw = value as SemanticInventory;
  if (
    !raw ||
    !safeText(raw.subject, 160) ||
    !Array.isArray(raw.parts) ||
    !raw.parts.length ||
    raw.parts.length > MAX_DETECTED_PARTS
  )
    throw new Error(
      'Elenco delle parti non valido. Riprova il riconoscimento.',
    );
  if (
    requireIds &&
    (typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id))
  )
    throw new Error('Identificativo dell’analisi non valido.');
  const ids = new Set<string>(),
    names = new Set<string>();
  const parts = raw.parts.map((item, index) => {
    if (
      !item ||
      !safeText(item.name, 64) ||
      !safeText(item.description, 400) ||
      !validBox(item.box_2d)
    )
      throw new Error('Nome, descrizione o posizione di una parte non validi.');
    const cleanName = item.name.trim().replace(/_/g, ' ').replace(/\s+/g, ' ');
    const name = requireIds
        ? item.name.trim()
        : cleanName.charAt(0).toLocaleUpperCase('it') + cleanName.slice(1),
      key = name.toLocaleLowerCase('it');
    const id: DynamicPartId = requireIds ? item.id : `part:${index + 1}`;
    if (
      !isDynamicPartId(id) ||
      ids.has(id) ||
      names.has(key) ||
      [
        'tratto',
        'sfondo',
        'da assegnare',
        'originale',
        'originale (recupero)',
      ].includes(key)
    )
      throw new Error('Le parti devono avere nomi e identificativi distinti.');
    ids.add(id);
    names.add(key);
    return {
      id,
      name,
      description: item.description.trim(),
      box_2d: [...item.box_2d] as DetectedPart['box_2d'],
    };
  });
  return {
    id: requireIds ? raw.id : crypto.randomUUID(),
    subject: raw.subject.trim(),
    parts: requireIds ? parts : orderDetectedParts(parts),
  };
}
export interface SemanticPart {
  id: string;
  label: SemanticLabel;
  box_2d: [number, number, number, number];
  /** Approximate normalized contours, including AI results and explicit demos. */
  polygon?: [number, number][];
  mask?: string;
  maskPixels?: Uint8Array;
  confidence?: number;
  description?: string;
}

export function validateSemanticParts(
  value: unknown,
  requirePixelMasks = false,
  allowedLabels: readonly SemanticLabel[] = SEMANTIC_LABELS,
): SemanticPart[] {
  const list = Array.isArray(value)
    ? value
    : (value as { parts?: unknown })?.parts;
  if (!Array.isArray(list) || !list.length || list.length > 40)
    throw new Error(
      'La risposta non contiene maschere utilizzabili. Riprova l’analisi.',
    );
  let bytes = 0;
  return list.map((item, index) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !allowedLabels.includes(item.label) ||
      item.label === 'Da assegnare'
    )
      throw new Error('Etichetta della maschera non valida.');
    const box = item.box_2d;
    if (
      !Array.isArray(box) ||
      box.length !== 4 ||
      !box.every(
        (v: unknown) =>
          typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000,
      ) ||
      box[0] >= box[2] ||
      box[1] >= box[3]
    )
      throw new Error('Coordinate della maschera non valide.');
    const part: SemanticPart = {
      id: `part-${index}`,
      label: item.label,
      box_2d: [...box] as SemanticPart['box_2d'],
    };
    if (typeof item.mask === 'string') {
      const encoded = item.mask
        .replace(/^data:image\/png;base64,/, '')
        .replace(/\s/g, '');
      bytes += encoded.length;
      if (
        !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
        encoded.length > 2_800_000 ||
        bytes > 16_000_000
      )
        throw new Error(
          'La maschera restituita non è un PNG valido o è troppo grande.',
        );
      part.mask = encoded;
    } else if (requirePixelMasks) {
      throw new Error(
        'L’AI ha restituito solo sagome o rettangoli, senza maschere pixel. L’immagine non è stata modificata.',
      );
    }
    if (!part.mask) {
      if (
        !Array.isArray(item.polygon) ||
        item.polygon.length < 3 ||
        item.polygon.length > 2000 ||
        !item.polygon.every(
          (p: unknown) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every(
              (v) =>
                typeof v === 'number' &&
                Number.isFinite(v) &&
                v >= 0 &&
                v <= 1000,
            ),
        )
      )
        throw new Error('Contorno di selezione non valido.');
      part.polygon = item.polygon.map((p: number[]) => [p[0], p[1]]);
    }
    return part;
  });
}

/** Keep only independently valid AI regions, and explicitly report rejected ones. */
export function validateSemanticResponse(
  value: unknown,
  allowedLabels: readonly SemanticLabel[] = SEMANTIC_LABELS,
) {
  const raw = (value as { parts?: unknown })?.parts;
  if (!Array.isArray(raw) || !raw.length || raw.length > 40)
    throw new Error('Nessun contorno utilizzabile.');
  const parts: SemanticPart[] = [];
  for (const item of raw) {
    try {
      const [part] = validateSemanticParts([item], false, allowedLabels);
      parts.push({ ...part, id: `part-${parts.length}` });
    } catch {}
  }
  if (!parts.length) throw new Error('Nessun contorno utilizzabile.');
  return { parts, discardedParts: raw.length - parts.length };
}
