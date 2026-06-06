import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global fetch interceptor to automatically inject x-api-key for manual /api/ calls
const originalFetch = window.fetch;
window.fetch = async function (input, init) {
  let url = "";
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input && typeof input === "object" && "url" in input) {
    url = (input as any).url;
  }

  if (url.startsWith("/api/")) {
    init = init || {};
    const headers = new Headers(init.headers || {});
    if (!headers.has("x-api-key")) {
      const apiKey = (import.meta as any).env.VITE_API_KEY || "dev-secret-key-123";
      headers.set("x-api-key", apiKey);
    }
    init.headers = headers;
  }
  return originalFetch.call(this, input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
