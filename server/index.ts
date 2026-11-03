import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { ZodError } from "zod";
import { config, HttpError } from "./config.js";
import { api } from "./api.js";
import { mountStripeWebhook } from "./payments.js";
import { startAutopilot } from "./autopilot.js";
import { reconcileDeployments } from "./services.js";
import { nodes, getServers, setting, encrypt } from "./db.js";
import { dockerClient } from "./docker-runtime.js";
import { randomBytes } from "node:crypto";
import type { NodeInfo } from "../shared/types.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy:
      config.mode === "docker"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              fontSrc: ["'self'"],
              imgSrc: ["'self'", "data:", "https://cdn.modrinth.com"],
              connectSrc: ["'self'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
  }),
);
mountStripeWebhook(app);
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 400,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  }),
  api,
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, mode: config.mode, version: "0.1.0" }),
);
if (
  config.mode === "demo" ||
  fs.existsSync(path.join(config.root, "dist/public/index.html"))
) {
  if (fs.existsSync(path.join(config.root, "dist/public/index.html"))) {
    app.use(
      express.static(path.join(config.root, "dist/public"), {
        maxAge: "1h",
        index: false,
      }),
    );
    app.get("*", (_req, res) =>
      res.sendFile(path.join(config.root, "dist/public/index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: config.root,
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        allowedHosts: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
} else {
  app.get("/", (_req, res) =>
    res
      .status(503)
      .type("text")
      .send(
        "ZK API is running. Build the frontend with npm run build, or use npm run dev.",
      ),
  );
}
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof ZodError) {
      res
        .status(400)
        .json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
      return;
    }
    const status =
      typeof error.status === "number"
        ? error.status
        : typeof error.statusCode === "number" &&
            error.statusCode >= 400 &&
            error.statusCode < 500
          ? error.statusCode
          : 400;
    if (status >= 500 && !(error instanceof HttpError)) console.error(error);
    res
      .status(status)
      .json({
        error: error.message || "Something went wrong. Please try again.",
      });
  },
);
if (
  config.mode === "docker" &&
  !config.remoteOnly &&
  !nodes.get("node-local")
) {
  try {
    const info = await dockerClient().info();
    const n: NodeInfo = {
      id: "node-local",
      name: "Local Docker node",
      region: process.env.NODE_REGION || "Local",
      country: process.env.NODE_COUNTRY || "IN",
      endpoint: "",
      status: "online",
      memory: Math.floor(info.MemTotal / 1048576),
      cpu: info.NCPU * 100,
      disk: Number(process.env.NODE_DISK_MB || 102400),
      usedMemory: 0,
      usedDisk: 0,
      usedCpu: 0,
      latency: 0,
      maintenance: false,
    };
    nodes.save(n);
    setting("node-token:node-local", encrypt(randomBytes(32).toString("hex")));
  } catch (e) {
    console.error(
      "Docker is required in production mode. No demo fallback will be used.",
      e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
  }
}
if (process.exitCode !== 1) {
  await reconcileDeployments();
  startAutopilot();
  const server = createServer(app);
  server.requestTimeout = 120000;
  server.listen(config.port, "0.0.0.0", () =>
    console.log(
      `\n  ZK PANEL 0.1.0 · ${config.mode.toUpperCase()} MODE\n  http://0.0.0.0:${config.port}\n  ${config.mode === "demo" ? "Demo activity is simulated. No real servers or payments." : "Docker runtime enabled. Configure TLS before public access."}\n`,
    ),
  );
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
