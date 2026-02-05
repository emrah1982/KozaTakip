import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";
import { VisionPanel } from "../components/VisionPanel";

const qualityScoringDoc = `ROL:
Sen, koza oluşumu tamamlandıktan sonra ticari kaliteyi değerlendiren Quality Scoring Agent’sin.

GİRDİLER:
- Koza görüntüleri
- Çevresel geçmiş
- Stres kayıtları

SORUMLULUKLAR:
- Koza kalite skorunu hesaplamak
- A / B / C sınıflandırması yapmak
- Satış / ayrıştırma önerisi üretmek

YAPAMAYACAKLARIN:
- Hastalık tahmini
- Ortam kontrolü

ÇIKTI:
- Kalite skoru
- Kalite sınıfı`;

const visionAgentDoc = `ROL:
Sen, karanlık ortamda ipekböceklerini rahatsız etmeden görüntü analizi yapan Vision Agent’sin.

DONANIM:
- Raspberry Pi
- Pi NoIR Camera
- 850 nm IR LED

SORUMLULUKLAR:
- IR görüntü yakalamak
- Ön işleme yapmak
- Sayısal görsel özellikler çıkarmak:
  - hareket yoğunluğu
  - vücut boyutu değişimi
  - doku / yansıma farkları

YAPAMAYACAKLARIN:
- Hastalık teşhisi
- Ortam kontrolü
- Alarm üretme

ÇIKTI:
- Sayısal görsel metrikler
- Anormallik sinyalleri`;

function readLS(key: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}

function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

const LS_CAMERA = "koza:vision:camera_image_url";
const LS_YOLO = "koza:vision:yolo_results_url";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const DEVICE_ID = import.meta.env.VITE_DEVICE_ID ?? "wemos-d1-r32-01";
const ACTUATOR_API_KEY = import.meta.env.VITE_ACTUATOR_API_KEY ?? "";

type StageThresholds = {
  t_min: number;
  t_opt?: number;
  t_max: number;
  h_min: number;
  h_opt?: number;
  h_max: number;
  co2_min: number;
  co2_opt?: number;
  co2_max: number;
};

type DeviceConfig = {
  active_stage?: string;
  stages?: Record<string, StageThresholds>;
};

function normalizeStageKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function getStageThresholds(stages: Record<string, StageThresholds> | undefined, stage: string | null) {
  if (!stages || !stage) return null;
  if (stage in stages) return stages[stage] ?? null;
  const nk = normalizeStageKey(stage);
  for (const k of Object.keys(stages)) {
    if (normalizeStageKey(k) === nk) return stages[k] ?? null;
  }
  return null;
}

