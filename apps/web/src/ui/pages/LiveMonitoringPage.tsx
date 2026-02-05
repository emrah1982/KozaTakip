import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../components/Card";
import { Panel } from "../components/Panel";
import { VisionPanel } from "../components/VisionPanel";
import { getDeviceConfig, pushVisionStage, putDeviceConfig, type DeviceConfig, type StageThresholds } from "../services/api";
import { formatRecommendedAction, formatStage, formatStressLevel } from "../utils/actionLabels";

type DashboardSnapshot = {
  latest: {
    environment: Record<string, unknown> | null;
    vision: Record<string, unknown> | null;
    predictive: Record<string, unknown> | null;
    quality: Record<string, unknown> | null;
  };
  orchestrator: {
    overall_status: string;
    reason: string[];
    actions_required: string[];
    human_approval_required: boolean;
  };
};

type EnvironmentMessage = {
  agent: "environment";
  timestamp?: string;
  stage?: string;
  temperature?: number;
  humidity?: number;
  co2_ppm?: number;
  stress_level?: string;
  recommended_action?: string[];
} & Record<string, unknown>;

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const DEVICE_ID = import.meta.env.VITE_DEVICE_ID ?? "wemos-d1-r32-01";
const ACTUATOR_API_KEY = import.meta.env.VITE_ACTUATOR_API_KEY ?? "koza_local_key_2026";

const LS_CAMERA = "koza:vision:camera_image_url";
const LS_YOLO = "koza:vision:yolo_results_url";

const DEFAULT_STAGES = [
  "egg_incubation",
  "adaptation_0_1",
  "larva_1",
  "larva_2",
  "larva_3",
  "larva_4",
  "larva_5",
  "cocoon"
] as const;

const STAGE_LABELS: Record<(typeof DEFAULT_STAGES)[number], string> = {
  egg_incubation: "Yumurta (Kuluçka)",
  adaptation_0_1: "Adaptasyon (0–1 gün)",
  larva_1: "1. Evre (Instar 1)",
  larva_2: "2. Evre (Instar 2)",
  larva_3: "3. Evre (Instar 3)",
  larva_4: "4. Evre (Instar 4)",
  larva_5: "5. Evre (Instar 5)",
  cocoon: "Koza"
};

function defaultThresholds(stage: (typeof DEFAULT_STAGES)[number]): StageThresholds {
  if (stage === "egg_incubation") return { t_min: 24, t_opt: 25.5, t_max: 27, h_min: 80, h_opt: 85, h_max: 90, co2_min: 400, co2_opt: 600, co2_max: 1000 };
  if (stage === "adaptation_0_1") return { t_min: 27, t_opt: 28, t_max: 29, h_min: 88, h_opt: 90, h_max: 92, co2_min: 400, co2_opt: 600, co2_max: 800 };
  if (stage === "larva_1") return { t_min: 26, t_opt: 27, t_max: 28, h_min: 85, h_opt: 88, h_max: 90, co2_min: 400, co2_opt: 650, co2_max: 900 };
  if (stage === "larva_2") return { t_min: 25, t_opt: 26, t_max: 27, h_min: 80, h_opt: 83, h_max: 85, co2_min: 400, co2_opt: 700, co2_max: 1000 };
  if (stage === "larva_3") return { t_min: 24, t_opt: 25, t_max: 26, h_min: 75, h_opt: 78, h_max: 80, co2_min: 400, co2_opt: 750, co2_max: 1100 };
  if (stage === "larva_4") return { t_min: 23, t_opt: 24, t_max: 25, h_min: 70, h_opt: 73, h_max: 75, co2_min: 400, co2_opt: 800, co2_max: 1200 };
  if (stage === "larva_5") return { t_min: 23, t_opt: 24, t_max: 25, h_min: 65, h_opt: 68, h_max: 70, co2_min: 400, co2_opt: 800, co2_max: 1200 };
  return { t_min: 22, t_opt: 24, t_max: 25, h_min: 60, h_opt: 65, h_max: 70, co2_min: 400, co2_opt: 600, co2_max: 1000 };
}

