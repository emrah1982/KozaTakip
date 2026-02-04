import { useEffect, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Card } from "../components/Card";
import { Panel } from "../components/Panel";

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

async function logActuatorAudit(input: {
  actuator: "ventilation" | "lighting" | "heater" | "humidifier";
  mode: "manual" | "auto";
  state: boolean;
  payload?: Record<string, unknown>;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/actuators/audit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!res.ok) {
      return;
    }
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

export function LiveMonitoringPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [envSeries, setEnvSeries] = useState<EnvironmentMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    Promise.all([fetchSnapshot(), fetchEnvironmentSeries(60)])
      .then(([snap, series]) => {
        setSnapshot(snap);
        setEnvSeries(series);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

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

  const recommendedActions = Array.isArray(latestEnv?.recommended_action)
    ? (latestEnv?.recommended_action as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const ventilationRequested = recommendedActions.includes("increase_ventilation");
  const lightingRequested =
    recommendedActions.includes("increase_lighting") ||
    recommendedActions.includes("turn_on_lights") ||
    recommendedActions.includes("lights_on");
  const heaterRequested =
    recommendedActions.includes("increase_heating") ||
    recommendedActions.includes("turn_on_heater") ||
    recommendedActions.includes("heater_on");
  const humidifierRequested =
    recommendedActions.includes("increase_humidity") ||
    recommendedActions.includes("turn_on_humidifier") ||
    recommendedActions.includes("humidifier_on");

  const ventEffectiveOn = ventMode === "auto" ? ventilationRequested : ventManualOn;
  const lightEffectiveOn = lightMode === "auto" ? lightingRequested : lightManualOn;
  const heaterEffectiveOn = heaterMode === "auto" ? heaterRequested : heaterManualOn;
  const humidifierEffectiveOn = humidifierMode === "auto" ? humidifierRequested : humidifierManualOn;

  const buildActuatorPayload = (
    actuator: "ventilation" | "lighting" | "heater" | "humidifier"
  ): Record<string, unknown> => {
    const base: Record<string, unknown> = {
      stage,
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
    void logActuatorAudit({
      actuator: "ventilation",
      mode: "manual",
      state: next,
      payload: buildActuatorPayload("ventilation")
    });
  };

  const onLightManual = (next: boolean) => {
    setLightManualOn(next);
    void logActuatorAudit({
      actuator: "lighting",
      mode: "manual",
      state: next,
      payload: buildActuatorPayload("lighting")
    });
  };

  const onHeaterManual = (next: boolean) => {
    setHeaterManualOn(next);
    void logActuatorAudit({
      actuator: "heater",
      mode: "manual",
      state: next,
      payload: buildActuatorPayload("heater")
    });
  };

  const onHumidifierManual = (next: boolean) => {
    setHumidifierManualOn(next);
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
    >
      {error && <div className="k-alert">{error}</div>}

      <div className="k-grid">
        <Card title="Sıcaklık" span={4}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <Gauge value={temperature} unit="°C" min={10} max={40} okMin={24} okMax={28} decimals={1} />
            </>
          )}
        </Card>

        <Card title="Nem" span={4}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <Gauge value={humidity} unit="%" min={30} max={100} okMin={75} okMax={85} decimals={0} />
            </>
          )}
        </Card>

        <Card title="CO₂" span={4}>
          {loading && !snapshot && !envSeries ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <Gauge value={co2ppm} unit="ppm" min={400} max={2500} okMin={400} okMax={1200} decimals={0} />
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
                <div style={{ fontWeight: 700 }}>{String(stage).toUpperCase()}</div>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <div className="k-sub">Stres seviyesi</div>
                <div style={{ fontWeight: 700 }}>{String(stressLevel).toUpperCase()}</div>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <div className="k-sub">Önerilen aksiyonlar</div>
                <pre className="k-json" style={{ maxHeight: 160 }}>
                  {JSON.stringify(latestEnv?.recommended_action ?? [], null, 2)}
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
