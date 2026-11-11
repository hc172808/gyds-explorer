import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { apiRequestRateLimit } from "./middlewares/requestRateLimit";

const app: Express = express();
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isSafeInteger(trustProxyHops) && trustProxyHops >= 0) {
  app.set("trust proxy", trustProxyHops);
}

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
const allowedCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  allowedCorsOrigins.length
    ? cors({
        origin(origin, callback) {
          if (!origin || allowedCorsOrigins.includes(origin)) callback(null, true);
          else callback(new Error("Origin is not allowed by CORS"));
        },
      })
    : cors(),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(apiRequestRateLimit);

const apiRoot = (_req: express.Request, res: express.Response) => {
  res.json({
    service: "GYDS Explorer API",
    status: "ok",
    health: "/api/health",
  });
};
app.get("/", apiRoot);
app.get("/api", apiRoot);

app.use("/api", router);

export default app;
