import type { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { validateSemanticResponse } from '../src/utils/semanticProtocol.ts';
import {
  getWarriorSemanticGroundTruth,
  getMageSemanticGroundTruth,
} from '../src/utils/characterPrototypes.ts';

export const ALLOWED_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
export const SEGMENT_PROMPT = `Trace the actual VISIBLE contours of the parts of this character illustration. Use these exact labels: Capelli (all scalp hair and long side strands, NOT eyebrows), Pelle (whole face, ears and exposed skin/neck), Occhi (eyes), Bocca (mouth and lips), Vestiti (clothing), Accessori (earrings, hair ties and small objects), Sfondo (outside the character).
Return separate regions for disconnected shapes, e.g. each eye and each earring. Never join them with a bridging polygon. Return at most 16 regions. Follow visible edges with 8-64 vertices per region and fewer for small features. Prefer a short approximate contour over hundreds of points. Do not replace contours with bounding rectangles. Skin may include eyes and mouth: the app will subtract the smaller regions. Do not classify black background as hair. Do not segment lineart.
Return ONLY JSON {"parts":[{"label":"...","box_2d":[ymin,xmin,ymax,xmax],"polygon":[[y,x],...]}]}. All coordinates must be normalized to 0-1000 over the WHOLE image, never negative or above 1000. Each polygon vertex MUST contain exactly TWO numbers [y,x], never four numbers or a rectangle. Only include parts actually visible in this supplied image. Do not invent coordinates or use a template.`;

function statusCode(error: unknown) {
  const value = error as { status?: number; code?: number };
  return value?.status ?? value?.code;
}
export function createSemanticHandler(
  infer?: (
    key: string,
    model: string,
    image: string,
    signal: AbortSignal,
  ) => Promise<string>,
) {
  const generate =
    infer ??
    (async (key, model, image, signal) => {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: image } },
              { text: SEGMENT_PROMPT },
            ],
          },
        ],
        config: {
          abortSignal: signal,
          responseMimeType: 'application/json',
          maxOutputTokens: 32768,
          temperature: 0.2,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              parts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: {
                      type: Type.STRING,
                      enum: [
                        'Capelli',
                        'Pelle',
                        'Occhi',
                        'Bocca',
                        'Vestiti',
                        'Accessori',
                        'Sfondo',
                      ],
                    },
                    box_2d: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    polygon: {
                      type: Type.ARRAY,
                      items: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    },
                  },
                  required: ['label', 'box_2d', 'polygon'],
                },
              },
            },
            required: ['parts'],
          },
        },
      });
      if (response.candidates?.[0]?.finishReason !== 'STOP')
        throw new Error('Incomplete segmentation response');
      return response.text ?? '';
    });
  return async (req: Request, res: Response) => {
    const { image, consent, useMockDemo, demoType, userApiKey } =
      req.body ?? {};
    const model =
      process.env.GEMINI_MODEL ?? req.body?.modelId ?? 'gemini-3.5-flash-lite';
    if (useMockDemo === true) {
      if (!['warrior', 'mage'].includes(demoType))
        return res.status(400).json({
          error:
            'Le sagome di prova sono disponibili soltanto per l’esempio geometrico selezionato.',
        });
      return res.json({
        isMock: true,
        modelUsed: 'Sagome dell’esempio (senza AI)',
        parts:
          demoType === 'mage'
            ? getMageSemanticGroundTruth()
            : getWarriorSemanticGroundTruth(),
      });
    }
    if (consent !== true)
      return res.status(400).json({
        error:
          'Conferma l’invio dell’immagine a Google prima di avviare l’analisi.',
      });
    if (!ALLOWED_MODELS.includes(model))
      return res.status(400).json({
        error:
          'Modello non supportato. Seleziona un modello fra quelli configurati.',
      });
    if (
      typeof image !== 'string' ||
      image.length > 23_000_000 ||
      !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/\r\n]*={0,2}$/.test(
        image,
      )
    )
      return res
        .status(400)
        .json({ error: 'Immagine PNG non valida o troppo grande.' });
    const key =
      (typeof userApiKey === 'string' && userApiKey.length < 512
        ? userApiKey.trim()
        : '') || process.env.GEMINI_API_KEY;
    if (!key)
      return res.status(503).json({
        error:
          'Configura una chiave Google sul server o inseriscila per questa sessione. La foto non è stata analizzata e non verranno usate sagome dimostrative.',
      });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', disconnect);
    try {
      const text = await generate(
        key,
        model,
        image.split(',')[1],
        controller.signal,
      );
      if (controller.signal.aborted) throw new Error('aborted');
      const { parts, discardedParts } = validateSemanticResponse(
        JSON.parse(text),
      );
      return res.json({
        isMock: false,
        modelUsed: model,
        maskFormat: 'polygons',
        parts,
        discardedParts,
      });
    } catch (error) {
      if (res.destroyed) return;
      const status = statusCode(error);
      if (status === 429)
        return res.status(429).json({
          error:
            'Quota Google esaurita. I livelli non sono stati modificati. Riprova quando la quota sarà disponibile.',
        });
      if (status === 401 || status === 403 || status === 400)
        return res.status(400).json({
          error:
            'Google ha rifiutato la richiesta. Verifica chiave, modello e accesso al progetto. I livelli sono al sicuro.',
        });
      if (status === 503)
        return res.status(503).json({
          error:
            'Il modello Google è temporaneamente occupato. Riprova più tardi; non sono state applicate sagome di prova alla foto.',
        });
      if (controller.signal.aborted)
        return res.status(504).json({
          error:
            'Analisi annullata o troppo lenta. Il progetto non è stato modificato.',
        });
      return res.status(502).json({
        error:
          'L’AI non ha restituito contorni di segmentazione validi. Riprova l’analisi o usa la rifinitura manuale; non sono stati applicati risultati dimostrativi.',
      });
    } finally {
      clearTimeout(timer);
      res.off('close', disconnect);
    }
  };
}
