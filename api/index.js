// Vercel Serverless Function bridge
// Imports the pre-built Express app (compiled by esbuild in api-server's build step)
import app from "../artifacts/api-server/dist/app.mjs";

export default app;