function ensureConfig(cfg: DeviceConfig | null): DeviceConfig {
  const stages: Record<string, StageThresholds> = { ...(cfg?.stages ?? {}) };
  for (const s of DEFAULT_STAGES) {
    if (!stages[s]) stages[s] = defaultThresholds(s);
  }
  const active_stage = typeof cfg?.active_stage === "string" && cfg.active_stage.length ? cfg.active_stage : "larva_4";
  const auto_stage = {
    enabled: Boolean(cfg?.auto_stage?.enabled),
    start_stage:
      typeof cfg?.auto_stage?.start_stage === "string" && cfg.auto_stage.start_stage.length
        ? cfg.auto_stage.start_stage
        : "larva_1",
    start_at:
      typeof cfg?.auto_stage?.start_at === "string" && cfg.auto_stage.start_at.length
        ? cfg.auto_stage.start_at
        : new Date().toISOString()
  };
  return { active_stage, auto_stage, stages };
}

function computeAutoStage(input: { startStage: string; startAtIso: string; nowMs: number }): string {
  const order: (typeof DEFAULT_STAGES)[number][] = [
    "egg_incubation",
    "adaptation_0_1",
    "larva_1",
    "larva_2",
    "larva_3",
    "larva_4",
    "larva_5",
    "cocoon"
  ];

  const durationsDays: Record<(typeof DEFAULT_STAGES)[number], number> = {
    egg_incubation: 10,
    adaptation_0_1: 1,
    larva_1: 3,
    larva_2: 3,
    larva_3: 4,
    larva_4: 4,
    larva_5: 8,
    cocoon: 6
  };

  const startAt = new Date(input.startAtIso).getTime();
  if (!Number.isFinite(startAt)) return input.startStage;

  const elapsedDays = Math.max(0, Math.floor((input.nowMs - startAt) / (24 * 60 * 60 * 1000)));
  const startIdx = order.indexOf(input.startStage as any);
  if (startIdx < 0) return input.startStage;

  let idx = startIdx;
  let remaining = elapsedDays;
  while (idx < order.length - 1) {
    const d = durationsDays[order[idx]] ?? 0;
    if (d <= 0) break;
    if (remaining < d) break;
    remaining -= d;
    idx += 1;
  }
  return order[idx];
}

async function logActuatorAudit(input: {
  actuator: "ventilation" | "lighting" | "heater" | "humidifier";
  mode: "manual" | "auto";
  state: boolean;
  payload?: Record<string, unknown>;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/actuators/audit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ACTUATOR_API_KEY ? { "x-api-key": ACTUATOR_API_KEY } : {})
      },
      body: JSON.stringify(input)
    });
    if (!res.ok) {
      return;
    }
  } catch {
    return;
  }
}

