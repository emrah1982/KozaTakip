import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";
import { Tabs } from "../components/Tabs";
import { getDeviceConfig, putDeviceConfig, type DeviceConfig, type FeedingPlan, type StageThresholds } from "../services/api";

const DEVICE_ID = import.meta.env.VITE_DEVICE_ID ?? "wemos-d1-r32-01";

type TabKey = "general" | "thresholds" | "feeding" | "connection";


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
  egg_incubation: "Yumurta (Kuluçka) (-10–0 gün)",
  adaptation_0_1: "Çıkış / Adaptasyon (0–1 gün)",
  larva_1: "Larva 1 (1–3 gün)",
  larva_2: "Larva 2 (4–6 gün)",
  larva_3: "Larva 3 (7–10 gün)",
  larva_4: "Larva 4 (11–14 gün)",
  larva_5: "Larva 5 (15–22 gün)",
  cocoon: "Koza (23–28 gün)"
};

function clampNumber(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ensureOpt(v: number | undefined, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return (min + max) / 2;
  return v;
}

function safeNumber(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function readDailyFeedG(row: any) {
  const gMin = safeNumber(row?.daily_feed_g_min);
  const gMax = safeNumber(row?.daily_feed_g_max);
  if (typeof gMin === "number" || typeof gMax === "number") {
    return { gMin: gMin ?? 0, gMax: gMax ?? 0 };
  }

  const kgMin = safeNumber(row?.daily_feed_kg_min);
  const kgMax = safeNumber(row?.daily_feed_kg_max);
  return {
    gMin: typeof kgMin === "number" ? kgMin * 1000 : 0,
    gMax: typeof kgMax === "number" ? kgMax * 1000 : 0
  };
}

function defaultFeedingMatrix(stage: (typeof DEFAULT_STAGES)[number]) {
  if (stage === "egg_incubation") {
    return {
      daily_feed_g_min: 0,
      daily_feed_g_max: 0,
      feedings_per_day_min: 0,
      feedings_per_day_max: 0,
      co2_rise_ppm_min: 0,
      co2_rise_ppm_max: 0,
      critical_minutes_min: 0,
      critical_minutes_max: 0,
      risk_note: "Yemleme yok"
    };
  }

  if (stage === "adaptation_0_1") {
    return {
      daily_feed_g_min: 50,
      daily_feed_g_max: 70,
      feedings_per_day_min: 4,
      feedings_per_day_max: 5,
      co2_rise_ppm_min: 50,
      co2_rise_ppm_max: 100,
      critical_minutes_min: 15,
      critical_minutes_max: 15,
      risk_note: "Çok hassas"
    };
  }

  if (stage === "larva_1") {
    return {
      daily_feed_g_min: 100,
      daily_feed_g_max: 150,
      feedings_per_day_min: 4,
      feedings_per_day_max: 5,
      co2_rise_ppm_min: 80,
      co2_rise_ppm_max: 150,
      critical_minutes_min: 20,
      critical_minutes_max: 20,
      risk_note: "Islak yaprak riski"
    };
  }

  if (stage === "larva_2") {
    return {
      daily_feed_g_min: 300,
      daily_feed_g_max: 400,
      feedings_per_day_min: 4,
      feedings_per_day_max: 4,
      co2_rise_ppm_min: 150,
      co2_rise_ppm_max: 250,
      critical_minutes_min: 20,
      critical_minutes_max: 25,
      risk_note: "Fazla yem = stres"
    };
  }

  if (stage === "larva_3") {
    return {
      daily_feed_g_min: 800,
      daily_feed_g_max: 1000,
      feedings_per_day_min: 3,
      feedings_per_day_max: 3,
      co2_rise_ppm_min: 300,
      co2_rise_ppm_max: 500,
      critical_minutes_min: 30,
      critical_minutes_max: 30,
      risk_note: "CO₂ hızlı yükselir"
    };
  }

  if (stage === "larva_4") {
    return {
      daily_feed_g_min: 2000,
      daily_feed_g_max: 2500,
      feedings_per_day_min: 3,
      feedings_per_day_max: 3,
      co2_rise_ppm_min: 600,
      co2_rise_ppm_max: 900,
      critical_minutes_min: 30,
      critical_minutes_max: 40,
      risk_note: "Flacherie riski"
    };
  }

  if (stage === "larva_5") {
    return {
      daily_feed_g_min: 5000,
      daily_feed_g_max: 6000,
      feedings_per_day_min: 3,
      feedings_per_day_max: 3,
      co2_rise_ppm_min: 800,
      co2_rise_ppm_max: 1200,
      critical_minutes_min: 40,
      critical_minutes_max: 60,
      risk_note: "En kritik evre"
    };
  }

  return {
    daily_feed_g_min: 0,
    daily_feed_g_max: 0,
    feedings_per_day_min: 0,
    feedings_per_day_max: 0,
    co2_rise_ppm_min: 0,
    co2_rise_ppm_max: 0,
    critical_minutes_min: 0,
    critical_minutes_max: 0,
    risk_note: "Yemleme yok"
  };
}

function defaultThresholds(stage: (typeof DEFAULT_STAGES)[number]): StageThresholds {
  if (stage === "egg_incubation") {
    return { t_min: 24, t_opt: 25.5, t_max: 27, h_min: 80, h_opt: 85, h_max: 90, co2_min: 400, co2_opt: 600, co2_max: 1000 };
  }
  if (stage === "adaptation_0_1") {
    return { t_min: 27, t_opt: 28, t_max: 29, h_min: 88, h_opt: 90, h_max: 92, co2_min: 400, co2_opt: 600, co2_max: 800 };
  }
  if (stage === "larva_1") {
    return { t_min: 26, t_opt: 27, t_max: 28, h_min: 85, h_opt: 88, h_max: 90, co2_min: 400, co2_opt: 650, co2_max: 900 };
  }
  if (stage === "larva_2") {
    return { t_min: 25, t_opt: 26, t_max: 27, h_min: 80, h_opt: 83, h_max: 85, co2_min: 400, co2_opt: 700, co2_max: 1000 };
  }
  if (stage === "larva_3") {
    return { t_min: 24, t_opt: 25, t_max: 26, h_min: 75, h_opt: 78, h_max: 80, co2_min: 400, co2_opt: 750, co2_max: 1100 };
  }
  if (stage === "larva_4") {
    return { t_min: 23, t_opt: 24, t_max: 25, h_min: 70, h_opt: 73, h_max: 75, co2_min: 400, co2_opt: 800, co2_max: 1200 };
  }
  if (stage === "larva_5") {
    return { t_min: 23, t_opt: 24, t_max: 25, h_min: 65, h_opt: 68, h_max: 70, co2_min: 400, co2_opt: 800, co2_max: 1200 };
  }

  return { t_min: 22, t_opt: 24, t_max: 25, h_min: 60, h_opt: 65, h_max: 70, co2_min: 400, co2_opt: 600, co2_max: 1000 };
}

function ensureStages(cfg: DeviceConfig | null) {
  const stages: Record<string, StageThresholds> = { ...(cfg?.stages ?? {}) };
  for (const s of DEFAULT_STAGES) {
    if (!stages[s]) stages[s] = defaultThresholds(s);
    const st = stages[s];
    stages[s] = {
      ...st,
      t_opt: ensureOpt(st.t_opt, st.t_min, st.t_max),
      h_opt: ensureOpt(st.h_opt, st.h_min, st.h_max),
      co2_opt: ensureOpt(st.co2_opt, st.co2_min, st.co2_max)
    };
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

  const feeding_plan: FeedingPlan = {
    enabled: Boolean(cfg?.feeding_plan?.enabled),
    notes: typeof cfg?.feeding_plan?.notes === "string" ? cfg.feeding_plan.notes : "",
    larvae_count: typeof cfg?.feeding_plan?.larvae_count === "number" && Number.isFinite(cfg.feeding_plan.larvae_count) ? cfg.feeding_plan.larvae_count : 1000,
    recipes: Array.isArray(cfg?.feeding_plan?.recipes) ? (cfg?.feeding_plan?.recipes as any) : [],
    matrix: Array.isArray(cfg?.feeding_plan?.matrix)
      ? (cfg?.feeding_plan?.matrix as any)
      : DEFAULT_STAGES.map((s) => ({ stage: s, ...defaultFeedingMatrix(s) })),
    decision_params:
      cfg?.feeding_plan?.decision_params && typeof cfg.feeding_plan.decision_params === "object"
        ? (cfg.feeding_plan.decision_params as any)
        : {
            leaf_remaining_ratio_max: 0.3,
            co2_over_opt_ppm: 200,
            humidity_over_opt: 5,
            movement_threshold: 0.6
          }
  };

  return { active_stage, auto_stage, stages, feeding_plan } satisfies DeviceConfig;
}

export function SettingsPage() {
  const [apiBase, setApiBase] = useState(import.meta.env.VITE_API_BASE ?? "");
  const [tab, setTab] = useState<TabKey>("general");
  const [cfg, setCfg] = useState<DeviceConfig>(() => ensureStages(null));
  const [loadingCfg, setLoadingCfg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  type FeedingRecipe = NonNullable<FeedingPlan["recipes"]>[number];
  const [recipesModalOpen, setRecipesModalOpen] = useState(false);
  const [editingRecipeIndex, setEditingRecipeIndex] = useState<number | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<FeedingRecipe>(() => ({ stage: "larva_4" }));

  const onResetDefaults = () => {
    setCfg(ensureStages(null));
    setError(null);
    setSuccess(null);
  };

  const onSave = () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    putDeviceConfig({ deviceId: DEVICE_ID, config: cfg })
      .then(() => {
        setSuccess("Kaydedildi. Cihaz periyodik olarak alıp NVS'e yazacak.");
        if (typeof window !== "undefined") {
          window.localStorage.setItem("koza:device_config:updated_at", String(Date.now()));
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => setSaving(false));
  };

  const validation = useMemo(() => {
    const stageErrors: Record<string, string[]> = {};
    for (const stage of DEFAULT_STAGES) {
      const t = cfg.stages[stage];
      const errs: string[] = [];
      if (t) {
        if (t.t_min > t.t_max) errs.push("Sıcaklık min > max");
        if (ensureOpt(t.t_opt, t.t_min, t.t_max) < t.t_min || ensureOpt(t.t_opt, t.t_min, t.t_max) > t.t_max) errs.push("Sıcaklık opt min/max dışında");
        if (t.h_min > t.h_max) errs.push("Nem min > max");
        if (ensureOpt(t.h_opt, t.h_min, t.h_max) < t.h_min || ensureOpt(t.h_opt, t.h_min, t.h_max) > t.h_max) errs.push("Nem opt min/max dışında");
        if (t.co2_min > t.co2_max) errs.push("CO₂ min > max");
        if (ensureOpt(t.co2_opt, t.co2_min, t.co2_max) < t.co2_min || ensureOpt(t.co2_opt, t.co2_min, t.co2_max) > t.co2_max) errs.push("CO₂ opt min/max dışında");
      }
      if (errs.length) stageErrors[stage] = errs;
    }

    return {
      ok: Object.keys(stageErrors).length === 0,
      stageErrors
    };
  }, [cfg]);

  const tabs = useMemo(
    () => [
      {
        key: "general",
        label: "Genel Ayarlar",
        content: (
          <div className="k-grid">
            <Panel title="Genel Ayarlar" subtitle={`Cihaz: ${DEVICE_ID}`} span={12}>
              <div style={{ display: "grid", gap: 10 }}>
                <div className="k-sub">
                  Bu ayarlar API/DB’ye kaydedilir. Cihaz (ESP32) periyodik olarak çekip kendi kalıcı hafızasına
                  (NVS/Preferences) yazar.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10
                  }}
                >
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Aktif Evre</div>
                  <select
                    className="k-btn"
                    value={cfg.active_stage ?? "larva_4"}
                    onChange={(e) => setCfg((prev) => ({ ...prev, active_stage: e.target.value }))}
                    style={{ padding: "8px 10px" }}
                    disabled={Boolean(cfg.auto_stage?.enabled)}
                  >
                    {DEFAULT_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <div className="k-sub">
                    Cihaz hem eşikleri hem de raporlanan `stage` alanını buna göre kullanır.
                    {cfg.auto_stage?.enabled ? " (Otomatik açıkken Live sayfası evreyi yönetir)" : ""}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>Otomatik Evre İlerlemesi</div>
                      <div className="k-sub">
                        Ayarlardan aktif edip kaydettikten sonra Canlı İzleme ekranı geçen günlere göre evreyi otomatik
                        güncelleyip API’ye yazar (ESP32 ile senkron).
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button
                        className="k-btn"
                        onClick={() =>
                          setCfg((prev) => {
                            const nextEnabled = !Boolean(prev.auto_stage?.enabled);
                            const activeStage = prev.active_stage ?? "larva_4";
                            const startStage =
                              typeof prev.auto_stage?.start_stage === "string" && prev.auto_stage.start_stage.length
                                ? prev.auto_stage.start_stage
                                : activeStage;
                            return {
                              ...prev,
                              auto_stage: {
                                ...prev.auto_stage,
                                enabled: nextEnabled,
                                start_stage: startStage
                              }
                            };
                          })
                        }
                        style={{
                          background: cfg.auto_stage?.enabled ? "rgba(22,163,74,.12)" : "rgba(220,38,38,.08)",
                          borderColor: cfg.auto_stage?.enabled ? "rgba(22,163,74,.28)" : "rgba(220,38,38,.22)",
                          padding: "8px 10px"
                        }}
                      >
                        {cfg.auto_stage?.enabled ? "Açık" : "Kapalı"}
                      </button>

                      <button
                        className="k-btn"
                        onClick={() => {
                          const nowIso = new Date().toISOString();
                          setCfg((prev) => ({
                            ...prev,
                            auto_stage: {
                              ...prev.auto_stage,
                              enabled: true,
                              start_stage: prev.active_stage ?? "larva_4",
                              start_at: nowIso
                            }
                          }));
                        }}
                        disabled={saving || loadingCfg}
                        style={{ padding: "8px 10px" }}
                      >
                        Aktif evreden şimdi başlat
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "220px minmax(220px, 1fr)",
                      gap: 10,
                      alignItems: "center"
                    }}
                  >
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Başlangıç Evresi</div>
                    <select
                      className="k-btn"
                      value={cfg.auto_stage?.start_stage ?? "larva_1"}
                      onChange={(e) =>
                        setCfg((prev) => ({
                          ...prev,
                          auto_stage: { ...prev.auto_stage, start_stage: e.target.value }
                        }))
                      }
                      style={{ padding: "8px 10px" }}
                      disabled={!cfg.auto_stage?.enabled}
                    >
                      {DEFAULT_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>

                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Başlangıç Zamanı</div>
                    <input
                      className="k-btn"
                      type="datetime-local"
                      disabled={!cfg.auto_stage?.enabled}
                      value={(() => {
                        const iso = cfg.auto_stage?.start_at;
                        if (!iso) return "";
                        const d = new Date(iso);
                        if (Number.isNaN(d.getTime())) return "";
                        const pad = (n: number) => String(n).padStart(2, "0");
                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      })()}
                      onChange={(e) => {
                        const dt = e.target.value;
                        const d = new Date(dt);
                        setCfg((prev) => ({
                          ...prev,
                          auto_stage: {
                            ...prev.auto_stage,
                            start_at: Number.isNaN(d.getTime()) ? prev.auto_stage?.start_at : d.toISOString()
                          }
                        }));
                      }}
                      style={{ textAlign: "left" }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: 6
                  }}
                >
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="k-btn" onClick={onResetDefaults} disabled={saving || loadingCfg}>
                      Varsayılanlara dön
                    </button>
                    <button className="k-btn" onClick={onSave} disabled={saving || loadingCfg || !validation.ok}>
                      Kaydet
                    </button>
                    {(saving || loadingCfg) && <span style={{ color: "var(--muted)", fontSize: 12 }}>İşleniyor…</span>}
                  </div>
                  {!validation.ok && (
                    <div style={{ color: "rgba(255, 120, 120, 0.95)", fontSize: 12 }}>
                      Kaydetmeden önce hatalı alanları düzelt.
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </div>
        )
      },
      {
        key: "thresholds",
        label: "Evre Eşikleri",
        content: (
          <div className="k-grid">
            <Panel title="Evre Bazlı Eşikler" subtitle={`Cihaz: ${DEVICE_ID}`} span={12}>
              <div style={{ display: "grid", gap: 10 }}>
                <div className="k-sub">
                  Bu değerler API/DB’ye kalıcı olarak kaydedilir. Cihaz (ESP32) periyodik olarak çekip kendi kalıcı
                  hafızasına (NVS/Preferences) yazar.
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    overflowX: "auto"
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px repeat(8, minmax(88px, 1fr)) 200px",
                      gap: 8,
                      alignItems: "end"
                    }}
                  >
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Evre</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Sıcaklık Min (°C)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Sıcaklık Opt (°C)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Sıcaklık Max (°C)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Nem Min (%)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Nem Opt (%)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Nem Max (%)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>CO₂ Min (ppm)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>CO₂ Opt (ppm)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>CO₂ Max (ppm)</div>
                  </div>

                  {DEFAULT_STAGES.map((stage) => {
                    const t = cfg.stages[stage] ?? defaultThresholds(stage);
                    const errs = validation.stageErrors[stage] ?? [];
                    const hasErr = errs.length > 0;

                    const inputStyle = (bad: boolean) => ({
                      textAlign: "left" as const,
                      border: bad ? "1px solid rgba(255, 80, 80, 0.55)" : undefined
                    });

                    return (
                      <div
                        key={stage}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "220px repeat(9, minmax(130px, 1fr))",
                          gap: 8,
                          alignItems: "center",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{STAGE_LABELS[stage]}</div>
                          <div className="k-sub">{stage}</div>
                          {hasErr && <div className="k-sub" style={{ color: "rgba(255, 120, 120, 0.95)" }}>{errs.join(" · ")}</div>}
                        </div>

                        <input
                          className="k-btn"
                          type="number"
                          step="0.1"
                          value={String(t.t_min)}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, t_min: clampNumber(e.target.value, t.t_min) }
                              }
                            }))
                          }
                          style={inputStyle(t.t_min > t.t_max || ensureOpt(t.t_opt, t.t_min, t.t_max) < t.t_min)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="0.1"
                          value={String(ensureOpt(t.t_opt, t.t_min, t.t_max))}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, t_opt: clampNumber(e.target.value, ensureOpt(t.t_opt, t.t_min, t.t_max)) }
                              }
                            }))
                          }
                          style={inputStyle(ensureOpt(t.t_opt, t.t_min, t.t_max) < t.t_min || ensureOpt(t.t_opt, t.t_min, t.t_max) > t.t_max)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="0.1"
                          value={String(t.t_max)}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, t_max: clampNumber(e.target.value, t.t_max) }
                              }
                            }))
                          }
                          style={inputStyle(t.t_min > t.t_max || ensureOpt(t.t_opt, t.t_min, t.t_max) > t.t_max)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="0.1"
                          value={String(t.h_min)}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, h_min: clampNumber(e.target.value, t.h_min) }
                              }
                            }))
                          }
                          style={inputStyle(t.h_min > t.h_max || ensureOpt(t.h_opt, t.h_min, t.h_max) < t.h_min)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="0.1"
                          value={String(ensureOpt(t.h_opt, t.h_min, t.h_max))}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, h_opt: clampNumber(e.target.value, ensureOpt(t.h_opt, t.h_min, t.h_max)) }
                              }
                            }))
                          }
                          style={inputStyle(ensureOpt(t.h_opt, t.h_min, t.h_max) < t.h_min || ensureOpt(t.h_opt, t.h_min, t.h_max) > t.h_max)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="0.1"
                          value={String(t.h_max)}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, h_max: clampNumber(e.target.value, t.h_max) }
                              }
                            }))
                          }
                          style={inputStyle(t.h_min > t.h_max || ensureOpt(t.h_opt, t.h_min, t.h_max) > t.h_max)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(t.co2_min)}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, co2_min: Math.trunc(clampNumber(e.target.value, t.co2_min)) }
                              }
                            }))
                          }
                          style={inputStyle(t.co2_min > t.co2_max || ensureOpt(t.co2_opt, t.co2_min, t.co2_max) < t.co2_min)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(Math.trunc(ensureOpt(t.co2_opt, t.co2_min, t.co2_max)))}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, co2_opt: Math.trunc(clampNumber(e.target.value, ensureOpt(t.co2_opt, t.co2_min, t.co2_max))) }
                              }
                            }))
                          }
                          style={inputStyle(ensureOpt(t.co2_opt, t.co2_min, t.co2_max) < t.co2_min || ensureOpt(t.co2_opt, t.co2_min, t.co2_max) > t.co2_max)}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(t.co2_max)}
                          onChange={(e) =>
                            setCfg((prev) => ({
                              stages: {
                                ...prev.stages,
                                [stage]: { ...t, co2_max: Math.trunc(clampNumber(e.target.value, t.co2_max)) }
                              }
                            }))
                          }
                          style={inputStyle(t.co2_min > t.co2_max || ensureOpt(t.co2_opt, t.co2_min, t.co2_max) > t.co2_max)}
                        />
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: 6
                  }}
                >
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      className="k-btn"
                      onClick={onResetDefaults}
                      disabled={saving || loadingCfg}
                    >
                      Varsayılanlara dön
                    </button>

                    <button
                      className="k-btn"
                      onClick={onSave}
                      disabled={saving || loadingCfg || !validation.ok}
                    >
                      Kaydet
                    </button>

                    {(saving || loadingCfg) && (
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>İşleniyor…</span>
                    )}
                  </div>

                  {!validation.ok && (
                    <div style={{ color: "rgba(255, 120, 120, 0.95)", fontSize: 12 }}>
                      Kaydetmeden önce hatalı alanları düzelt.
                    </div>
                  )}
                </div>

                <div className="k-sub">
                  Not: Cihaza “push” yerine “poll” modeli kullanılır. Bu sayede Wi-Fi kopmalarında cihaz yeniden bağlanınca
                  ayarları tekrar alabilir.
                </div>
              </div>
            </Panel>
          </div>
        )
      },
      {
        key: "feeding",
        label: "Besleme",
        content: (
          <div className="k-grid">
            <Panel title="Besleme Planı" subtitle={`Cihaz: ${DEVICE_ID}`} span={12}>
              <div style={{ display: "grid", gap: 10 }}>
                <div className="k-sub">Besleme planı cihaz ayarlarına kaydedilir.</div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(260px, 420px) 1fr",
                    gap: 10,
                    alignItems: "start"
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      padding: 10,
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10
                    }}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "grid", gap: 3 }}>
                        <div style={{ fontWeight: 600 }}>Besleme planı</div>
                        <div className="k-sub">Aç/Kapa</div>
                      </div>

                      <button
                        className="k-btn"
                        onClick={() =>
                          setCfg((prev) => ({
                            ...prev,
                            feeding_plan: { ...prev.feeding_plan, enabled: !Boolean(prev.feeding_plan?.enabled) }
                          }))
                        }
                        style={{
                          background: cfg.feeding_plan?.enabled ? "rgba(22,163,74,.12)" : "rgba(220,38,38,.08)",
                          borderColor: cfg.feeding_plan?.enabled ? "rgba(22,163,74,.28)" : "rgba(220,38,38,.22)",
                          padding: "8px 10px"
                        }}
                        disabled={saving || loadingCfg}
                      >
                        {cfg.feeding_plan?.enabled ? "Açık" : "Kapalı"}
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontWeight: 600 }}>Larva adedi</div>
                      <div className="k-sub">Günlük yem değerleri 1000 larva referanslıdır; aşağıdaki tabloda otomatik ölçeklenir.</div>
                      <input
                        className="k-btn"
                        type="number"
                        step="1"
                        value={String(cfg.feeding_plan?.larvae_count ?? 1000)}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            feeding_plan: {
                              ...prev.feeding_plan,
                              larvae_count: Math.max(1, Math.trunc(clampNumber(e.target.value, Number(prev.feeding_plan?.larvae_count ?? 1000))))
                            }
                          }))
                        }
                        style={{ textAlign: "left" }}
                        placeholder="Örn: 30, 100, 1000"
                        disabled={saving || loadingCfg}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      padding: 10,
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>Notlar</div>
                    <textarea
                      className="k-btn"
                      value={cfg.feeding_plan?.notes ?? ""}
                      onChange={(e) => setCfg((prev) => ({ ...prev, feeding_plan: { ...prev.feeding_plan, notes: e.target.value } }))}
                      rows={4}
                      style={{ textAlign: "left", resize: "vertical" }}
                      placeholder="Örn: Yaprak seçimi, hijyen, saklama koşulları, gözlemler..."
                      disabled={saving || loadingCfg}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Reçeteler</div>
                      <div className="k-sub">Evre bazlı besleme reçetelerini ekle/düzenle.</div>
                    </div>
                    <button
                      className="k-btn"
                      onClick={() => {
                        setEditingRecipeIndex(null);
                        setRecipeDraft({ stage: cfg.active_stage ?? "larva_4" } as FeedingRecipe);
                        setRecipesModalOpen(true);
                      }}
                      disabled={saving || loadingCfg}
                      style={{ padding: "8px 10px" }}
                    >
                      Reçete Ekle
                    </button>
                  </div>

                  {Array.isArray(cfg.feeding_plan?.recipes) && cfg.feeding_plan!.recipes!.length > 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {cfg.feeding_plan!.recipes!.map((r, idx) => {
                        const stageKey = (r.stage ?? "larva_4") as (typeof DEFAULT_STAGES)[number];
                        const title = `${STAGE_LABELS[stageKey] ?? r.stage}`;
                        const line = [
                          typeof r.day_in_stage === "number" ? `Gün: ${r.day_in_stage}` : null,
                          typeof r.time === "string" && r.time.length ? `Saat: ${r.time}` : null,
                          typeof r.leaf_type === "string" && r.leaf_type.length ? `Yaprak: ${r.leaf_type}` : null,
                          typeof r.amount_g === "number" ? `Miktar: ${r.amount_g} g` : null,
                          typeof r.freq_per_day === "number" ? `Sıklık: ${r.freq_per_day}/gün` : null
                        ]
                          .filter(Boolean)
                          .join(" · ");

                        return (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              padding: 10,
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: 10
                            }}
                          >
                            <div style={{ minWidth: 220 }}>
                              <div style={{ fontWeight: 600 }}>{title}</div>
                              <div className="k-sub">{line || "-"}</div>
                              {typeof r.notes === "string" && r.notes.length ? <div className="k-sub">Not: {r.notes}</div> : null}
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                className="k-btn"
                                onClick={() => {
                                  setEditingRecipeIndex(idx);
                                  setRecipeDraft({ ...(r as any) });
                                  setRecipesModalOpen(true);
                                }}
                                disabled={saving || loadingCfg}
                                style={{ padding: "8px 10px" }}
                              >
                                Düzenle
                              </button>
                              <button
                                className="k-btn"
                                onClick={() => {
                                  setCfg((prev) => {
                                    const prevRecipes = Array.isArray(prev.feeding_plan?.recipes) ? (prev.feeding_plan!.recipes as any[]) : [];
                                    return {
                                      ...prev,
                                      feeding_plan: {
                                        ...prev.feeding_plan,
                                        recipes: prevRecipes.filter((_, i) => i !== idx)
                                      }
                                    };
                                  });
                                }}
                                disabled={saving || loadingCfg}
                                style={{ padding: "8px 10px", borderColor: "rgba(220,38,38,.22)", background: "rgba(220,38,38,.08)" }}
                              >
                                Sil
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="k-sub">Henüz reçete eklenmedi.</div>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    overflowX: "auto"
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Evre Bazlı Yemleme – CO₂ Matrisi</div>
                  <div className="k-sub">Günlük yem (g) ve yemleme sonrası CO₂ etkisi</div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px repeat(8, minmax(88px, 1fr)) 200px",
                      gap: 8,
                      alignItems: "end"
                    }}
                  >
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Evre</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Günlük Yem Min (g)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Günlük Yem Max (g)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Besleme Min</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Besleme Max</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>CO₂ Artış Min (ppm)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>CO₂ Artış Max (ppm)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Kritik Süre Min (dk)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Kritik Süre Max (dk)</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>Risk</div>
                  </div>

                  {DEFAULT_STAGES.map((stage) => {
                    const matrix = Array.isArray(cfg.feeding_plan?.matrix) ? cfg.feeding_plan?.matrix : [];
                    const row =
                      (matrix as any[]).find((x) => x && typeof x === "object" && (x as any).stage === stage) ??
                      ({ stage, ...defaultFeedingMatrix(stage) } as any);

                    const larvaeCount =
                      typeof cfg.feeding_plan?.larvae_count === "number" && Number.isFinite(cfg.feeding_plan.larvae_count)
                        ? cfg.feeding_plan.larvae_count
                        : 1000;
                    const factor = Math.max(1, larvaeCount) / 1000;
                    const base = readDailyFeedG(row);
                    const scaledMin = Math.round(base.gMin * factor);
                    const scaledMax = Math.round(base.gMax * factor);

                    const updateRow = (patch: Record<string, unknown>) => {
                      setCfg((prev) => {
                        const prevMatrix = Array.isArray(prev.feeding_plan?.matrix) ? (prev.feeding_plan?.matrix as any[]) : [];
                        const has = prevMatrix.some((x) => x && typeof x === "object" && (x as any).stage === stage);
                        const nextMatrix = has
                          ? prevMatrix.map((x) =>
                              x && typeof x === "object" && (x as any).stage === stage ? { ...(x as any), ...patch } : x
                            )
                          : [...prevMatrix, { stage, ...defaultFeedingMatrix(stage), ...patch }];

                        return {
                          ...prev,
                          feeding_plan: {
                            ...prev.feeding_plan,
                            matrix: nextMatrix
                          }
                        };
                      });
                    };

                    return (
                      <div
                        key={stage}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "160px repeat(8, minmax(88px, 1fr)) 200px",
                          gap: 8,
                          alignItems: "center",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(255,255,255,0.06)"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{STAGE_LABELS[stage]}</div>
                          <div className="k-sub">{Math.max(1, larvaeCount)} larva: {scaledMin}–{scaledMax} g/gün</div>
                        </div>

                        <input
                          className="k-btn"
                          type="number"
                          step="0.01"
                          value={String(readDailyFeedG(row).gMin ?? 0)}
                          onChange={(e) => updateRow({ daily_feed_g_min: clampNumber(e.target.value, Number(readDailyFeedG(row).gMin ?? 0)) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="0.01"
                          value={String(readDailyFeedG(row).gMax ?? 0)}
                          onChange={(e) => updateRow({ daily_feed_g_max: clampNumber(e.target.value, Number(readDailyFeedG(row).gMax ?? 0)) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(row.feedings_per_day_min ?? 0)}
                          onChange={(e) => updateRow({ feedings_per_day_min: Math.trunc(clampNumber(e.target.value, Number(row.feedings_per_day_min ?? 0))) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(row.feedings_per_day_max ?? 0)}
                          onChange={(e) => updateRow({ feedings_per_day_max: Math.trunc(clampNumber(e.target.value, Number(row.feedings_per_day_max ?? 0))) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(row.co2_rise_ppm_min ?? 0)}
                          onChange={(e) => updateRow({ co2_rise_ppm_min: Math.trunc(clampNumber(e.target.value, Number(row.co2_rise_ppm_min ?? 0))) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(row.co2_rise_ppm_max ?? 0)}
                          onChange={(e) => updateRow({ co2_rise_ppm_max: Math.trunc(clampNumber(e.target.value, Number(row.co2_rise_ppm_max ?? 0))) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(row.critical_minutes_min ?? 0)}
                          onChange={(e) => updateRow({ critical_minutes_min: Math.trunc(clampNumber(e.target.value, Number(row.critical_minutes_min ?? 0))) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          type="number"
                          step="1"
                          value={String(row.critical_minutes_max ?? 0)}
                          onChange={(e) => updateRow({ critical_minutes_max: Math.trunc(clampNumber(e.target.value, Number(row.critical_minutes_max ?? 0))) })}
                          style={{ textAlign: "left" }}
                        />
                        <input
                          className="k-btn"
                          value={String(row.risk_note ?? "")}
                          onChange={(e) => updateRow({ risk_note: e.target.value })}
                          style={{ textAlign: "left" }}
                          placeholder="Kısa not"
                        />
                      </div>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Karar Parametreleri (Kural Tabanlı)</div>
                  <div className="k-sub">Bu parametreler ileride otomatik yemleme kararında kullanılacaktır.</div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px minmax(220px, 1fr)",
                      gap: 10,
                      alignItems: "center"
                    }}
                  >
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>Kalan yaprak oranı üst sınır (max)</div>
                      <input
                        className="k-btn"
                        type="number"
                        step="0.01"
                        value={String(cfg.feeding_plan?.decision_params?.leaf_remaining_ratio_max ?? 0.3)}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            feeding_plan: {
                              ...prev.feeding_plan,
                              decision_params: {
                                ...prev.feeding_plan?.decision_params,
                                leaf_remaining_ratio_max: clampNumber(e.target.value, Number(prev.feeding_plan?.decision_params?.leaf_remaining_ratio_max ?? 0.3))
                              }
                            }
                          }))
                        }
                        style={{ textAlign: "left" }}
                      />

                      <div style={{ color: "var(--muted)", fontSize: 12 }}>CO₂ opt üzeri tolerans (ppm)</div>
                      <input
                        className="k-btn"
                        type="number"
                        step="1"
                        value={String(cfg.feeding_plan?.decision_params?.co2_over_opt_ppm ?? 200)}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            feeding_plan: {
                              ...prev.feeding_plan,
                              decision_params: {
                                ...prev.feeding_plan?.decision_params,
                                co2_over_opt_ppm: Math.trunc(clampNumber(e.target.value, Number(prev.feeding_plan?.decision_params?.co2_over_opt_ppm ?? 200)))
                              }
                            }
                          }))
                        }
                        style={{ textAlign: "left" }}
                      />

                      <div style={{ color: "var(--muted)", fontSize: 12 }}>Nem opt üzeri tolerans</div>
                      <input
                        className="k-btn"
                        type="number"
                        step="0.1"
                        value={String(cfg.feeding_plan?.decision_params?.humidity_over_opt ?? 5)}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            feeding_plan: {
                              ...prev.feeding_plan,
                              decision_params: {
                                ...prev.feeding_plan?.decision_params,
                                humidity_over_opt: clampNumber(e.target.value, Number(prev.feeding_plan?.decision_params?.humidity_over_opt ?? 5))
                              }
                            }
                          }))
                        }
                        style={{ textAlign: "left" }}
                      />

                      <div style={{ color: "var(--muted)", fontSize: 12 }}>Hareket eşiği (movement_threshold)</div>
                      <input
                        className="k-btn"
                        type="number"
                        step="0.01"
                        value={String(cfg.feeding_plan?.decision_params?.movement_threshold ?? 0.6)}
                        onChange={(e) =>
                          setCfg((prev) => ({
                            ...prev,
                            feeding_plan: {
                              ...prev.feeding_plan,
                              decision_params: {
                                ...prev.feeding_plan?.decision_params,
                                movement_threshold: clampNumber(e.target.value, Number(prev.feeding_plan?.decision_params?.movement_threshold ?? 0.6))
                              }
                            }
                          }))
                        }
                        style={{ textAlign: "left" }}
                      />
                    </div>
                  </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: 6
                  }}
                >
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="k-btn" onClick={onResetDefaults} disabled={saving || loadingCfg}>
                      Varsayılanlara dön
                    </button>
                    <button className="k-btn" onClick={onSave} disabled={saving || loadingCfg || !validation.ok}>
                      Kaydet
                    </button>
                    {(saving || loadingCfg) && <span style={{ color: "var(--muted)", fontSize: 12 }}>İşleniyor…</span>}
                  </div>
                  {!validation.ok && (
                    <div style={{ color: "rgba(255, 120, 120, 0.95)", fontSize: 12 }}>Kaydetmeden önce hatalı alanları düzelt.</div>
                  )}
                </div>
              </div>
            </Panel>
          </div>
        )
      },
      {
        key: "connection",
        label: "Bağlantı",
        content: (
          <div className="k-grid">
            <Panel title="API Bağlantısı" subtitle="Docker kullanımında boş bırakılır" span={12}>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ color: "var(--muted)", fontSize: 12 }}>VITE_API_BASE</label>
                <input
                  className="k-btn"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder="Örn: http://localhost:4000"
                  style={{ textAlign: "left" }}
                />
                <div className="k-sub">
                  Bu alan sadece bilgilendirme amaçlıdır. Değişiklik için `apps/web/.env` dosyası (veya `.env`
                  mekanizması) kullanılır.
                </div>
              </div>
            </Panel>
          </div>
        )
      }
    ],
    [apiBase, cfg, loadingCfg, onResetDefaults, onSave, saving, validation.ok, validation.stageErrors]
  );

  useEffect(() => {
    setLoadingCfg(true);
    setError(null);
    setSuccess(null);
    getDeviceConfig({ deviceId: DEVICE_ID })
      .then((r) => {
        const nextCfg = ensureStages(r.config);
        setCfg(nextCfg);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => setLoadingCfg(false));
  }, []);

  return (
    <AppShell title="Ayarlar" subtitle="Ortam ve bağlantı ayarları">
      {error && <div className="k-alert">{error}</div>}
      {success && <div className="k-alert" style={{ borderColor: "rgba(0,255,140,0.22)" }}>{success}</div>}

      <Tabs value={tab} onChange={(k) => setTab(k as TabKey)} tabs={tabs} />

      {recipesModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setRecipesModalOpen(false);
          }}
        >
          <div
            style={{
              width: "min(720px, 100%)",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 14,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "var(--shadow)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 750, letterSpacing: 0.2 }}>{editingRecipeIndex === null ? "Reçete Ekle" : "Reçete Düzenle"}</div>
                <div className="k-sub">Evreye göre reçete bilgisi ekle</div>
              </div>
              <button className="k-btn" onClick={() => setRecipesModalOpen(false)} style={{ padding: "8px 10px" }}>
                Kapat
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "linear-gradient(180deg, rgba(255,255,255,.96), rgba(247,249,255,.92))"
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 10,
                  alignItems: "start"
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Evre</div>
                  <select
                    className="k-btn"
                    value={recipeDraft.stage ?? "larva_4"}
                    onChange={(e) => setRecipeDraft((p) => ({ ...(p as any), stage: e.target.value }))}
                    style={{ padding: "8px 10px" }}
                  >
                    {DEFAULT_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Evre günü (opsiyonel)</div>
                  <input
                    className="k-btn"
                    type="number"
                    step="1"
                    value={typeof recipeDraft.day_in_stage === "number" ? String(recipeDraft.day_in_stage) : ""}
                    onChange={(e) =>
                      setRecipeDraft((p) => {
                        const v = e.target.value.trim();
                        if (!v.length) {
                          const { day_in_stage, ...rest } = p as any;
                          return rest;
                        }
                        return { ...(p as any), day_in_stage: Math.max(1, Math.trunc(clampNumber(v, 1))) };
                      })
                    }
                    style={{ textAlign: "left" }}
                    placeholder="Örn: 1"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Saat (opsiyonel)</div>
                  <input
                    className="k-btn"
                    type="time"
                    value={typeof recipeDraft.time === "string" ? recipeDraft.time : ""}
                    onChange={(e) =>
                      setRecipeDraft((p) => {
                        const v = e.target.value;
                        if (!v.length) {
                          const { time, ...rest } = p as any;
                          return rest;
                        }
                        return { ...(p as any), time: v };
                      })
                    }
                    style={{ textAlign: "left" }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Yaprak türü (opsiyonel)</div>
                  <input
                    className="k-btn"
                    value={typeof recipeDraft.leaf_type === "string" ? recipeDraft.leaf_type : ""}
                    onChange={(e) =>
                      setRecipeDraft((p) => {
                        const v = e.target.value;
                        if (!v.length) {
                          const { leaf_type, ...rest } = p as any;
                          return rest;
                        }
                        return { ...(p as any), leaf_type: v };
                      })
                    }
                    style={{ textAlign: "left" }}
                    placeholder="Örn: dut"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Miktar (g) (opsiyonel)</div>
                  <input
                    className="k-btn"
                    type="number"
                    step="1"
                    value={typeof recipeDraft.amount_g === "number" ? String(recipeDraft.amount_g) : ""}
                    onChange={(e) =>
                      setRecipeDraft((p) => {
                        const v = e.target.value.trim();
                        if (!v.length) {
                          const { amount_g, ...rest } = p as any;
                          return rest;
                        }
                        return { ...(p as any), amount_g: Math.max(0, Math.trunc(clampNumber(v, 0))) };
                      })
                    }
                    style={{ textAlign: "left" }}
                    placeholder="Örn: 120"
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Günlük sıklık (opsiyonel)</div>
                  <input
                    className="k-btn"
                    type="number"
                    step="1"
                    value={typeof recipeDraft.freq_per_day === "number" ? String(recipeDraft.freq_per_day) : ""}
                    onChange={(e) =>
                      setRecipeDraft((p) => {
                        const v = e.target.value.trim();
                        if (!v.length) {
                          const { freq_per_day, ...rest } = p as any;
                          return rest;
                        }
                        return { ...(p as any), freq_per_day: Math.max(0, Math.trunc(clampNumber(v, 0))) };
                      })
                    }
                    style={{ textAlign: "left" }}
                    placeholder="Örn: 4"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Not (opsiyonel)</div>
                <textarea
                  className="k-btn"
                  value={typeof recipeDraft.notes === "string" ? recipeDraft.notes : ""}
                  onChange={(e) =>
                    setRecipeDraft((p) => {
                      const v = e.target.value;
                      if (!v.length) {
                        const { notes, ...rest } = p as any;
                        return rest;
                      }
                      return { ...(p as any), notes: v };
                    })
                  }
                  rows={3}
                  style={{ textAlign: "left", resize: "vertical" }}
                  placeholder="Örn: Sabah ilk öğün"
                />
              </div>
            </div>

            <div
              style={{
                position: "sticky",
                bottom: 0,
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                background: "var(--panel)"
              }}
            >
              <button className="k-btn" onClick={() => setRecipesModalOpen(false)} style={{ padding: "8px 10px" }}>
                İptal
              </button>
              <button
                className="k-btn"
                onClick={() => {
                  if (!recipeDraft.stage) return;
                  setCfg((prev) => {
                    const prevRecipes = Array.isArray(prev.feeding_plan?.recipes) ? (prev.feeding_plan!.recipes as any[]) : [];
                    const nextRecipes =
                      editingRecipeIndex === null
                        ? [...prevRecipes, recipeDraft]
                        : prevRecipes.map((x, i) => (i === editingRecipeIndex ? recipeDraft : x));
                    return {
                      ...prev,
                      feeding_plan: {
                        ...prev.feeding_plan,
                        recipes: nextRecipes
                      }
                    };
                  });
                  setRecipesModalOpen(false);
                }}
                style={{ padding: "8px 10px" }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
