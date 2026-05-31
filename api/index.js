// Vercel Serverless Function bridge
// Dynamic import to support ESM module in Vercel's CommonJS environment
export default async function handler(req, res) {
  const appModule = await import("../apps/api-server/dist/app.mjs");
  const app = appModule.default || appModule;
  return app(req, res);
}
