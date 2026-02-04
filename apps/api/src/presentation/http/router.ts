import express from "express";
import type { AgentInboundMessage, EnvironmentToOrchestratorMessage } from "@kozatakip/shared";
import mysql from "mysql2/promise";
import { InMemoryMessageRepository } from "../../infrastructure/repositories/inMemoryMessageRepository.js";
import { MySqlMessageRepository } from "../../infrastructure/repositories/mySqlMessageRepository.js";
import { ingestAgentMessage } from "../../application/usecases/ingestAgentMessage.js";
import { getDashboardSnapshot } from "../../application/usecases/getDashboardSnapshot.js";

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createRouter() {
  const router = express.Router();

  const dbHost = process.env.DB_HOST;
  const dbPort = Number(process.env.DB_PORT ?? 3306);
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME;

  const repo = dbHost && dbUser && dbPassword && dbName
    ? new MySqlMessageRepository({
        host: dbHost,
        port: Number.isFinite(dbPort) ? dbPort : 3306,
        user: dbUser,
        password: dbPassword,
        database: dbName
      })
    : new InMemoryMessageRepository();

  router.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ ok: true });
  });

  router.post(
    "/messages",
    asyncHandler(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const msg = req.body as AgentInboundMessage;
      if (!msg || typeof msg !== "object" || typeof (msg as any).agent !== "string") {
        res.status(400).json({ error: "Invalid message" });
        return;
      }

      const stored = await ingestAgentMessage(repo, msg);
      res.status(201).json(stored);
    })
  );

  router.post(
    "/demo/seed",
    asyncHandler(async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      const pool = mysql.createPool({
        host: dbHost,
        port: Number.isFinite(dbPort) ? dbPort : 3306,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        connectionLimit: 5,
        enableKeepAlive: true
      });

      const [rows] = await pool.execute<
        (mysql.RowDataPacket & {
          ts: Date;
          stage: string;
          temperature: number;
          humidity: number;
          co2_ppm: number;
          stress_level: "low" | "medium" | "high";
        })[]
      >(
        "SELECT ts, stage, temperature, humidity, co2_ppm, stress_level FROM demo_environment ORDER BY ts ASC LIMIT 120"
      );

      let inserted = 0;
      for (const r of rows) {
        const msg: EnvironmentToOrchestratorMessage = {
          agent: "environment",
          timestamp: new Date(r.ts).toISOString(),
          stage: r.stage as any,
          temperature: Number(r.temperature),
          humidity: Number(r.humidity),
          co2_ppm: Number(r.co2_ppm),
          stress_level: r.stress_level,
          recommended_action:
            r.stress_level === "high"
              ? ["increase_ventilation", "decrease_humidity"]
              : r.stress_level === "medium"
                ? ["increase_ventilation"]
                : []
        };
        await ingestAgentMessage(repo, msg);
        inserted += 1;
      }

      await pool.end();

      res.json({ ok: true, inserted });
    })
  );

  router.post(
    "/actuators/audit",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const actuator = typeof body.actuator === "string" ? body.actuator : null;
      const mode = body.mode === "auto" || body.mode === "manual" ? body.mode : null;
      const state = typeof body.state === "boolean" ? body.state : null;

      if (!actuator || !mode || state === null) {
        res.status(400).json({ error: "Invalid payload" });
        return;
      }

      const clientIpHeader = req.headers["x-forwarded-for"];
      const clientIp = Array.isArray(clientIpHeader)
        ? clientIpHeader[0]
        : typeof clientIpHeader === "string"
          ? clientIpHeader.split(",")[0]?.trim()
          : req.ip;

      const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

      const pool = mysql.createPool({
        host: dbHost,
        port: Number.isFinite(dbPort) ? dbPort : 3306,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        connectionLimit: 5,
        enableKeepAlive: true
      });

      await pool.execute(
        `CREATE TABLE IF NOT EXISTS actuator_audit (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          created_at DATETIME(3) NOT NULL,
          actuator VARCHAR(32) NOT NULL,
          mode VARCHAR(16) NOT NULL,
          state TINYINT(1) NOT NULL,
          client_ip VARCHAR(64) NULL,
          user_agent VARCHAR(255) NULL,
          payload JSON NULL,
          PRIMARY KEY (id),
          INDEX idx_actuator_audit_created_at (created_at),
          INDEX idx_actuator_audit_actuator_created_at (actuator, created_at)
        )`
      );

      const payload = body.payload && typeof body.payload === "object" ? body.payload : null;

      await pool.execute(
        "INSERT INTO actuator_audit (created_at, actuator, mode, state, client_ip, user_agent, payload) VALUES (NOW(3), ?, ?, ?, ?, ?, ?)",
        [actuator, mode, state ? 1 : 0, clientIp ?? null, userAgent ?? null, payload ? JSON.stringify(payload) : null]
      );

      await pool.end();

      res.status(201).json({ ok: true });
    })
  );

  router.get(
    "/dashboard/snapshot",
    asyncHandler(async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const snap = await getDashboardSnapshot(repo);
      res.json(snap);
    })
  );

  router.get(
    "/messages",
    asyncHandler(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const limit = Number(req.query.limit ?? 50);
      const safeLimit = Number.isFinite(limit) ? limit : 50;
      const agent = typeof req.query.agent === "string" ? req.query.agent : undefined;

      if (agent) {
        const allowed: AgentInboundMessage["agent"][] = [
          "environment",
          "vision",
          "predictive_ai",
          "quality"
        ];
        if (!allowed.includes(agent as any)) {
          res.status(400).json({ error: "Invalid agent" });
          return;
        }
        const list = await repo.listByAgent(agent as AgentInboundMessage["agent"], safeLimit);
        res.json(list);
        return;
      }

      const list = await repo.list(safeLimit);
      res.json(list);
    })
  );

  return router;
}
