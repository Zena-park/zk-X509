import express from "express";
import cors from "cors";
import registriesRouter from "./routes/registries";

const app = express();
const PORT = 4000;

// Middleware
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Routes
app.use("/api/registries", registriesRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`zk-X509 backend running on http://localhost:${PORT}`);
});
