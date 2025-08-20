import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import http from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { timing } from "./middleware/timing";

console.log('🚀 Booting Construction Management System...');
console.log('🔧 Using Supabase pooler:', process.env.DATABASE_URL?.includes(':6543') ? 'transaction' : 'session');

const app = express();
const server = http.createServer(app);

// Configure server timeouts for better performance
server.headersTimeout = 20000;   // 20 seconds
server.requestTimeout = 15000;   // 15 seconds

// Add healthcheck endpoint FIRST for fast startup
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Add request logging middleware
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

// Add V2 health check endpoint
app.get("/api/dashboard/v2/health", (_req, res) => {
  res.json({ ok: true, route: "/api/dashboard/v2/health" });
});

// Add timing middleware for performance monitoring
app.use(timing());

// Only compress GETs (read APIs); skip for writes/small bodies
app.use(compression({
  filter: (req, res) => req.method === 'GET'
}));
app.use(express.json({ limit: '128kb' }));
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
  const PORT = parseInt(process.env.PORT || "5000", 10);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server listening on port ${PORT}`);
    log(`serving on port ${PORT}`);
  });

  // Warm the connection pool after server is ready (give DB time to connect)
  setTimeout(async () => {
    try {
      const { storage } = await import('./storage.js');
      
      // Only warm if using real database (not memory storage)
      if (storage.constructor.name === 'DatabaseStorage') {
        // Prime connection pool with a few connections
        const warmPromises = Array.from({ length: 3 }, () => 
          storage.getTasks(78).catch(() => {}) // Use existing method, ignore errors
        );
        await Promise.allSettled(warmPromises);
        console.log('🔥 Database pool warmed');
      }
    } catch (e) {
      // Silent warmup failure is acceptable
    }
  }, 2000); // 2 second delay

  // Keep pool warm with periodic ping
  setInterval(() => {
    import('./storage.js').then(async ({ storage }) => {
      if (storage.constructor.name === 'DatabaseStorage') {
        storage.getTasks(78).catch(() => {}); // Silent ping
      }
    });
  }, 120_000); // 2 minutes (gentler)

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
