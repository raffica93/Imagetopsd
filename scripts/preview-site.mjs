// Local QA of the exact self-contained Worker artifact; does not publish anything.
import http from 'node:http';
import { Readable } from 'node:stream';
import worker from '../build/site/server/index.js';
const port = Number(process.env.PORT ?? 4177);
const server = http.createServer(async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value))
        for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : Readable.toWeb(req),
      duplex: 'half',
      signal: controller.signal,
    });
    const result = await worker.fetch(request, {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
    });
    res.statusCode = result.status;
    result.headers.forEach((value, name) => res.setHeader(name, value));
    if (result.body) Readable.fromWeb(result.body).pipe(res);
    else res.end();
  } catch {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Worker preview unavailable');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Worker preview: http://127.0.0.1:${port}`),
);
