import express from "express";
import type { AgentInboundMessage, EnvironmentToOrchestratorMessage } from "@kozatakip/shared";
import mysql from "mysql2/promise";
import { InMemoryMessageRepository } from "../../infrastructure/repositories/inMemoryMessageRepository.js";
import { MySqlMessageRepository } from "../../infrastructure/repositories/mySqlMessageRepository.js";
import { ingestAgentMessage } from "../../application/usecases/ingestAgentMessage.js";
import { getDashboardSnapshot } from "../../application/usecases/getDashboardSnapshot.js";
import { createVisionRouter } from "./visionapi.js";

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function requireActuatorApiKey(req: express.Request, res: express.Response): boolean {
  const key = process.env.ACTUATOR_API_KEY;
  if (!key) return true;
  const header = req.headers["x-api-key"];
  const provided = Array.isArray(header) ? header[0] : typeof header === "string" ? header : "";
  if (provided !== key) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
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

  router.use("/vision", createVisionRouter(repo));

  router.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ ok: true });
  });

  router.post(
    "/devices/heartbeat",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      if (!requireActuatorApiKey(req, res)) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const deviceId = typeof body.device_id === "string" ? body.device_id : null;
      const rssi = typeof body.rssi === "number" ? Math.trunc(body.rssi) : null;
      const ip = typeof body.ip === "string" ? body.ip : null;

      if (!deviceId) {
        res.status(400).json({ error: "Invalid payload" });
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

      await pool.execute(
        `CREATE TABLE IF NOT EXISTS device_status (
          device_id VARCHAR(64) NOT NULL,
          last_seen_at DATETIME(3) NOT NULL,
          last_rssi INT NULL,
          last_ip VARCHAR(64) NULL,
          PRIMARY KEY (device_id),
          INDEX idx_device_status_last_seen_at (last_seen_at)
        )`
      );

      await pool.execute(
        "INSERT INTO device_status (device_id, last_seen_at, last_rssi, last_ip) VALUES (?, NOW(3), ?, ?) ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at), last_rssi = VALUES(last_rssi), last_ip = VALUES(last_ip)",
        [deviceId, rssi, ip]
      );

      await pool.end();

      res.status(201).json({ ok: true });
    })
  );

  router.get(
    "/devices/config",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      const deviceId = typeof req.query.device_id === "string" ? req.query.device_id : null;
      if (!deviceId) {
        res.status(400).json({ error: "device_id is required" });
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

      await pool.execute(
        `CREATE TABLE IF NOT EXISTS device_config (
          device_id VARCHAR(64) NOT NULL,
          updated_at DATETIME(3) NOT NULL,
          config JSON NOT NULL,
          PRIMARY KEY (device_id),
          INDEX idx_device_config_updated_at (updated_at)
        )`
      );

      const [rows] = (await pool.execute(
        "SELECT updated_at, config FROM device_config WHERE device_id = ? LIMIT 1",
        [deviceId]
      )) as any;

      await pool.end();

      const r = rows[0];
      if (!r) {
        res.json({ ok: true, device_id: deviceId, updated_at: null, config: null });
        return;
      }

      const cfg =
        typeof r.config === "string" ? (JSON.parse(r.config) as Record<string, unknown>) : (r.config as any);

      res.json({
        ok: true,
        device_id: deviceId,
        updated_at: new Date(r.updated_at).toISOString(),
        config: cfg
      });
    })
  );

  router.put(
    "/devices/config",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      if (!requireActuatorApiKey(req, res)) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const deviceId = typeof body.device_id === "string" ? body.device_id : null;
      const config = body.config && typeof body.config === "object" ? body.config : null;

      if (!deviceId || !config) {
        res.status(400).json({ error: "Invalid payload" });
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

      await pool.execute(
        `CREATE TABLE IF NOT EXISTS device_config (
          device_id VARCHAR(64) NOT NULL,
          updated_at DATETIME(3) NOT NULL,
          config JSON NOT NULL,
          PRIMARY KEY (device_id),
          INDEX idx_device_config_updated_at (updated_at)
        )`
      );

      await pool.execute(
        "INSERT INTO device_config (device_id, updated_at, config) VALUES (?, NOW(3), CAST(? AS JSON)) ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at), config = VALUES(config)",
        [deviceId, JSON.stringify(config)]
      );

      await pool.end();

      res.status(201).json({ ok: true });
    })
  );

  router.get(
    "/actuators/audit",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      if (!requireActuatorApiKey(req, res)) return;

      const limitRaw = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 100;

      const actuator = typeof req.query.actuator === "string" ? req.query.actuator : null;
      const from = typeof req.query.from === "string" ? req.query.from : null;
      const to = typeof req.query.to === "string" ? req.query.to : null;

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

      const where: string[] = [];
      const args: unknown[] = [];

      if (actuator) {
        where.push("actuator = ?");
        args.push(actuator);
      }
      if (from) {
        where.push("created_at >= ?");
        args.push(from);
      }
      if (to) {
        where.push("created_at <= ?");
        args.push(to);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [rows] = (await pool.execute(
        `SELECT id, created_at, actuator, mode, state, client_ip, user_agent, payload
         FROM actuator_audit
         ${whereSql}
         ORDER BY id DESC
         LIMIT ${limit}`,
        args
      )) as any;

      await pool.end();

      res.json(
        rows.map((r: (typeof rows)[number]) => ({
          id: Number(r.id),
          created_at: new Date(r.created_at).toISOString(),
          actuator: r.actuator,
          mode: r.mode,
          state: Boolean(r.state),
          client_ip: r.client_ip,
          user_agent: r.user_agent,
          payload:
            r.payload === null || r.payload === undefined
              ? null
              : typeof r.payload === "string"
                ? (JSON.parse(r.payload) as Record<string, unknown>)
                : (r.payload as any)
        }))
      );
    })
  );

  router.get(
    "/devices/status",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      if (!requireActuatorApiKey(req, res)) return;

      const deviceId = typeof req.query.device_id === "string" ? req.query.device_id : null;
      if (!deviceId) {
        res.status(400).json({ error: "device_id is required" });
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

      await pool.execute(
        `CREATE TABLE IF NOT EXISTS device_status (
          device_id VARCHAR(64) NOT NULL,
          last_seen_at DATETIME(3) NOT NULL,
          last_rssi INT NULL,
          last_ip VARCHAR(64) NULL,
          PRIMARY KEY (device_id),
          INDEX idx_device_status_last_seen_at (last_seen_at)
        )`
      );

      const [rows] = (await pool.execute(
        "SELECT last_seen_at, last_rssi, last_ip FROM device_status WHERE device_id = ? LIMIT 1",
        [deviceId]
      )) as any;

      await pool.end();

      const r = rows[0];
      if (!r) {
        res.json({ ok: true, device: null });
        return;
      }

      res.json({
        ok: true,
        device: {
          device_id: deviceId,
          last_seen_at: new Date(r.last_seen_at).toISOString(),
          last_rssi: r.last_rssi,
          last_ip: r.last_ip
        }
      });
    })
  );

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

      const [rows] = (await pool.execute(
        "SELECT ts, stage, temperature, humidity, co2_ppm, stress_level FROM demo_environment ORDER BY ts ASC LIMIT 120"
      )) as any;

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

      if (!requireActuatorApiKey(req, res)) return;

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

  router.post(
    "/actuators/command",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      if (!requireActuatorApiKey(req, res)) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const deviceId = typeof body.device_id === "string" ? body.device_id : null;
      const actuator = typeof body.actuator === "string" ? body.actuator : null;
      const mode = body.mode === "auto" || body.mode === "manual" ? body.mode : null;
      const state = typeof body.state === "boolean" ? body.state : null;

      if (!deviceId || !actuator || !mode || state === null) {
        res.status(400).json({ error: "Invalid payload" });
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

      await pool.execute(
        `CREATE TABLE IF NOT EXISTS actuator_commands (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          created_at DATETIME(3) NOT NULL,
          device_id VARCHAR(64) NOT NULL,
          actuator VARCHAR(32) NOT NULL,
          mode VARCHAR(16) NOT NULL,
          state TINYINT(1) NOT NULL,
          status VARCHAR(16) NOT NULL,
          claimed_at DATETIME(3) NULL,
          processed_at DATETIME(3) NULL,
          processed_ok TINYINT(1) NULL,
          PRIMARY KEY (id),
          INDEX idx_actuator_commands_device_status_created (device_id, status, created_at),
          INDEX idx_actuator_commands_created_at (created_at)
        )`
      );

      const [result] = (await pool.execute(
        "INSERT INTO actuator_commands (created_at, device_id, actuator, mode, state, status) VALUES (NOW(3), ?, ?, ?, ?, 'pending')",
        [deviceId, actuator, mode, state ? 1 : 0]
      )) as any;

      await pool.end();

      res.status(201).json({ ok: true, id: result.insertId });
    })
  );

  router.get(
    "/actuators/command/poll",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      if (!requireActuatorApiKey(req, res)) return;

      const deviceId = typeof req.query.device_id === "string" ? req.query.device_id : null;
      if (!deviceId) {
        res.status(400).json({ error: "device_id is required" });
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

      const [rows] = (await pool.execute(
        "SELECT id, actuator, mode, state FROM actuator_commands WHERE device_id = ? AND status = 'pending' ORDER BY id ASC LIMIT 1",
        [deviceId]
      )) as any;

      const cmd = rows[0];
      if (!cmd) {
        await pool.end();
        res.json({ ok: true, command: null });
        return;
      }

      await pool.execute(
        "UPDATE actuator_commands SET status = 'claimed', claimed_at = NOW(3) WHERE id = ? AND status = 'pending'",
        [cmd.id]
      );

      await pool.end();

      res.json({
        ok: true,
        command: {
          id: cmd.id,
          actuator: cmd.actuator,
          mode: cmd.mode,
          state: Boolean(cmd.state)
        }
      });
    })
  );

  router.post(
    "/actuators/command/ack",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      if (!(dbHost && dbUser && dbPassword && dbName)) {
        res.status(400).json({ error: "DB not configured" });
        return;
      }

      if (!requireActuatorApiKey(req, res)) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const id = typeof body.id === "number" ? body.id : null;
      const ok = typeof body.ok === "boolean" ? body.ok : null;

      if (!id || ok === null) {
        res.status(400).json({ error: "Invalid payload" });
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

      await pool.execute(
        "UPDATE actuator_commands SET status = 'processed', processed_at = NOW(3), processed_ok = ? WHERE id = ?",
        [ok ? 1 : 0, id]
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
