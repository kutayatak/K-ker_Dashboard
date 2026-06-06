process.env.TZ = "UTC";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { apiKeyMiddleware } from "./middlewares/auth";

const app: Express = express();

(globalThis as any).requestLogs = (globalThis as any).requestLogs || [];
app.use((req, res, next) => {
  try {
    (globalThis as any).requestLogs.push({
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      hasBody: req.body !== undefined,
      bodyType: typeof req.body,
      bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : null,
      headers: {
        host: req.headers.host,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        xApiKey: !!req.headers["x-api-key"]
      }
    });
    if ((globalThis as any).requestLogs.length > 50) {
      (globalThis as any).requestLogs.shift();
    }
  } catch (err) {
    // Ignore logging error
  }
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean) as string[];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increase global limit to 500 to handle multiple parallel queries from client
  message: { error: { message: "Too many requests, please try again later." } }
});
app.use("/api", limiter);

// Parse JSON payloads up to 50mb ONLY for excel upload, 1mb for everything else
app.use("/api/excel/upload", express.json({ limit: "50mb" }));
app.use("/api/excel/upload", express.urlencoded({ limit: "50mb", extended: true }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Protect all /api endpoints with api key authentication
app.use("/api", apiKeyMiddleware);

app.use("/api", router);

app.use(errorHandler);

export default app;
