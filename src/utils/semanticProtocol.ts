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
export type SemanticLabel = (typeof SEMANTIC_LABELS)[number];
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
      !SEMANTIC_LABELS.includes(item.label) ||
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
export function validateSemanticResponse(value: unknown) {
  const raw = (value as { parts?: unknown })?.parts;
  if (!Array.isArray(raw) || !raw.length || raw.length > 40)
    throw new Error('Nessun contorno utilizzabile.');
  const parts: SemanticPart[] = [];
  for (const item of raw) {
    try {
      const [part] = validateSemanticParts([item]);
      parts.push({ ...part, id: `part-${parts.length}` });
    } catch {}
  }
  if (!parts.length) throw new Error('Nessun contorno utilizzabile.');
  return { parts, discardedParts: raw.length - parts.length };
}
