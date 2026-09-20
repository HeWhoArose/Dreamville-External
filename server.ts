import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { gameRouter } from './server/api/gameRoutes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // Development request logger for API routes
  app.use('/api', (req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.originalUrl} | Host: ${req.headers.host || 'unknown'} | Content-Type: ${req.headers['content-type'] || 'none'}`);
    next();
  });

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', runtime: 'Node.js Express Server Authority' });
  });

  // API Routes MUST come FIRST
  app.use('/api/game', gameRouter);

  // Never let an unmatched API request fall through to the SPA HTML fallback.
  // This keeps API failures JSON-shaped and prevents `Unexpected token '<'` errors
  // when the frontend accidentally reaches a missing or mis-mounted endpoint.
  app.use('/api', (req, res, next) => {
    if (!res.headersSent) {
      res.status(404).json({
        error: `API route not found: ${req.method} ${req.originalUrl}`,
        code: 'API_ROUTE_NOT_FOUND',
      });
      return;
    }
    next();
  });

  // Vite middleware for development vs static files for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Dreamville Server Authority] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});