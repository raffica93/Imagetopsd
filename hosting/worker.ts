/** @license SPDX-License-Identifier: Apache-2.0 */
import assets from 'virtual:fresco-assets';
import { handleSemanticWorker, jsonResponse } from './semanticWorker';
import type { SemanticEnvironment } from '../server/semanticApi';
const active = new Set<string>();
export default {
  async fetch(
    request: Request,
    environment: SemanticEnvironment = {},
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health')
      return jsonResponse({
        status: 'ok',
        runtime: 'worker',
        hasApiKey: Boolean(environment.GEMINI_API_KEY),
      });
    if (url.pathname === '/api/segment-semantic') {
      const client =
        request.headers.get('oai-authenticated-user-id') ??
        request.headers.get('CF-Connecting-IP') ??
        'local';
      if (active.has(client))
        return jsonResponse(
          { error: 'Un’analisi è già in corso. Attendi il risultato.' },
          429,
        );
      active.add(client);
      try {
        return await handleSemanticWorker(request, environment);
      } finally {
        active.delete(client);
      }
    }
    if (url.pathname.startsWith('/api/'))
      return jsonResponse({ error: 'Percorso non disponibile.' }, 404);
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Metodo non consentito', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    const asset =
      assets[url.pathname] ??
      (!url.pathname.startsWith('/assets/')
        ? assets['/index.html']
        : undefined);
    if (!asset) return new Response('Risorsa non trovata', { status: 404 });
    const headers = {
      'Content-Type': asset.type,
      'Cache-Control': url.pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      ETag: asset.etag,
      'X-Content-Type-Options': 'nosniff',
    };
    if (request.headers.get('If-None-Match') === asset.etag)
      return new Response(null, { status: 304, headers });
    const content = asset.binary
      ? Uint8Array.from(atob(asset.content), (c) => c.charCodeAt(0))
      : asset.content;
    return new Response(request.method === 'HEAD' ? null : content, {
      headers,
    });
  },
};
