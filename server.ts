/** @license SPDX-License-Identifier: Apache-2.0 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSemanticHandler } from './server/semanticApi.ts';

export function createApp(handler = createSemanticHandler()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '24mb' }));
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', hasApiKey: Boolean(process.env.GEMINI_API_KEY) }),
  );

  // Bound concurrent requests per client. Never log request bodies or credentials.
  const active = new Set<string>();
  app.post('/api/segment-semantic', async (req, res) => {
    const client = req.ip ?? 'local';
    if (active.has(client))
      return res
        .status(429)
        .json({ error: 'Un’analisi è già in corso. Attendi il risultato.' });
    active.add(client);
    res.setHeader('Cache-Control', 'no-store');
    try {
      await handler(req, res);
    } finally {
      active.delete(client);
    }
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) return next(error);
      const status = (error as { status?: number })?.status;
      res.status(status === 413 ? 413 : 400).json({
        error:
          status === 413
            ? 'Immagine troppo grande. Riducila e riprova.'
            : 'Richiesta non valida.',
      });
    },
  );
  return app;
}
async function start() {
  const app = createApp();
  const root = path.dirname(fileURLToPath(import.meta.url));
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (_req, res) =>
      res.sendFile(path.join(root, 'dist/index.html')),
    );
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const hostIndex = args.indexOf('--host');
  const cliPort =
    portIndex >= 0 && args[portIndex + 1] ? Number(args[portIndex + 1]) : NaN;
  const host =
    hostIndex >= 0 && args[hostIndex + 1] ? args[hostIndex + 1] : '0.0.0.0';
  // CLI --port flag takes strict precedence over process.env.PORT
  const port =
    Number.isInteger(cliPort) && cliPort > 0 && cliPort <= 65535
      ? cliPort
      : Number(process.env.PORT) || 3000;

  const server = app.listen(port, host, () => {
    console.log(`FrescoLayers: http://${host}:${port}`);
  });
  server.on('error', (err) => {
    console.error('Server listen error:', err);
  });
}

const isMain =
  Boolean(process.argv[1]) &&
  !process.env.NODE_TEST_CONTEXT &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    path.basename(process.argv[1]) === 'server.ts');

if (isMain) {
  void start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

