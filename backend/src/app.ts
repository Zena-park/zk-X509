import "dotenv/config";
import express, { Express } from "express";
import cors from "cors";
import registriesRouter from "./routes/registries";
import caRegistryRouter from "./routes/ca-registry";
import chatRouter from "./routes/chat";

/// Build the Express app WITHOUT binding a port. `server.ts` calls `.listen()`
/// for local dev; the Firebase Functions entry (`firebase.ts`) hands this app
/// straight to `onRequest`. Keeping construction here (no side effects on
/// import) is what lets the same routes run both ways.
export function createApp(): Express {
  const app = express();
  const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
  const ASSISTANT_ENABLED = process.env.ASSISTANT_ENABLED === "true";

  app.use(cors({ origin: CORS_ORIGIN }));
  app.use(express.json({ limit: "2mb" }));

  // Request logging
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  // Routes
  app.use("/api/registries", registriesRouter);
  app.use("/api/ca-registry", caRegistryRouter);

  // The assistant forwards to a paid LLM and is unauthenticated, so the route is
  // only mounted when explicitly enabled — hiding the widget in the frontend does
  // not close the endpoint, which anyone can call directly. Off by default, so a
  // deployment cannot bill for the assistant unless someone opts in.
  if (ASSISTANT_ENABLED) {
    app.use("/api/chat", chatRouter);
  } else {
    app.all("/api/chat", (_req, res) => {
      res.status(404).json({ error: "Assistant is disabled" });
    });
  }

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // JSON error handler — the async route wrapper (`h()` in routes/registries.ts)
  // forwards store/handler errors here via next(err). Without this, Express'
  // default handler returns HTML and can leak a stack trace; respond with the
  // API's JSON shape and keep internals server-side.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
