import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