async function sendActuatorCommand(input: {
  actuator: "ventilation" | "lighting" | "heater" | "humidifier";
  mode: "manual" | "auto";
  state: boolean;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/actuators/command`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ACTUATOR_API_KEY ? { "x-api-key": ACTUATOR_API_KEY } : {})
      },
      body: JSON.stringify({ ...input, device_id: DEVICE_ID })
    });
    if (!res.ok) return;
  } catch {
    return;
  }
}

async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const res = await fetch(`${API_BASE}/api/dashboard/snapshot`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as DashboardSnapshot;
}

async function fetchEnvironmentSeries(limit = 60): Promise<EnvironmentMessage[]> {
  const res = await fetch(`${API_BASE}/api/messages?agent=environment&limit=${limit}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as EnvironmentMessage[];
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (Math.PI / 180) * angleDeg;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startAngleDeg: number, endAngleDeg: number) {
  const start = polar(cx, cy, r, startAngleDeg);
  const end = polar(cx, cy, r, endAngleDeg);
  const largeArcFlag = Math.abs(endAngleDeg - startAngleDeg) <= 180 ? "0" : "1";
  const sweepFlag = endAngleDeg > startAngleDeg ? "1" : "0";
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(
    2
  )} ${end.y.toFixed(2)}`;
}

function Gauge(props: {
  value: number | null;
  unit: string;
  min: number;
  max: number;
  okMin: number;
  okMax: number;
  decimals?: number;
}) {
  const width = 220;
  const height = 130;
  const cx = width / 2;
  const cy = 110;
  const r = 90;

  const range = Math.max(1e-9, props.max - props.min);
  const toAngle = (v: number) => {
    const t = (v - props.min) / range;
    return -180 + clamp(t, 0, 1) * 180;
  };

  const okStart = toAngle(props.okMin);
  const okEnd = toAngle(props.okMax);

  const valueClamped = props.value === null ? null : clamp(props.value, props.min, props.max);
  const valueAngle = valueClamped === null ? null : toAngle(valueClamped);
  const isBad = props.value === null ? false : props.value < props.okMin || props.value > props.okMax;

  const needleAngle = valueAngle ?? -180;
  const needle = polar(cx, cy, r - 18, needleAngle);

  const decimals = props.decimals ?? 0;
  const valueText = props.value === null ? "-" : `${props.value.toFixed(decimals)} ${props.unit}`;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path d={arcPath(cx, cy, r, -180, 0)} stroke="rgba(0,0,0,.15)" strokeWidth="12" fill="none" />

        {props.okMin > props.min && (
          <path
            d={arcPath(cx, cy, r, -180, okStart)}
            stroke="rgba(220,38,38,.9)"
            strokeWidth="12"
            fill="none"
          />
        )}

        <path
          d={arcPath(cx, cy, r, okStart, okEnd)}
          stroke="rgba(22,163,74,.9)"
          strokeWidth="12"
          fill="none"
        />

        {props.okMax < props.max && (
          <path
            d={arcPath(cx, cy, r, okEnd, 0)}
            stroke="rgba(220,38,38,.9)"
            strokeWidth="12"
            fill="none"
          />
        )}

        <line
          x1={cx}
          y1={cy}
          x2={needle.x}
          y2={needle.y}
          stroke={isBad ? "rgba(220,38,38,.95)" : "rgba(124,92,255,.95)"}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={8} fill="rgba(0,0,0,.35)" />

        <text x={cx} y={64} textAnchor="middle" fontSize="18" fontWeight="700" fill="rgba(0,0,0,.82)">
          {valueText}
        </text>
        <text x={cx} y={84} textAnchor="middle" fontSize="12" fill="rgba(0,0,0,.55)">
          Min {props.okMin} / Max {props.okMax}
        </text>
      </svg>
    </div>
  );
}

function ensureOpt(v: number | undefined, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return (min + max) / 2;
  return v;
}

export function LiveMonitoringPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [envSeries, setEnvSeries] = useState<EnvironmentMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [cameraUrl, setCameraUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(LS_CAMERA) ?? "";
  });
  const [yoloUrl, setYoloUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(LS_YOLO) ?? "";
  });

  const [yoloRaw, setYoloRaw] = useState<unknown>(null);

  const [deviceCfg, setDeviceCfg] = useState<DeviceConfig>(() => ensureConfig(null));
  const [cfgLoading, setCfgLoading] = useState(false);

  const [nowTick, setNowTick] = useState(0);

  const [ventMode, setVentMode] = useState<"auto" | "manual">(() => {
    if (typeof window === "undefined") return "auto";
    const v = window.localStorage.getItem("koza:act:vent:mode");
    return v === "manual" ? "manual" : "auto";
  });
  const [ventManualOn, setVentManualOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("koza:act:vent:manualOn") === "true";
  });

  const [lightMode, setLightMode] = useState<"auto" | "manual">(() => {
    if (typeof window === "undefined") return "auto";
    const v = window.localStorage.getItem("koza:act:light:mode");
    return v === "manual" ? "manual" : "auto";
  });
  const [lightManualOn, setLightManualOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("koza:act:light:manualOn") === "true";
  });

  const [heaterMode, setHeaterMode] = useState<"auto" | "manual">(() => {
    if (typeof window === "undefined") return "auto";
    const v = window.localStorage.getItem("koza:act:heater:mode");
    return v === "manual" ? "manual" : "auto";
  });
  const [heaterManualOn, setHeaterManualOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("koza:act:heater:manualOn") === "true";
  });

  const [humidifierMode, setHumidifierMode] = useState<"auto" | "manual">(() => {
    if (typeof window === "undefined") return "auto";
    const v = window.localStorage.getItem("koza:act:humidifier:mode");
    return v === "manual" ? "manual" : "auto";
  });
  const [humidifierManualOn, setHumidifierManualOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("koza:act:humidifier:manualOn") === "true";
  });

  const refresh = () => {
    setLoading(true);
    setError(null);
    setCfgLoading(true);
    Promise.all([fetchSnapshot(), fetchEnvironmentSeries(60), getDeviceConfig({ deviceId: DEVICE_ID })])
      .then(([snap, series, cfgResp]) => {
        setSnapshot(snap);
        setEnvSeries(series);
        setDeviceCfg(ensureConfig(cfgResp.config));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => {
        setLoading(false);
        setCfgLoading(false);
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  const hasCocoonInYolo = useMemo(() => {
    if (!yoloRaw || typeof yoloRaw !== "object") return null;
    const obj = yoloRaw as any;
    const dets = Array.isArray(obj.detections) ? obj.detections : Array.isArray(obj.predictions) ? obj.predictions : Array.isArray(obj.boxes) ? obj.boxes : [];
    const labels = (Array.isArray(dets) ? dets : [])
      .map((d: any) => String(d?.label ?? d?.class ?? d?.name ?? "").trim().toLowerCase())
      .filter((s: string) => s.length > 0);
    if (!labels.length) return false;
    return labels.some((s: string) => s.includes("cocoon") || s.includes("koza"));
  }, [yoloRaw]);

  const refreshConfigOnly = () => {
    setCfgLoading(true);
    void getDeviceConfig({ deviceId: DEVICE_ID })
      .then((cfgResp) => {
        setDeviceCfg(ensureConfig(cfgResp.config));
      })
      .catch(() => {
        return;
      })
      .finally(() => setCfgLoading(false));
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "koza:device_config:updated_at") {
        refreshConfigOnly();
      }
      if (e.key === LS_CAMERA) {
        setCameraUrl(typeof e.newValue === "string" ? e.newValue : "");
      }
      if (e.key === LS_YOLO) {
        setYoloUrl(typeof e.newValue === "string" ? e.newValue : "");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCameraUrl(window.localStorage.getItem(LS_CAMERA) ?? "");
    setYoloUrl(window.localStorage.getItem(LS_YOLO) ?? "");
  }, []);

  useEffect(() => {
    const onFocus = () => refreshConfigOnly();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((v) => v + 1), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    refreshConfigOnly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowTick]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:vent:mode", ventMode);
  }, [ventMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:vent:manualOn", String(ventManualOn));
  }, [ventManualOn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:light:mode", lightMode);
  }, [lightMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:light:manualOn", String(lightManualOn));
  }, [lightManualOn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:heater:mode", heaterMode);
  }, [heaterMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:heater:manualOn", String(heaterManualOn));
  }, [heaterManualOn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:humidifier:mode", humidifierMode);
  }, [humidifierMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("koza:act:humidifier:manualOn", String(humidifierManualOn));
  }, [humidifierManualOn]);

  const latestEnv = envSeries?.[0] ?? (snapshot?.latest.environment as any | null | undefined) ?? null;
  const temperature = toNumber(latestEnv?.temperature);
  const humidity = toNumber(latestEnv?.humidity);
  const co2ppm = toNumber(latestEnv?.co2_ppm);
  const stressLevel = typeof latestEnv?.stress_level === "string" ? latestEnv.stress_level : "-";
  const stage = typeof latestEnv?.stage === "string" ? latestEnv.stage : "-";

  const selectedStage = (typeof deviceCfg.active_stage === "string" && deviceCfg.active_stage.length
    ? deviceCfg.active_stage
    : "larva_4") as (typeof DEFAULT_STAGES)[number] | string;

  const autoEnabled = Boolean(deviceCfg.auto_stage?.enabled);
  const autoStage = useMemo(() => {
    if (!autoEnabled) return selectedStage;
    return computeAutoStage({
      startStage: deviceCfg.auto_stage?.start_stage ?? "larva_1",
      startAtIso: deviceCfg.auto_stage?.start_at ?? new Date().toISOString(),
      nowMs: Date.now()
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnabled, deviceCfg.auto_stage?.start_stage, deviceCfg.auto_stage?.start_at, selectedStage, nowTick]);

  const effectiveStage = autoStage;

  useEffect(() => {
    if (!autoEnabled) return;
    if (typeof effectiveStage !== "string" || effectiveStage.length === 0) return;
    const current = deviceCfg.active_stage ?? "";
    if (current === effectiveStage) return;

    const nextCfg: DeviceConfig = { ...deviceCfg, active_stage: effectiveStage };
    setDeviceCfg(nextCfg);
    void putDeviceConfig({ deviceId: DEVICE_ID, config: nextCfg }).catch(() => {
      setError("Otomatik evre güncellemesi API’ye yazılamadı.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnabled, effectiveStage]);

  const thresholds =
    (typeof effectiveStage === "string" && deviceCfg.stages[effectiveStage]) ||
    (DEFAULT_STAGES.includes(effectiveStage as any) ? defaultThresholds(effectiveStage as any) : defaultThresholds("larva_4"));

  const tOkMin = thresholds.t_min;
  const tOkOpt = ensureOpt(thresholds.t_opt, thresholds.t_min, thresholds.t_max);
  const tOkMax = thresholds.t_max;
  const hOkMin = thresholds.h_min;
  const hOkOpt = ensureOpt(thresholds.h_opt, thresholds.h_min, thresholds.h_max);
  const hOkMax = thresholds.h_max;
  const co2OkMin = thresholds.co2_min;
  const co2OkOpt = Math.trunc(ensureOpt(thresholds.co2_opt, thresholds.co2_min, thresholds.co2_max));
  const co2OkMax = thresholds.co2_max;

  const recommendedActions = Array.isArray(latestEnv?.recommended_action)
    ? (latestEnv?.recommended_action as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const normalizedActions = recommendedActions.map((a) =>
    String(a)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/-+/g, "_")
  );
  const ventilationRequested = normalizedActions.includes("increase_ventilation");
  const lightingRequested =
    normalizedActions.includes("increase_lighting") ||
    normalizedActions.includes("turn_on_lights") ||
    normalizedActions.includes("lights_on");
  const heaterRequested =
    normalizedActions.includes("increase_heating") ||
    normalizedActions.includes("turn_on_heater") ||
    normalizedActions.includes("heater_on");
  const humidifierRequested =
    normalizedActions.includes("increase_humidity") ||
    normalizedActions.includes("turn_on_humidifier") ||
    normalizedActions.includes("humidifier_on");

  const ventEffectiveOn = ventMode === "auto" ? ventilationRequested : ventManualOn;
  const lightEffectiveOn = lightMode === "auto" ? lightingRequested : lightManualOn;
  const heaterEffectiveOn = heaterMode === "auto" ? heaterRequested : heaterManualOn;
  const humidifierEffectiveOn = humidifierMode === "auto" ? humidifierRequested : humidifierManualOn;

  const buildActuatorPayload = (
    actuator: "ventilation" | "lighting" | "heater" | "humidifier"
  ): Record<string, unknown> => {
    const base: Record<string, unknown> = {
      stage: effectiveStage,
      stress_level: stressLevel,
      env_timestamp: typeof latestEnv?.timestamp === "string" ? latestEnv.timestamp : null
    };

    const addIfNumber = (key: string, v: number | null) => {
      if (typeof v === "number" && Number.isFinite(v)) base[key] = v;
    };

    if (actuator === "ventilation") {
      addIfNumber("temperature", temperature);
      addIfNumber("humidity", humidity);
      addIfNumber("co2_ppm", co2ppm);
      return base;
    }

    if (actuator === "heater") {
      addIfNumber("temperature", temperature);
      return base;
    }

    if (actuator === "humidifier") {
      addIfNumber("humidity", humidity);
      return base;
    }

    return base;
  };

  const onVentManual = (next: boolean) => {
    setVentManualOn(next);
    void sendActuatorCommand({ actuator: "ventilation", mode: "manual", state: next });
    void logActuatorAudit({
      actuator: "ventilation",
      mode: "manual",
      state: next,
      payload: buildActuatorPayload("ventilation")
    });
  };

  const onLightManual = (next: boolean) => {
    setLightManualOn(next);
    void sendActuatorCommand({ actuator: "lighting", mode: "manual", state: next });
    void logActuatorAudit({
      actuator: "lighting",
      mode: "manual",
      state: next,
      payload: buildActuatorPayload("lighting")
    });
  };

  const onHeaterManual = (next: boolean) => {
    setHeaterManualOn(next);
    void sendActuatorCommand({ actuator: "heater", mode: "manual", state: next });
    void logActuatorAudit({
      actuator: "heater",
      mode: "manual",
      state: next,
      payload: buildActuatorPayload("heater")
    });
  };

  const onHumidifierManual = (next: boolean) => {
    setHumidifierManualOn(next);
    void sendActuatorCommand({ actuator: "humidifier", mode: "manual", state: next });
    void logActuatorAudit({
      actuator: "humidifier",
      mode: "manual",
      state: next,
      payload: buildActuatorPayload("humidifier")
    });
  };

  return (
    <AppShell
      title="Canlı İzleme"
      subtitle="Ortam sensörleri ve görüntü sinyalleri (anlık)"
      onRefresh={refresh}
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Aktif Evre</div>
          <select
            className="k-btn"
            value={effectiveStage}
            disabled={cfgLoading || loading || autoEnabled}
            onChange={(e) => {
              const next = e.target.value;
              const nextCfg = { ...deviceCfg, active_stage: next };
              setDeviceCfg(nextCfg);
              void putDeviceConfig({ deviceId: DEVICE_ID, config: nextCfg }).catch(() => {
                setError("Aktif evre kaydedilemedi.");
              });

              const y = yoloUrl.trim();
              if (y) {
                try {
                  const u = new URL(y);
                  const target = `${u.origin}/config/stage`;
                  void pushVisionStage({ targetUrl: target, stage: next });
                } catch {
                  // ignore
                }
              }
            }}
            style={{ padding: "8px 10px" }}
          >
            {DEFAULT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          {autoEnabled && <div className="k-sub">Otomatik</div>}
        </div>
      }
    >
      {error && <div className="k-alert">{error}</div>}

      <div className="k-grid">
        <Card
          title="Sıcaklık"
          span={4}
          right={
            <span
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(250, 204, 21, 0.18)",
                border: "1px solid rgba(250, 204, 21, 0.35)",
                color: "rgba(0,0,0,.72)",
                fontWeight: 600
              }}
            >
              Opt {tOkOpt.toFixed(1)}°C
            </span>
          }
        >
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <Gauge value={temperature} unit="°C" min={10} max={40} okMin={tOkMin} okMax={tOkMax} decimals={1} />
            </>
          )}
        </Card>

        <Card
          title="Nem"
          span={4}
          right={
            <span
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(250, 204, 21, 0.18)",
                border: "1px solid rgba(250, 204, 21, 0.35)",
                color: "rgba(0,0,0,.72)",
                fontWeight: 600
              }}
            >
              Opt {hOkOpt}%
            </span>
          }
        >
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <Gauge value={humidity} unit="%" min={30} max={100} okMin={hOkMin} okMax={hOkMax} decimals={0} />
            </>
          )}
        </Card>

        <Card
          title="CO₂"
          span={4}
          right={
            <span
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(250, 204, 21, 0.18)",
                border: "1px solid rgba(250, 204, 21, 0.35)",
                color: "rgba(0,0,0,.72)",
                fontWeight: 600
              }}
            >
              Opt {co2OkOpt} ppm
            </span>
          }
        >
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <Gauge value={co2ppm} unit="ppm" min={400} max={2500} okMin={co2OkMin} okMax={co2OkMax} decimals={0} />
            </>
          )}
        </Card>

        <Card title="Havalandırma" span={4}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 140, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${ventEffectiveOn ? "rgba(22,163,74,.35)" : "rgba(220,38,38,.28)"}`,
                background: ventEffectiveOn ? "rgba(22,163,74,.06)" : "rgba(220,38,38,.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="k-kpi" style={{ margin: 0 }}>
                    {ventEffectiveOn ? "AÇIK" : "KAPALI"}
                  </div>
                  <div className="k-sub">
                    Mod: {ventMode === "auto" ? "Otomatik" : "Manuel"}
                    {ventMode === "auto"
                      ? ventilationRequested
                        ? " (Öneri: artır)"
                        : " (Öneri yok)"
                      : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    className="k-btn"
                    onClick={() => setVentMode("auto")}
                    style={{
                      background: ventMode === "auto" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: ventMode === "auto" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Otomatik
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => setVentMode("manual")}
                    style={{
                      background: ventMode === "manual" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: ventMode === "manual" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Manuel
                  </button>
                </div>
              </div>

              {ventMode === "manual" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="k-btn"
                    onClick={() => onVentManual(true)}
                    style={{
                      background: ventManualOn ? "rgba(22,163,74,.12)" : undefined,
                      borderColor: ventManualOn ? "rgba(22,163,74,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Aç
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => onVentManual(false)}
                    style={{
                      background: !ventManualOn ? "rgba(220,38,38,.10)" : undefined,
                      borderColor: !ventManualOn ? "rgba(220,38,38,.22)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Kapat
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Aydınlatma" span={4}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 140, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${lightEffectiveOn ? "rgba(22,163,74,.35)" : "rgba(220,38,38,.22)"}`,
                background: lightEffectiveOn ? "rgba(22,163,74,.06)" : "rgba(220,38,38,.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="k-kpi" style={{ margin: 0 }}>
                    {lightEffectiveOn ? "AÇIK" : "KAPALI"}
                  </div>
                  <div className="k-sub">
                    Mod: {lightMode === "auto" ? "Otomatik" : "Manuel"}
                    {lightMode === "auto"
                      ? lightingRequested
                        ? " (Öneri: aç)"
                        : " (Öneri yok)"
                      : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    className="k-btn"
                    onClick={() => setLightMode("auto")}
                    style={{
                      background: lightMode === "auto" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: lightMode === "auto" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Otomatik
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => setLightMode("manual")}
                    style={{
                      background: lightMode === "manual" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: lightMode === "manual" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Manuel
                  </button>
                </div>
              </div>

              {lightMode === "manual" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="k-btn"
                    onClick={() => onLightManual(true)}
                    style={{
                      background: lightManualOn ? "rgba(124,92,255,.12)" : undefined,
                      borderColor: lightManualOn ? "rgba(124,92,255,.26)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Aç
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => onLightManual(false)}
                    style={{
                      background: !lightManualOn ? "rgba(0,0,0,.06)" : undefined,
                      borderColor: !lightManualOn ? "rgba(0,0,0,.14)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Kapat
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Isıtıcı" span={4}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 140, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${heaterEffectiveOn ? "rgba(22,163,74,.35)" : "rgba(220,38,38,.22)"}`,
                background: heaterEffectiveOn ? "rgba(22,163,74,.06)" : "rgba(220,38,38,.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="k-kpi" style={{ margin: 0 }}>
                    {heaterEffectiveOn ? "AÇIK" : "KAPALI"}
                  </div>
                  <div className="k-sub">
                    Mod: {heaterMode === "auto" ? "Otomatik" : "Manuel"}
                    {heaterMode === "auto"
                      ? heaterRequested
                        ? " (Öneri: ısıt)"
                        : " (Öneri yok)"
                      : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    className="k-btn"
                    onClick={() => setHeaterMode("auto")}
                    style={{
                      background: heaterMode === "auto" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: heaterMode === "auto" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Otomatik
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => setHeaterMode("manual")}
                    style={{
                      background: heaterMode === "manual" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: heaterMode === "manual" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Manuel
                  </button>
                </div>
              </div>

              {heaterMode === "manual" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="k-btn"
                    onClick={() => onHeaterManual(true)}
                    style={{
                      background: heaterManualOn ? "rgba(22,163,74,.12)" : undefined,
                      borderColor: heaterManualOn ? "rgba(22,163,74,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Aç
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => onHeaterManual(false)}
                    style={{
                      background: !heaterManualOn ? "rgba(220,38,38,.10)" : undefined,
                      borderColor: !heaterManualOn ? "rgba(220,38,38,.22)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Kapat
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Nem Cihazı" span={4}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 140, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${humidifierEffectiveOn ? "rgba(22,163,74,.35)" : "rgba(220,38,38,.22)"}`,
                background: humidifierEffectiveOn ? "rgba(22,163,74,.06)" : "rgba(220,38,38,.05)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="k-kpi" style={{ margin: 0 }}>
                    {humidifierEffectiveOn ? "AÇIK" : "KAPALI"}
                  </div>
                  <div className="k-sub">
                    Mod: {humidifierMode === "auto" ? "Otomatik" : "Manuel"}
                    {humidifierMode === "auto"
                      ? humidifierRequested
                        ? " (Öneri: nemlendir)"
                        : " (Öneri yok)"
                      : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    className="k-btn"
                    onClick={() => setHumidifierMode("auto")}
                    style={{
                      background: humidifierMode === "auto" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: humidifierMode === "auto" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Otomatik
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => setHumidifierMode("manual")}
                    style={{
                      background: humidifierMode === "manual" ? "rgba(124,92,255,.16)" : undefined,
                      borderColor: humidifierMode === "manual" ? "rgba(124,92,255,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Manuel
                  </button>
                </div>
              </div>

              {humidifierMode === "manual" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="k-btn"
                    onClick={() => onHumidifierManual(true)}
                    style={{
                      background: humidifierManualOn ? "rgba(22,163,74,.12)" : undefined,
                      borderColor: humidifierManualOn ? "rgba(22,163,74,.28)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Aç
                  </button>
                  <button
                    className="k-btn"
                    onClick={() => onHumidifierManual(false)}
                    style={{
                      background: !humidifierManualOn ? "rgba(220,38,38,.10)" : undefined,
                      borderColor: !humidifierManualOn ? "rgba(220,38,38,.22)" : undefined,
                      padding: "8px 10px",
                    }}
                  >
                    Kapat
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Panel title="Ortam Özeti" subtitle="Evre / Stres / Önerilen aksiyon" span={6}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" />
              <div className="k-skeleton" style={{ width: 260 }} />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 4 }}>
                <div className="k-sub">Evre</div>
                <div style={{ fontWeight: 700 }}>{typeof effectiveStage === "string" ? formatStage(effectiveStage) : "-"}</div>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <div className="k-sub">Stres seviyesi</div>
                <div style={{ fontWeight: 700 }}>
                  {typeof stressLevel === "string" && stressLevel.length ? formatStressLevel(stressLevel) : "-"}
                </div>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <div className="k-sub">Önerilen aksiyonlar</div>
                <pre className="k-json" style={{ maxHeight: 160 }}>
                  {JSON.stringify(
                    (Array.isArray(latestEnv?.recommended_action)
                      ? (latestEnv?.recommended_action as unknown[]).filter((v): v is string => typeof v === "string")
                      : []
                    ).map((a) => formatRecommendedAction(a)),
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Görüntü Sinyalleri" subtitle="Hareket / Doku / Güven" span={6}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" />
              <div className="k-skeleton" style={{ width: 240 }} />
            </div>
          ) : (
            <pre className="k-json">{JSON.stringify(snapshot?.latest.vision ?? null, null, 2)}</pre>
          )}
        </Panel>

        <Panel title="Kamera & YOLO" subtitle="Raspberry Pi görüntüsü ve model tespitleri" span={12}>
          <VisionPanel
            cameraImageUrl={cameraUrl.trim() ? cameraUrl.trim() : null}
            yoloResultsUrl={yoloUrl.trim() ? yoloUrl.trim() : null}
            onYoloRaw={(raw) => setYoloRaw(raw)}
          />
          {hasCocoonInYolo === false && (
            <div className="k-alert" style={{ marginTop: 10 }}>
              Koza tespit edilmedi. Bu aşamada koza kalite skoru hesaplanmaz (N/A). Eğer görüntüler larva/ön-koza ise bu beklenen bir durumdur.
            </div>
          )}
        </Panel>

        <Panel title="Tahmin" subtitle="Risk skoru ve öneriler" span={6}>
          <pre className="k-json">{JSON.stringify(snapshot?.latest.predictive ?? null, null, 2)}</pre>
        </Panel>

        <Panel title="Kalite" subtitle="Koza kalite sinyalleri" span={6}>
          <pre className="k-json">{JSON.stringify(snapshot?.latest.quality ?? null, null, 2)}</pre>
        </Panel>
      </div>
    </AppShell>
  );
}