function clamp0to100(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function scoreLabel(v: number) {
  const s = clamp0to100(v);
  if (s >= 85) return "Çok iyi";
  if (s >= 70) return "İyi";
  if (s >= 55) return "Orta";
  return "Zayıf";
}

function scoreColor(v: number) {
  const s = clamp0to100(v);
  if (s >= 85) return "#16a34a";
  if (s >= 70) return "#22c55e";
  if (s >= 55) return "#f59e0b";
  return "#ef4444";
}

function listifyReasons(r: unknown): string[] {
  if (Array.isArray(r)) return r.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (typeof r === "string" && r.trim().length > 0) return [r];
  return [];
}

function formatStageDisplay(stage: string | null) {
  if (!stage) return "-";
  const s = stage.trim();
  const n = normalizeStageKey(s);
  if (n.startsWith("larva_")) {
    const rest = n.slice("larva_".length);
    const parts = rest.split("_").filter(Boolean);
    if (parts.length === 1) return `Larva ${parts[0]}`;
    if (parts.length >= 2) return `Larva ${parts[0]}-${parts[1]}`;
    return "Larva";
  }
  if (n === "egg" || n === "eggs" || n === "yumurta") return "Yumurta";
  if (n === "pupa" || n === "pupae" || n === "pupa_donemi") return "Pupa";
  if (n === "cocoon" || n === "cocoons" || n === "koza") return "Koza";
  const human = s.replace(/[_-]+/g, " ").trim();
  return human.charAt(0).toUpperCase() + human.slice(1);
}

function marketUi(value: unknown): { label: string; desc: string; color: string } {
  const v = typeof value === "string" ? value : "";
  const n = v.trim().toLowerCase();
  if (n === "premium" || n === "premium_market") {
    return { label: "Premium", desc: "Satışa uygun. Premium kalite sınıfı.", color: "#16a34a" };
  }
  if (n === "standard" || n === "standard_market") {
    return { label: "Standart", desc: "Satışa uygun. Standart kalite sınıfı.", color: "#22c55e" };
  }
  if (n === "discount" || n === "discount_market") {
    return { label: "İndirimli", desc: "Satılabilir, ancak fiyat kırılması gerekebilir.", color: "#f59e0b" };
  }
  if (n === "reject_or_rework" || n === "reject" || n === "rework") {
    return { label: "Reddedildi / Yeniden İşleme", desc: "Kalite düşük. Ayıklama veya yeniden işleme önerilir.", color: "#ef4444" };
  }
  if (n) return { label: "Bilinmiyor", desc: "Bu öneri kodu tanımlı değil.", color: "var(--muted)" };
  return { label: "-", desc: "", color: "var(--muted)" };
}

function normalizeDetections(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const arr =
    Array.isArray(obj.detections) ? obj.detections : Array.isArray(obj.predictions) ? obj.predictions : Array.isArray(obj.boxes) ? obj.boxes : null;
  if (!arr) return [];
  return arr.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
}

function detLabel(d: Record<string, unknown>): string {
  const raw =
    (typeof d.class === "string" && d.class) ||
    (typeof d.label === "string" && d.label) ||
    (typeof d.name === "string" && d.name) ||
    "";
  return String(raw).trim().toLowerCase();
}

function toFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]) {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function computeEnvStability(envSeries: unknown, thresholds: StageThresholds | null): { score: number; debug: Record<string, unknown> } {
  const arr = Array.isArray(envSeries) ? (envSeries as unknown[]) : [];
  const rows = arr.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");

  const temps = rows.map((r) => toFiniteNumber(r.temperature)).filter((v): v is number => v !== null);
  const hums = rows.map((r) => toFiniteNumber(r.humidity)).filter((v): v is number => v !== null);
  const co2s = rows.map((r) => toFiniteNumber(r.co2_ppm)).filter((v): v is number => v !== null);

  const tStd = std(temps);
  const hStd = std(hums);
  const cStd = std(co2s);

  const slope = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const first = xs[0];
    const last = xs[xs.length - 1];
    return (last - first) / Math.max(1, xs.length - 1);
  };

  const tSlope = slope(temps);
  const hSlope = slope(hums);
  const cSlope = slope(co2s);

  const tPenalty = clamp01(tStd / 1.5) * 40 + clamp01(Math.abs(tSlope) / 0.08) * 10;
  const hPenalty = clamp01(hStd / 5.0) * 35 + clamp01(Math.abs(hSlope) / 0.25) * 10;
  const cPenalty = clamp01(cStd / 220.0) * 30 + clamp01(Math.abs(cSlope) / 8.0) * 10;

  const stageScore = (() => {
    if (!thresholds) return { stagePenalty: 0, inRangeRatio: null as number | null, avgOutRatio: null as number | null };
    const tMin = thresholds.t_min;
    const tMax = thresholds.t_max;
    const hMin = thresholds.h_min;
    const hMax = thresholds.h_max;
    const cMin = thresholds.co2_min;
    const cMax = thresholds.co2_max;

    const scoreSeries = (xs: number[], min: number, max: number) => {
      if (!xs.length) return { inRange: 0, total: 0, outRatioAvg: 0 };
      let inRange = 0;
      let outSum = 0;
      for (const x of xs) {
        if (x >= min && x <= max) {
          inRange += 1;
          continue;
        }
        const denom = Math.max(1e-6, max - min);
        const dist = x < min ? min - x : x - max;
        outSum += dist / denom;
      }
      return { inRange, total: xs.length, outRatioAvg: outSum / xs.length };
    };

    const tS = scoreSeries(temps, tMin, tMax);
    const hS = scoreSeries(hums, hMin, hMax);
    const cS = scoreSeries(co2s, cMin, cMax);

    const total = tS.total + hS.total + cS.total;
    const inRange = tS.inRange + hS.inRange + cS.inRange;
    const inRangeRatio = total ? inRange / total : null;
    const avgOutRatio = total ? (tS.outRatioAvg + hS.outRatioAvg + cS.outRatioAvg) / 3 : null;

    const outPenalty = avgOutRatio === null ? 0 : clamp01(avgOutRatio / 0.35) * 35;
    const ratioPenalty = inRangeRatio === null ? 0 : clamp01((1 - inRangeRatio) / 0.35) * 35;

    return {
      stagePenalty: outPenalty + ratioPenalty,
      inRangeRatio,
      avgOutRatio
    };
  })();

  const dataFactor = clamp01((temps.length + hums.length + co2s.length) / 90);
  const base = 100 - (tPenalty + hPenalty + cPenalty + stageScore.stagePenalty);
  const score = Math.max(0, Math.min(100, Math.round((base * 0.65 + 35) * dataFactor + (1 - dataFactor) * 55)));

  return {
    score,
    debug: {
      samples: { temperature: temps.length, humidity: hums.length, co2_ppm: co2s.length },
      std: { temperature: tStd, humidity: hStd, co2_ppm: cStd },
      slope: { temperature: tSlope, humidity: hSlope, co2_ppm: cSlope },
      penalty: { temperature: tPenalty, humidity: hPenalty, co2_ppm: cPenalty },
      stage: {
        thresholds: thresholds
          ? {
              t_min: thresholds.t_min,
              t_max: thresholds.t_max,
              h_min: thresholds.h_min,
              h_max: thresholds.h_max,
              co2_min: thresholds.co2_min,
              co2_max: thresholds.co2_max
            }
          : null,
        inRangeRatio: stageScore.inRangeRatio,
        avgOutRatio: stageScore.avgOutRatio,
        stagePenalty: stageScore.stagePenalty
      },
      dataFactor
    }
  };
}

