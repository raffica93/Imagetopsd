/** @license SPDX-License-Identifier: Apache-2.0 */
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { createSemanticHandler } from '../server/semanticApi';
import type { SemanticEnvironment } from '../server/semanticApi';

export const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
export function jsonResponse(
  value: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}
/** Bind the shared API to Web Requests without an Express or Node HTTP server. */
export async function handleSemanticWorker(
  request: Request,
  environment: SemanticEnvironment = {},
  infer?: Parameters<typeof createSemanticHandler>[0],
): Promise<Response> {
  if (request.method !== 'POST')
    return jsonResponse({ error: 'Metodo non consentito.' }, 405, {
      Allow: 'POST',
    });
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > MAX_REQUEST_BYTES)
    return jsonResponse(
      { error: 'Immagine troppo grande. Riducila e riprova.' },
      413,
    );
  if (
    !/^application\/json(?:;|$)/i.test(
      request.headers.get('Content-Type') ?? '',
    )
  )
    return jsonResponse({ error: 'Richiesta JSON non valida.' }, 400);
  let body: unknown;
  try {
    const reader = request.body?.getReader(),
      decoder = new TextDecoder();
    let text = '',
      size = 0;
    if (!reader) return jsonResponse({ error: 'Richiesta non valida.' }, 400);
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_REQUEST_BYTES) {
          await reader.cancel();
          return jsonResponse(
            { error: 'Immagine troppo grande. Riducila e riprova.' },
            413,
          );
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      body = JSON.parse(text);
      text = '';
    } finally {
      reader.releaseLock();
    }
  } catch {
    return jsonResponse({ error: 'Richiesta non valida.' }, 400);
  }
  if (request.signal.aborted)
    return jsonResponse({ error: 'Analisi annullata.' }, 499);
  let status = 200,
    output: Response | undefined,
    ended = false;
  const response = {
    get writableEnded() {
      return ended;
    },
    get destroyed() {
      return request.signal.aborted;
    },
    status(value: number) {
      status = value;
      return response;
    },
    json(value: unknown) {
      output = jsonResponse(value, status);
      ended = true;
      return response;
    },
    on(_name: string, callback: () => void) {
      request.signal.addEventListener('abort', callback);
      return response;
    },
    off(_name: string, callback: () => void) {
      request.signal.removeEventListener('abort', callback);
      return response;
    },
  };
  try {
    await createSemanticHandler(infer, environment)(
      { body } as ExpressRequest,
      response as unknown as ExpressResponse,
    );
    return output ?? jsonResponse({ error: 'Analisi annullata.' }, 499);
  } catch {
    return jsonResponse(
      { error: 'Analisi non disponibile. Il progetto non è stato modificato.' },
      502,
    );
  }
}
