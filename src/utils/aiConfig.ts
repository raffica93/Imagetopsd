/** One provider and one default model, shared by settings and both server runtimes. */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const COMPLEXITY_PROFILES = {
  essential: {
    name: 'Essenziale',
    hint: 'Poche parti, ben raggruppate',
    example: 'Un’armatura intera, l’elmo e l’arma.',
    instruction:
      'Aim for 4-6 main editable objects, fewer for simple subjects. Keep a complete armor or outfit together; group eyes and mouth with exposed skin. Separate hair, exposed skin, major equipment and clothing when visible. Do not split an object into its components.',
  },
  balanced: {
    name: 'Bilanciata',
    hint: 'Le parti principali, separate',
    example: 'Armatura superiore e inferiore, elmo e arma.',
    instruction:
      'Aim for 7-10 useful functional parts, fewer for simple subjects. Distinguish upper and lower armor or garments; separate visible hair, skin, eyes, mouth and major accessories. Group repeated small details. Avoid micro-fragments.',
  },
  detailed: {
    name: 'Dettagliata',
    hint: 'Anche i componenti visibili',
    example: 'Corazza, spallacci, guanti, gambali e arma.',
    instruction:
      'Aim for 10-14 meaningful visible components, fewer for simple subjects. Split armor into visible breastplate, pauldrons, gauntlets, leg armor and boots when present. Distinguish main anatomical features and equipment. Group symmetrical or repeated tiny elements. Do not invent hidden parts or list texture, individual strokes or tiny marks.',
  },
} as const;
export type AnalysisComplexity = keyof typeof COMPLEXITY_PROFILES;
export function isAnalysisComplexity(
  value: unknown,
): value is AnalysisComplexity {
  return typeof value === 'string' && Object.hasOwn(COMPLEXITY_PROFILES, value);
}
export function configuredModel(environment: { GEMINI_MODEL?: string }) {
  const model = (environment.GEMINI_MODEL || DEFAULT_MODEL)
    .trim()
    .replace(/^models\//, '');
  return /^gemini-[a-z0-9][a-z0-9.-]{0,64}$/.test(model)
    ? model
    : DEFAULT_MODEL;
}