function computeQualityFromYolo(yoloRaw: unknown, envStabilityScore: number): {
  applicable: boolean;
  size: number;
  color: number;
  homogeneity: number;
  env_stability: number;
  quality_score: number;
  grade: "A" | "B" | "C";
  market_recommendation: "premium_export" | "standard_market" | "reject_or_rework";
  reasons: string[];
} {
  const dets = normalizeDetections(yoloRaw);
  const labels = dets.map(detLabel).filter((s) => s.length > 0);

  const reasons: string[] = [];

  const readNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const readStr = (v: unknown): string | null => (typeof v === "string" && v.trim().length ? v : null);
  const readObj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  const isCocoonLike = (s: string) => {
    const x = s.toLowerCase();
    return x.includes("cocoon") || x.includes("koza");
  };

  const cocoonCount = labels.filter((s) => isCocoonLike(s)).length;
  const env_stability = Math.max(0, Math.min(100, Math.round(envStabilityScore)));

  if (cocoonCount === 0) {
    reasons.push("Koza tespit edilmedi: koza kalite skoru bu evrede hesaplanmaz (N/A)");
    return {
      applicable: false,
      size: 0,
      color: 0,
      homogeneity: 0,
      env_stability,
      quality_score: 0,
      grade: "C",
      market_recommendation: "reject_or_rework",
      reasons,
    };
  }

  const readBox = (d: Record<string, unknown>) => {
    const bbox = Array.isArray(d.bbox) ? (d.bbox as unknown[]) : null;
    const x1 = typeof d.x1 === "number" ? d.x1 : bbox && typeof bbox[0] === "number" ? (bbox[0] as number) : null;
    const y1 = typeof d.y1 === "number" ? d.y1 : bbox && typeof bbox[1] === "number" ? (bbox[1] as number) : null;
    const x2 = typeof d.x2 === "number" ? d.x2 : bbox && typeof bbox[2] === "number" ? (bbox[2] as number) : null;
    const y2 = typeof d.y2 === "number" ? d.y2 : bbox && typeof bbox[3] === "number" ? (bbox[3] as number) : null;
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { x1, y1, x2, y2 };
  };

  const areas = dets
    .map((d) => {
      const b = readBox(d);
      if (!b) return null;
      const w = Math.max(0, b.x2 - b.x1);
      const h = Math.max(0, b.y2 - b.y1);
      const a = w * h;
      return typeof a === "number" && Number.isFinite(a) ? a : null;
    })
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const cocoonMetrics = dets
    .map((d) => {
      const label = readStr(d.label) ?? readStr(d.class) ?? detLabel(d);
      if (!label || !isCocoonLike(label)) return null;
      const extra = readObj((d as any).extra) ?? readObj(readObj(d)?.extra);
      if (!extra) return null;
      const sizeObj = readObj(extra.size);
      const colorObj = readObj(extra.color);
      const ar = sizeObj ? readNum(sizeObj.area_ratio) : null;
      const apx = sizeObj ? readNum(sizeObj.area_px) : null;
      const hsvObj = colorObj ? readObj(colorObj.mean_hsv) : null;
      const rgbObj = colorObj ? readObj(colorObj.mean_rgb) : null;
      const hsv = hsvObj
        ? {
            h: readNum(hsvObj.h),
            s: readNum(hsvObj.s),
            v: readNum(hsvObj.v)
          }
        : null;
      const rgb = rgbObj
        ? {
            r: readNum(rgbObj.r),
            g: readNum(rgbObj.g),
            b: readNum(rgbObj.b)
          }
        : null;
      return {
        area_ratio: ar,
        area_px: apx,
        hsv,
        rgb
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const areaMean = mean(areas);
  const areaStd = std(areas);

  const hasAny = dets.length > 0;

  const mold = labels.filter((s) => s.includes("mold") || s.includes("fung") || s.includes("muscardine") || s.includes("küf") || s.includes("mantar")).length;
  const defect = labels.filter((s) => s.includes("defect") || s.includes("damage") || s.includes("delik") || s.includes("hole") || s.includes("tear") || s.includes("çatlak")).length;
  const stain = labels.filter((s) => s.includes("stain") || s.includes("leke") || s.includes("kir") || s.includes("dirty")).length;

  const healthyCount = labels.filter((s) => s === "healthy" || s === "saglikli" || s === "sağlıklı").length;
  const diseasedCount = labels.filter(
    (s) =>
      s === "diseased" ||
      s === "disease" ||
      s === "sick" ||
      s === "unhealthy" ||
      s === "hasta" ||
      s === "hastalikli" ||
      s === "hastalıklı" ||
      s.includes("diseas") ||
      s.includes("hasta") ||
      s.includes("hastal")
  ).length;

  const areaRatios = cocoonMetrics
    .map((m) => m.area_ratio)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const areaRatMean = mean(areaRatios);
  const areaRatStd = std(areaRatios);

  const size = (() => {
    if (areaRatios.length) {
      const minOk = 0.01;
      const maxOk = 0.08;
      const t = (areaRatMean - minOk) / Math.max(1e-6, maxOk - minOk);
      const base = clamp01(t) * 100;
      const homoBonus = clamp01(1 - areaRatStd / Math.max(1e-6, areaRatMean)) * 10;
      reasons.push("Boyut: YOLO 'extra.size.area_ratio' kullanıldı");
      return Math.max(0, Math.min(100, Math.round(base + homoBonus)));
    }
    if (hasAny) {
      reasons.push("Boyut: bbox alanı (fallback) kullanıldı");
      return Math.round(clamp01(areaMean) * 100);
    }
    reasons.push("YOLO tespiti yok: boyut skoru varsayılan");
    return 60;
  })();

  const color = (() => {
    const hsvs = cocoonMetrics
      .map((m) => m.hsv)
      .filter((x): x is NonNullable<typeof x> => Boolean(x && typeof x.h === "number" && typeof x.s === "number" && typeof x.v === "number"));
    if (hsvs.length) {
      const hMean = mean(hsvs.map((x) => x.h as number));
      const sMean = mean(hsvs.map((x) => x.s as number));
      const vMean = mean(hsvs.map((x) => x.v as number));

      const hTarget = 20;
      const hSpan = 25;
      const hScore = clamp01(1 - Math.abs(hMean - hTarget) / hSpan);
      const sScore = clamp01((sMean - 25) / 80);
      const vScore = clamp01(1 - Math.abs(vMean - 150) / 120);

      const score = (hScore * 0.4 + sScore * 0.35 + vScore * 0.25) * 100;
      reasons.push("Renk: YOLO 'extra.color.mean_hsv' kullanıldı");
      return Math.round(Math.max(0, Math.min(100, score)));
    }
    const fallback = clamp01(1 - Math.min(1, stain / 4)) * 100;
    if (stain > 0) reasons.push(`Leke/kirlilik: ${stain}`);
    return Math.round(fallback);
  })();

  const homogeneityBase = (() => {
    if (areaRatios.length) {
      reasons.push("Homojenlik: YOLO 'extra.size.area_ratio' varyansı kullanıldı");
      return clamp01(1 - Math.min(1, areaRatStd / Math.max(1e-6, areaRatMean)));
    }
    return hasAny ? clamp01(1 - Math.min(1, areaStd / Math.max(1e-6, areaMean))) : 0.6;
  })();
  const homogeneityPenalty = clamp01((defect + mold) / 6);
  const homogeneity = clamp01(homogeneityBase * (1 - 0.5 * homogeneityPenalty)) * 100;
  if (defect > 0) reasons.push(`Fiziksel kusur: ${defect}`);
  if (mold > 0) reasons.push(`Küf/mantar şüphesi: ${mold}`);

  if (healthyCount > 0) reasons.push(`Sağlıklı tespit: ${healthyCount}`);
  if (diseasedCount > 0) reasons.push(`Hastalıklı tespit: ${diseasedCount}`);

  const base_score = Math.max(
    0,
    Math.min(
      100,
      Math.round(size * 0.3 + color * 0.25 + homogeneity * 0.2 + env_stability * 0.25)
    )
  );

  const diseasePenalty = diseasedCount > 0 ? Math.min(35, 15 + diseasedCount * 10) : 0;
  if (diseasePenalty > 0) reasons.push(`Hastalık cezası: -${diseasePenalty}`);

  const quality_score = Math.max(0, Math.min(100, Math.round(base_score - diseasePenalty)));

  const grade: "A" | "B" | "C" = quality_score >= 85 ? "A" : quality_score >= 70 ? "B" : "C";
  const market_recommendation =
    diseasedCount > 0 ? "reject_or_rework" : grade === "A" ? "premium_export" : grade === "B" ? "standard_market" : "reject_or_rework";

  if (reasons.length === 0) reasons.push("Belirgin kusur tespiti yok");

  return { applicable: true, size, color, homogeneity, env_stability, quality_score, grade, market_recommendation, reasons };
}

export function VisionManagementPage() {
  const [cameraUrl, setCameraUrl] = useState(() => readLS(LS_CAMERA));
  const [yoloUrl, setYoloUrl] = useState(() => readLS(LS_YOLO));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [yoloRaw, setYoloRaw] = useState<unknown>(null);
  const [qualityTab, setQualityTab] = useState<"cocoon" | "larva">("cocoon");

  const [predictive, setPredictive] = useState<Record<string, unknown> | null>(null);
  const [predictiveErr, setPredictiveErr] = useState<string | null>(null);

  const [envSeries, setEnvSeries] = useState<Record<string, unknown>[] | null>(null);
  const [envErr, setEnvErr] = useState<string | null>(null);

  const [deviceCfg, setDeviceCfg] = useState<DeviceConfig | null>(null);
  const [deviceCfgErr, setDeviceCfgErr] = useState<string | null>(null);

  useEffect(() => {
    setCameraUrl(readLS(LS_CAMERA));
    setYoloUrl(readLS(LS_YOLO));
  }, []);

  const save = () => {
    writeLS(LS_CAMERA, cameraUrl.trim());
    writeLS(LS_YOLO, yoloUrl.trim());
    setSavedAt(new Date().toLocaleString());
  };

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/dashboard/snapshot`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`API hata: ${res.status}`);
        const snap = (await res.json()) as any;
        const p = snap?.latest?.predictive ?? null;
        if (!alive) return;
        setPredictive(p && typeof p === "object" ? (p as Record<string, unknown>) : null);
        setPredictiveErr(null);
      } catch (e: unknown) {
        if (!alive) return;
        setPredictiveErr(e instanceof Error ? e.message : "Tahmin verisi alınamadı");
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/messages?agent=environment&limit=90`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`API hata: ${res.status}`);
        const series = (await res.json()) as unknown;
        const arr = Array.isArray(series) ? (series as unknown[]) : [];
        const cleaned = arr.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
        if (!alive) return;
        setEnvSeries(cleaned);
        setEnvErr(null);
      } catch (e: unknown) {
        if (!alive) return;
        setEnvErr(e instanceof Error ? e.message : "Environment geçmişi alınamadı");
      }
    };

    tick();
    const id = window.setInterval(tick, 8000);
    return () => {
      alive = false;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/devices/config?device_id=${encodeURIComponent(DEVICE_ID)}`, {
          signal: ctrl.signal,
          headers: {
            ...(ACTUATOR_API_KEY ? { "x-api-key": ACTUATOR_API_KEY } : {})
          }
        });
        if (!res.ok) throw new Error(`API hata: ${res.status}`);
        const data = (await res.json()) as any;
        const cfg = data?.config && typeof data.config === "object" ? (data.config as DeviceConfig) : null;
        if (!alive) return;
        setDeviceCfg(cfg);
        setDeviceCfgErr(null);
      } catch (e: unknown) {
        if (!alive) return;
        setDeviceCfgErr(e instanceof Error ? e.message : "Cihaz konfigürasyonu alınamadı");
      }
    };
    tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      alive = false;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  const envLatestStage = useMemo(() => {
    const latest = envSeries && envSeries.length ? envSeries[0] : null;
    const s = latest && typeof latest.stage === "string" ? latest.stage : null;
    return s;
  }, [envSeries]);

  const configStage = typeof deviceCfg?.active_stage === "string" ? deviceCfg?.active_stage : null;
  const selectedStage = configStage;
  const thresholds = getStageThresholds(deviceCfg?.stages, selectedStage);

  const envStab = useMemo(() => computeEnvStability(envSeries ?? [], thresholds), [envSeries, thresholds]);

  const quality = useMemo(() => computeQualityFromYolo(yoloRaw, envStab.score), [yoloRaw, envStab.score]);

  const larvaCount = useMemo(() => {
    if (!yoloRaw || typeof yoloRaw !== "object") return 0;
    const obj = yoloRaw as any;
    const hint = obj?.extra?.stage_hint;
    const hintCount = typeof hint?.larva_count === "number" && Number.isFinite(hint.larva_count) ? Math.max(0, Math.trunc(hint.larva_count)) : null;
    if (hintCount !== null) return hintCount;

    const dets = Array.isArray(obj.detections) ? obj.detections : Array.isArray(obj.predictions) ? obj.predictions : Array.isArray(obj.boxes) ? obj.boxes : [];
    const labels = (Array.isArray(dets) ? dets : [])
      .map((d: any) => String(d?.label ?? d?.class ?? d?.name ?? "").trim().toLowerCase())
      .filter((s: string) => s.length > 0);
    return labels.filter((s: string) => s === "larva" || s.includes("larva") || s.includes("böcek") || s.includes("bocek") || s.includes("kurt")).length;
  }, [yoloRaw]);

  const larvaMetrics = useMemo(() => {
    if (!yoloRaw || typeof yoloRaw !== "object") return null;
    const obj = yoloRaw as any;
    const m = obj?.extra?.larva_metrics;
    return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
  }, [yoloRaw]);

  const molting = useMemo(() => {
    if (!yoloRaw || typeof yoloRaw !== "object") return null;
    const obj = yoloRaw as any;
    const m = obj?.extra?.molting;
    return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
  }, [yoloRaw]);

  const renderScore = (v: number) => (quality.applicable ? String(Math.round(v)) : "-");

  return (
    <AppShell title="Vision Yönetimi" subtitle="Raspberry Pi kamera ve YOLO çıktı ayarları" right={<button className="k-btn" onClick={save}>Kaydet</button>}>
      <div className="k-grid">
        <Panel title="Önizleme" subtitle="Canlı kamera + YOLO overlay" span={6}>
          <VisionPanel
            cameraImageUrl={cameraUrl.trim() || null}
            yoloResultsUrl={yoloUrl.trim() || null}
            onYoloRaw={(raw) => setYoloRaw(raw)}
          />
        </Panel>

        <Panel title="Kalite" subtitle="YOLO sonuçlarından skor/grade (heuristic)" span={6}>
          <div style={{ display: "grid", gap: 10 }}>
            {envErr && <div className="k-alert">{envErr}</div>}
            {deviceCfgErr && <div className="k-alert">{deviceCfgErr}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="k-btn"
                onClick={() => setQualityTab("cocoon")}
                style={{
                  background: qualityTab === "cocoon" ? "rgba(124,92,255,.16)" : undefined,
                  borderColor: qualityTab === "cocoon" ? "rgba(124,92,255,.28)" : undefined,
                  padding: "8px 10px"
                }}
              >
                Koza
              </button>
              <button
                className="k-btn"
                onClick={() => setQualityTab("larva")}
                style={{
                  background: qualityTab === "larva" ? "rgba(124,92,255,.16)" : undefined,
                  borderColor: qualityTab === "larva" ? "rgba(124,92,255,.28)" : undefined,
                  padding: "8px 10px"
                }}
              >
                Larva
              </button>
            </div>

            {qualityTab === "cocoon" ? (
              <>
                {!quality.applicable && (
                  <div className="k-alert">
                    Koza tespit edilmedi. Bu aşamada koza kalite skoru hesaplanmaz. (Larva/ön-koza görüntülerinde N/A)
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 10, alignItems: "stretch" }}>
                  <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel2)" }}>
                    <div className="k-sub">Genel Kalite Skoru</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{quality.applicable ? Math.round(quality.quality_score) : "N/A"}</div>
                      {quality.applicable ? (
                        <>
                          <div style={{ fontWeight: 800, color: scoreColor(quality.quality_score) }}>{scoreLabel(quality.quality_score)}</div>
                          <div
                            style={{
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: "1px solid var(--border)",
                              background: "rgba(255,255,255,.6)",
                              fontWeight: 800
                            }}
                          >
                            Sınıf: {quality.grade}
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div className="k-sub" style={{ marginTop: 8 }}>
                      Bu skor; kamera/YOLO tespitleri (Boyut, Renk, Homojenlik) ve ortam verilerinden (Çevresel Stabilite) hesaplanır.
                    </div>
                  </div>

                  <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel2)" }}>
                    <div className="k-sub">Pazar Önerisi</div>
                    {(() => {
                      const ui = quality.applicable ? marketUi(quality.market_recommendation) : marketUi("");
                      return (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 950, fontSize: 16, color: ui.color }}>{ui.label}</div>
                            <div style={{ width: 10, height: 10, borderRadius: 99, background: ui.color }} />
                          </div>
                          {ui.desc ? <div className="k-sub">{ui.desc}</div> : null}
                          <div className="k-sub">Ayarlardaki Evre: {formatStageDisplay(selectedStage)}</div>
                          <div className="k-sub">Ortamin Raporladığı Evre: {formatStageDisplay(envLatestStage)}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                  <div className="k-sub" style={{ marginBottom: 8 }}>Bileşenler (Ağırlıklı)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(
                      [
                        { key: "Boyut", weight: 0.3, value: quality.size },
                        { key: "Renk", weight: 0.25, value: quality.color },
                        { key: "Homojenlik", weight: 0.2, value: quality.homogeneity },
                        { key: "Çevresel Stabilite", weight: 0.25, value: quality.env_stability }
                      ] as const
                    ).map((c) => {
                      const val = clamp0to100(c.value);
                      const contrib = Math.round(val * c.weight);
                      return (
                        <div key={c.key} style={{ padding: 10, border: "1px dashed var(--border)", borderRadius: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 900 }}>{c.key}</div>
                            <div className="k-sub">Ağırlık: {Math.round(c.weight * 100)}%</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
                            <div style={{ fontSize: 20, fontWeight: 900 }}>{c.key === "Çevresel Stabilite" ? renderScore(val) : quality.applicable ? renderScore(val) : "-"}</div>
                            <div className="k-sub">Katkı: ~{contrib} puan</div>
                          </div>
                          <div style={{ height: 8, borderRadius: 99, background: "rgba(0,0,0,.06)", overflow: "hidden", marginTop: 8 }}>
                            <div style={{ width: `${val}%`, height: "100%", background: scoreColor(val) }} />
                          </div>
                          {c.key === "Çevresel Stabilite" && thresholds ? (
                            <div className="k-sub" style={{ marginTop: 8 }}>
                              Optimum aralık: T {thresholds.t_min}–{thresholds.t_max} °C · H {thresholds.h_min}–{thresholds.h_max} % · CO2 {thresholds.co2_min}–{thresholds.co2_max}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="k-sub" style={{ marginTop: 10 }}>
                    Formül: (Boyut × 0.30) + (Renk × 0.25) + (Homojenlik × 0.20) + (Çevresel Stabilite × 0.25)
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel2)" }}>
                  <div className="k-sub">Larva sayısı (yaklaşık)</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{larvaCount}</div>
                    <div className="k-sub">YOLO etiket sayımı / stage_hint</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {(() => {
                    const m: any = larvaMetrics ?? {};
                    const movementIndex = typeof m.movement_index === "number" && Number.isFinite(m.movement_index) ? (m.movement_index as number) : null;
                    const movementLevel = typeof m.movement_level === "string" ? (m.movement_level as string) : null;
                    const movementStage = typeof m.movement_stage === "string" ? (m.movement_stage as string) : null;
                    const density =
                      typeof m.larva_density_area_ratio === "number" && Number.isFinite(m.larva_density_area_ratio)
                        ? (m.larva_density_area_ratio as number)
                        : null;

                    const levelUi = (() => {
                      const l = (movementLevel || "").toLowerCase();
                      if (l === "high_stress") return { label: "Stres", color: "#ef4444" };
                      if (l === "low_risk") return { label: "Düşük (Risk)", color: "#f59e0b" };
                      if (l === "normal") return { label: "Normal", color: "#22c55e" };
                      return { label: movementLevel || "-", color: "var(--muted)" };
                    })();

                    return (
                      <>
                        <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                          <div className="k-sub">Hareketlilik (movement_index)</div>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
                            <div style={{ fontSize: 22, fontWeight: 900 }}>
                              {movementIndex === null ? "-" : movementIndex.toFixed(3)}
                            </div>
                            <div className="k-sub">0–1</div>
                          </div>
                          <div className="k-sub" style={{ marginTop: 6 }}>Evre: {movementStage || "-"}</div>
                        </div>

                        <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                          <div className="k-sub">Hareket seviyesi</div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: levelUi.color }}>{levelUi.label}</div>
                            <div style={{ width: 10, height: 10, borderRadius: 99, background: levelUi.color }} />
                          </div>
                          <div className="k-sub" style={{ marginTop: 6 }}>Kod: {movementLevel || "-"}</div>
                        </div>

                        <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                          <div className="k-sub">Yoğunluk (alan oranı)</div>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
                            <div style={{ fontSize: 22, fontWeight: 900 }}>{density === null ? "-" : (density * 100).toFixed(2)}</div>
                            <div className="k-sub">%</div>
                          </div>
                          <div className="k-sub" style={{ marginTop: 6 }}>larva bbox toplam alanı / frame alanı</div>
                        </div>

                        <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                          <div className="k-sub">Larva metrikleri (detay)</div>
                          <details>
                            <summary className="k-sub" style={{ cursor: "pointer" }}>JSON</summary>
                            <pre className="k-json" style={{ margin: 0, maxHeight: 160 }}>
                              {JSON.stringify(larvaMetrics ?? null, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                      Gömlek değişimi (Molting) — referans süreler
                    </summary>
                    <div className="k-sub" style={{ marginTop: 8, marginBottom: 8 }}>
                      Molting genelde evre geçişlerinde olur. Bu tablo sahadaki ortalama süreleri gösterir. Anlık durum alttaki “Molting durumu” kartında yer alır.
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Geçiş</th>
                            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Süre</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(
                            [
                              { from: "Instar 1", to: "2", dur: "12–18 saat" },
                              { from: "Instar 2", to: "3", dur: "16–24 saat" },
                              { from: "Instar 3", to: "4", dur: "18–30 saat" },
                              { from: "Instar 4", to: "5", dur: "24–36 saat" }
                            ] as const
                          ).map((r) => (
                            <tr key={`${r.from}-${r.to}`}>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{r.from} → {r.to}</td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{r.dur}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>

                <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Molting durumu (anlık)</div>
                  {(() => {
                    const m: any = molting ?? null;
                    const state = typeof m?.state === "string" ? (m.state as string) : null;
                    const sinceIso = typeof m?.since_iso === "string" ? (m.since_iso as string) : null;
                    const dur = typeof m?.duration_sec === "number" && Number.isFinite(m.duration_sec) ? Math.max(0, Math.trunc(m.duration_sec)) : null;
                    const durMin = dur === null ? null : Math.round(dur / 60);
                    return (
                      <div className="k-sub" style={{ marginBottom: 8 }}>
                        Durum: {state ?? "-"}
                        {sinceIso ? ` · Başlangıç: ${sinceIso}` : ""}
                        {durMin !== null ? ` · Süre: ~${durMin} dk` : ""}
                      </div>
                    );
                  })()}
                  <pre className="k-json" style={{ margin: 0, maxHeight: 180 }}>{JSON.stringify(molting ?? null, null, 2)}</pre>
                </div>

                <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>(Larva odaklı) metrikler</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div>- Larva var/yok, yaklaşık adet/yoğunluk</div>
                    <div>- Hareketlilik (movement)</div>
                    <div>- Anomali/lekelenme (ayrı sınıflar veya ayrı model)</div>
                  </div>
                </div>
              </div>
            )}

            <details>
              <summary className="k-sub" style={{ cursor: "pointer" }}>Detaylar</summary>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                <div>
                  <div className="k-sub" style={{ marginBottom: 6 }}>Sistem nedenleri</div>
                  {listifyReasons(quality.reasons).length ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      {listifyReasons(quality.reasons).map((x, idx) => (
                        <div key={idx} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 12, background: "rgba(255,255,255,.5)" }}>
                          {x}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="k-sub">Neden yok.</div>
                  )}
                </div>
                <div>
                  <div className="k-sub" style={{ marginBottom: 6 }}>Çevresel stabilite teknik detay</div>
                  <pre className="k-json" style={{ maxHeight: 160 }}>{JSON.stringify(envStab.debug, null, 2)}</pre>
                </div>
              </div>
            </details>
          </div>
        </Panel>

        <Panel title="Bağlantı Ayarları" subtitle="URL tanımla ve önizle" span={6}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 10, alignItems: "center" }}>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>Kamera görüntü URL</div>
              <input
                className="k-btn"
                value={cameraUrl}
                onChange={(e) => setCameraUrl(e.target.value)}
                style={{ textAlign: "left" }}
                placeholder="Örn: http://raspberrypi:8080/frame.jpg"
              />

              <div style={{ color: "var(--muted)", fontSize: 12 }}>YOLO sonuç URL (JSON)</div>
              <input
                className="k-btn"
                value={yoloUrl}
                onChange={(e) => setYoloUrl(e.target.value)}
                style={{ textAlign: "left" }}
                placeholder="Örn: http://raspberrypi:8080/yolo/latest.json"
              />
            </div>

            <div className="k-sub">
              Not: Raspberry Pi endpoint’lerinin CORS izinli olması gerekir. CORS sorunu varsa API üzerinde proxy endpoint ekleriz.
              {savedAt ? ` (Son kayıt: ${savedAt})` : ""}
            </div>
          </div>
        </Panel>

        <Panel title="Tahmin" subtitle="Risk skoru ve öneriler" span={6}>
          {predictiveErr ? (
            <div className="k-alert">{predictiveErr}</div>
          ) : (
            <pre className="k-json">{JSON.stringify(predictive ?? null, null, 2)}</pre>
          )}
        </Panel>

        <Panel title="Doküman: QUALITY SCORING AGENT" subtitle="docs/QUALITY SCORING AGENT.md" span={12}>
          <pre className="k-json" style={{ maxHeight: 260 }}>{qualityScoringDoc}</pre>
        </Panel>

        <Panel title="Doküman: VISION AGENT" subtitle="docs/VISION AGENT.md" span={12}>
          <pre className="k-json" style={{ maxHeight: 260 }}>{visionAgentDoc}</pre>
        </Panel>
      </div>
    </AppShell>
  );
}
