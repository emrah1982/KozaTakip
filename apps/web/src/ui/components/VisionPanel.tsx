import { useEffect, useMemo, useRef, useState } from "react";

type RawDetection = Record<string, unknown>;

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function proxiedUrl(kind: "frame" | "yolo", raw: string | null) {
  if (!raw) return null;
  if (!API_BASE) return raw;
  const path = kind === "frame" ? "/api/vision/proxy/frame" : "/api/vision/proxy/yolo";
  return `${API_BASE}${path}?url=${encodeURIComponent(raw)}`;
}

function readNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeDetections(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const arr =
    Array.isArray(obj.detections) ? obj.detections : Array.isArray(obj.predictions) ? obj.predictions : Array.isArray(obj.boxes) ? obj.boxes : null;
  if (!arr) return [];
  return arr.filter((x): x is RawDetection => Boolean(x) && typeof x === "object");
}

function detectionLabel(d: RawDetection) {
  const cls = readString(d.class) ?? readString(d.label) ?? readString(d.name) ?? "nesne";
  const conf = readNumber(d.confidence) ?? readNumber(d.conf) ?? readNumber(d.score);
  return conf === null ? cls : `${cls} ${(conf * 100).toFixed(0)}%`;
}

function readBox(d: RawDetection): { x1: number; y1: number; x2: number; y2: number } | null {
  const x1 = readNumber(d.x1) ?? readNumber(d.left) ?? readNumber(d.xmin) ?? (Array.isArray(d.bbox) ? readNumber((d.bbox as any[])[0]) : null);
  const y1 = readNumber(d.y1) ?? readNumber(d.top) ?? readNumber(d.ymin) ?? (Array.isArray(d.bbox) ? readNumber((d.bbox as any[])[1]) : null);
  const x2 = readNumber(d.x2) ?? readNumber(d.right) ?? readNumber(d.xmax) ?? (Array.isArray(d.bbox) ? readNumber((d.bbox as any[])[2]) : null);
  const y2 = readNumber(d.y2) ?? readNumber(d.bottom) ?? readNumber(d.ymax) ?? (Array.isArray(d.bbox) ? readNumber((d.bbox as any[])[3]) : null);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
  return { x1, y1, x2, y2 };
}

export function VisionPanel(props: {
  cameraImageUrl: string | null;
  yoloResultsUrl: string | null;
  title?: string;
  pollMs?: number;
  onYoloRaw?: (raw: unknown) => void;
}) {
  const pollMs = props.pollMs ?? 1200;
  const [yoloRaw, setYoloRaw] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 800);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const yoloUrl = proxiedUrl("yolo", props.yoloResultsUrl);
    if (!yoloUrl) return;
    let alive = true;
    const ctrl = new AbortController();

    const run = async () => {
      try {
        const res = await fetch(yoloUrl, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`YOLO API hata: ${res.status}`);
        const json = (await res.json()) as unknown;
        if (!alive) return;
        setYoloRaw(json);
        if (typeof props.onYoloRaw === "function") props.onYoloRaw(json);
        setErr(null);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "YOLO verisi alınamadı");
      }
    };

    run();
    const id = window.setInterval(run, Math.max(500, pollMs));
    return () => {
      alive = false;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [pollMs, props.yoloResultsUrl]);

  useEffect(() => {
    const onFsChange = () => {
      const el = containerRef.current;
      const active = Boolean(document.fullscreenElement && el && document.fullscreenElement === el);
      setIsFullscreen(active);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      return;
    }
  };

  const detections = useMemo(() => normalizeDetections(yoloRaw), [yoloRaw]);

  const baseImg = proxiedUrl("frame", props.cameraImageUrl);
  const imgUrl = baseImg ? baseImg + (baseImg.includes("?") ? "&" : "?") + `t=${tick}` : null;

  const renderBoxes = () => {
    const el = imgRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    if (!w || !h) return null;

    return detections
      .map((d, idx) => {
        const b = readBox(d);
        if (!b) return null;

        const isNormalized = Math.max(b.x1, b.x2, b.y1, b.y2) <= 1.5;
        const x1 = isNormalized ? b.x1 * w : (b.x1 / Math.max(1, (el as any).naturalWidth ?? w)) * w;
        const y1 = isNormalized ? b.y1 * h : (b.y1 / Math.max(1, (el as any).naturalHeight ?? h)) * h;
        const x2 = isNormalized ? b.x2 * w : (b.x2 / Math.max(1, (el as any).naturalWidth ?? w)) * w;
        const y2 = isNormalized ? b.y2 * h : (b.y2 / Math.max(1, (el as any).naturalHeight ?? h)) * h;

        const left = Math.max(0, Math.min(w, Math.min(x1, x2)));
        const top = Math.max(0, Math.min(h, Math.min(y1, y2)));
        const width = Math.max(0, Math.min(w - left, Math.abs(x2 - x1)));
        const height = Math.max(0, Math.min(h - top, Math.abs(y2 - y1)));

        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left,
              top,
              width,
              height,
              border: "2px solid rgba(124,92,255,.85)",
              borderRadius: 8,
              boxShadow: "0 6px 16px rgba(15,23,42,.12)",
              pointerEvents: "none"
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 6,
                top: -26,
                background: "rgba(255,255,255,.85)",
                border: "1px solid rgba(15,23,42,.12)",
                padding: "4px 8px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 650,
                color: "rgba(0,0,0,.78)",
                whiteSpace: "nowrap"
              }}
            >
              {detectionLabel(d)}
            </div>
          </div>
        );
      })
      .filter(Boolean);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 750 }}>{props.title ?? "Kamera & YOLO"}</div>
        <div className="k-sub">
          {props.cameraImageUrl ? "Kamera bağlı" : "Kamera URL yok"}
          {props.yoloResultsUrl ? " · YOLO bağlı" : " · YOLO URL yok"}
          {detections.length ? ` · ${detections.length} tespit` : ""}
          {props.cameraImageUrl ? " · Çift tık: tam ekran" : ""}
          {isFullscreen ? " (tam ekran)" : ""}
        </div>
      </div>

      {err && <div className="k-alert">{err}</div>}

      <div
        ref={containerRef}
        onDoubleClick={() => void toggleFullscreen()}
        style={{
          position: "relative",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
          background: "linear-gradient(180deg, rgba(255,255,255,.96), rgba(247,249,255,.92))",
          minHeight: 320
        }}
        title="Çift tık: tam ekran"
      >
        {imgUrl ? (
          <img
            ref={imgRef}
            src={imgUrl}
            alt="Kamera görüntüsü"
            style={{ width: "100%", height: "auto", display: "block" }}
            onError={() => setErr("Kamera görüntüsü alınamadı (CORS/URL kontrol et).")}
          />
        ) : (
          <div className="k-sub" style={{ padding: 12 }}>
            Kamera URL tanımlı değil.
          </div>
        )}
        <div style={{ position: "absolute", inset: 0 }}>{renderBoxes()}</div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>YOLO Sonuç (ham JSON)</div>
        <pre className="k-json" style={{ maxHeight: 260 }}>{JSON.stringify(yoloRaw ?? null, null, 2)}</pre>
      </div>
    </div>
  );
}
