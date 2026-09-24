import express from 'express';
import fs from 'node:fs';
import path from 'path';
import { gameRouter } from './server/api/gameRoutes';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

  // Static generated assets & placeholders serving
  const publicAssetsPath = path.join(process.cwd(), 'public', 'assets');
  app.use('/assets', express.static(publicAssetsPath));

  app.get('/assets/generated/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), 'public', 'assets', 'generated', filename);
    if (path.extname(filename) === '.svg' || fs.existsSync(filePath + '.svg')) {
      const target = fs.existsSync(filePath) ? filePath : filePath + '.svg';
      if (fs.existsSync(target)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.sendFile(target);
        return;
      }
    }
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', path.extname(filename) === '.png' ? 'image/png' : 'image/jpeg');
      res.sendFile(filePath);
      return;
    }
    res.status(404).send('Generated asset not found');
  });

  app.get('/assets/placeholders/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), 'public', 'assets', 'placeholders', filename);
    if (path.extname(filename) === '.svg' || fs.existsSync(filePath + '.svg')) {
      const target = fs.existsSync(filePath) ? filePath : filePath + '.svg';
      if (fs.existsSync(target)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.sendFile(target);
        return;
      }
    }
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', path.extname(filename) === '.png' ? 'image/png' : 'image/jpeg');
      res.sendFile(filePath);
      return;
    }
    res.status(404).send('Placeholder asset not found');
  });

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
      server: {
        middlewareMode: true,
        // AI Studio's embedded preview does not reliably expose Vite's HMR
        // websocket. Disable HMR and remove the client bootstrap explicitly;
        // otherwise the injected /@vite/client can still attempt a websocket
        // connection before the React entry module executes.
        hmr: false,
        ws: false,
      },
      appType: 'spa',
      plugins: [
        {
          name: 'dreambook-preview-no-hmr-client',
          enforce: 'post',
          transformIndexHtml(html: string) {
            return html
              .replace(/<script[^>]+src=["']\/\@vite\/client["'][^>]*><\/script>\s*/g, '')
              .replace(/<script[^>]+src=["']\/\@react-refresh["'][^>]*><\/script>\s*/g, '')
              .replace(/<script[^>]*>\s*import RefreshRuntime from ["']\/\@react-refresh["'][\s\S]*?<\/script>\s*/g, '');
          },
        },
      ],
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