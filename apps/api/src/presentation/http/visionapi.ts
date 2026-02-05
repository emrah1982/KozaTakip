import express from "express";
import type { VisionToOrchestratorMessage } from "@kozatakip/shared";
import type { MessageRepository } from "../../application/ports/messageRepository.js";
import { ingestAgentMessage } from "../../application/usecases/ingestAgentMessage.js";

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseAllowlist() {
  const raw = process.env.VISION_PROXY_ALLOWLIST ?? "";
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(parts.map((s) => s.toLowerCase()));
}

function isAllowedProxyTarget(u: URL, allowlist: Set<string>) {
  if (allowlist.size === 0) return false;
  const host = u.host.toLowerCase();
  const hostname = u.hostname.toLowerCase();
  return allowlist.has(host) || allowlist.has(hostname);
}

async function proxyFetch(req: express.Request, res: express.Response, kind: "frame" | "yolo") {
  const urlRaw = typeof req.query.url === "string" ? req.query.url : null;
  if (!urlRaw) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  let u: URL;
  try {
    u = new URL(urlRaw);
  } catch {
    res.status(400).json({ error: "Invalid url" });
    return;
  }

  if (!(u.protocol === "http:" || u.protocol === "https:")) {
    res.status(400).json({ error: "Only http/https allowed" });
    return;
  }

  const allowlist = parseAllowlist();
  if (!isAllowedProxyTarget(u, allowlist)) {
    res.status(403).json({ error: "Target not allowed" });
    return;
  }

  const ctrl = new AbortController();
  const timeoutMs = 7000;
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const upstream = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: {
        "user-agent": "kozatakip-api-vision-proxy",
        accept: kind === "frame" ? "image/*" : "application/json"
      }
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream error: ${upstream.status}` });
      return;
    }

    const ct = upstream.headers.get("content-type") ?? (kind === "frame" ? "image/jpeg" : "application/json");
    res.status(200);
    res.setHeader("content-type", ct);
    res.setHeader("cache-control", "no-store");

    if (kind === "yolo") {
      const json = await upstream.json();
      res.json(json);
      return;
    }

    const arr = new Uint8Array(await upstream.arrayBuffer());
    res.end(Buffer.from(arr));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Proxy error";
    res.status(502).json({ error: msg });
  } finally {
    clearTimeout(tid);
  }
}

function normalizeVisionMessage(body: unknown): VisionToOrchestratorMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const timestamp = typeof b.timestamp === "string" ? b.timestamp : null;
  const movement_index = b.movement_index;
  const size_change_ratio = b.size_change_ratio;
  const texture_anomaly = b.texture_anomaly;
  const confidence = b.confidence;

  if (!timestamp) return null;
  if (!isFiniteNumber(movement_index)) return null;
  if (!isFiniteNumber(size_change_ratio)) return null;
  if (typeof texture_anomaly !== "boolean") return null;
  if (!isFiniteNumber(confidence)) return null;

  return {
    agent: "vision",
    timestamp,
    movement_index,
    size_change_ratio,
    texture_anomaly,
    confidence
  };
}

export function createVisionRouter(repo: MessageRepository) {
  const router = express.Router();

  router.get(
    "/proxy/frame",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      await proxyFetch(req, res, "frame");
    })
  );

  router.get(
    "/proxy/yolo",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      await proxyFetch(req, res, "yolo");
    })
  );

  router.post(
    "/messages",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const msg = normalizeVisionMessage(req.body);
      if (!msg) {
        res.status(400).json({ error: "Invalid payload" });
        return;
      }
      const stored = await ingestAgentMessage(repo, msg);
      res.status(201).json(stored);
    })
  );

  router.get(
    "/latest",
    asyncHandler(async (_req: express.Request, res: express.Response) => {
      const latest = await repo.latestByAgent("vision");
      res.json({ ok: true, latest });
    })
  );

  router.get(
    "/messages",
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 50;
      const list = await repo.listByAgent("vision", limit);
      res.json(list);
    })
  );

  return router;
}
