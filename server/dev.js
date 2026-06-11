// Local dev/test server: serves the API on :8787 and (with --serve-dist)
// the built frontend incl. /bar + /admin rewrites.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from '../api/_core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

app.all(/^\/api\/.*/, (req, res) => {
  const { status, json } = route(req.method, req.path, req.body || {});
  res.set('Cache-Control', 'no-store').status(status).json(json);
});

if (process.argv.includes('--serve-dist')) {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('/bar', (_, res) => res.sendFile(path.join(dist, 'bar.html')));
  app.get('/admin', (_, res) => res.sendFile(path.join(dist, 'admin.html')));
}

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`[mixr] api on :${port}`));
