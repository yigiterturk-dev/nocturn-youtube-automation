import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "crypto";
import { config } from "./config";
import { observeRequests } from "./observability";
import { runScheduledTrendScans } from "./trend-engine";

const app = express();
const httpServer = createServer(app);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));
app.use((req, res, next) => {
  const requestId = req.header("x-request-id") || randomUUID();
  res.setHeader("x-request-id", requestId);
  next();
});
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: "draft-7",
  legacyHeaders: false,
}));
app.use(observeRequests);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? "error" : "info",
        requestId: res.getHeader("x-request-id"),
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: duration,
      }));
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? "Internal Server Error" : err.message || "Request failed";

    console.error(JSON.stringify({
      level: "error",
      event: "request_failure",
      status,
      message: err instanceof Error ? err.message : "Unknown error",
      stack: config.APP_ENV === "production" ? undefined : err?.stack,
    }));

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = config.PORT;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  const trendIntervalMinutes = Math.max(30, Number(process.env.TREND_AUTOSCAN_MINUTES || 120));
  const trendTimer = setInterval(() => {
    runScheduledTrendScans().catch((error) => console.error(JSON.stringify({
      level: "error",
      event: "scheduled_trend_scan_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    })));
  }, trendIntervalMinutes * 60_000);
  trendTimer.unref();

  const shutdown = (signal: string) => {
    clearInterval(trendTimer);
    log(`${signal} received; draining connections`, "system");
    httpServer.close((error) => {
      if (error) {
        console.error(JSON.stringify({ level: "error", event: "shutdown_failed", message: error.message }));
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
})();
