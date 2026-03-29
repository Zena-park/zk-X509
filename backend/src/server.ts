import "dotenv/config";
import express from "express";
import cors from "cors";
import registriesRouter from "./routes/registries";
import caRegistryRouter from "./routes/ca-registry";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// Middleware
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

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`zk-X509 backend running on http://localhost:${PORT}`);
});
