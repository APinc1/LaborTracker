import express, { type Request, Response, NextFunction } from "express";
import http from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

console.log('🚀 Booting Construction Management System...');
console.log('🔧 Using Supabase pooler:', process.env.DATABASE_URL?.includes(':6543') ? 'transaction' : 'session');

const app = express();
const server = http.createServer(app);

// Configure server timeouts for deployment
server.headersTimeout = 65000;   // Node 18+ default is 60s; make it a bit higher
server.requestTimeout = 60000;   // keep it <= platform limit

// Add healthcheck endpoint FIRST for fast startup
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use PORT from environment or fallback to 5000
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server listening on port ${PORT}`);
    log(`serving on port ${PORT}`);
  });

  // Graceful shutdown for production deployment
  process.on('SIGTERM', async () => {
    console.log('🔄 SIGTERM received, shutting down gracefully');
    server.close(async () => {
      try {
        const { closeDatabase } = await import('./storage.js');
        await closeDatabase();
        console.log('✅ Database connections closed');
      } catch (error) {
        console.warn('⚠️ Error closing database:', error);
      }
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    console.log('🔄 SIGINT received, shutting down gracefully');
    server.close(async () => {
      try {
        const { closeDatabase } = await import('./storage.js');
        await closeDatabase();
        console.log('✅ Database connections closed');
      } catch (error) {
        console.warn('⚠️ Error closing database:', error);
      }
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  });
})();
