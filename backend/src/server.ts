import "dotenv/config";
import { createApp } from "./app";

// Local / self-hosted entry point. The serverless (Firebase Functions) entry is
// in `firebase.ts`; both share the same Express app from `app.ts`.
const PORT = Number(process.env.PORT) || 4000;

createApp().listen(PORT, () => {
  console.log(`zk-X509 backend running on http://localhost:${PORT}`);
});
