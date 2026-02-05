import { useEffect, useMemo, useState } from "react";
import type { OrchestratorToDashboardMessage } from "@kozatakip/shared";
import { getDashboardSnapshot, getDeviceConfig, getVisionYoloLatest, type DeviceConfig } from "../services/api";
import { AppShell } from "../layout/AppShell";
import { Card } from "../components/Card";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { formatOverallStatus, formatStage, formatStressLevel, humanizeKeyOrText } from "../utils/actionLabels";

const DEVICE_ID = import.meta.env.VITE_DEVICE_ID ?? "wemos-d1-r32-01";

type Snapshot = {
  orchestrator: OrchestratorToDashboardMessage;
  latest: {
    environment: unknown | null;
    vision: unknown | null;
    predictive: unknown | null;
    quality: unknown | null;
  };
};

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [deviceCfg, setDeviceCfg] = useState<DeviceConfig | null>(null);
  const [yoloLatest, setYoloLatest] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    const yoloUrl = typeof window !== "undefined" ? window.localStorage.getItem("koza:vision:yolo_results_url") : null;
    const pYolo = yoloUrl ? getVisionYoloLatest({ targetUrl: yoloUrl }).catch(() => null) : Promise.resolve(null);

    Promise.all([getDashboardSnapshot(), getDeviceConfig({ deviceId: DEVICE_ID }), pYolo])
      .then(([data, cfgRes, yolo]) => {
        setSnapshot(data);
        setDeviceCfg(cfgRes.config ?? null);
        setYoloLatest(yolo);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Unknown error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const status = snapshot?.orchestrator.overall_status ?? "ok";
  const humanApproval = snapshot?.orchestrator.human_approval_required ?? false;
  const reasons = snapshot?.orchestrator.reason ?? [];
  const actions = snapshot?.orchestrator.actions_required ?? [];

  const env = snapshot?.latest.environment as Record<string, unknown> | null | undefined;
  const vision = snapshot?.latest.vision as Record<string, unknown> | null | undefined;
  const predictive = snapshot?.latest.predictive as Record<string, unknown> | null | undefined;
  const quality = snapshot?.latest.quality as Record<string, unknown> | null | undefined;

  const envStageRaw = typeof env?.stage === "string" ? (env.stage as string) : "-";
  const cfgStageRaw = typeof deviceCfg?.active_stage === "string" ? deviceCfg.active_stage : "-";
  const stageRaw = cfgStageRaw !== "-" ? cfgStageRaw : envStageRaw;
  const envStage = stageRaw === "-" ? "-" : formatStage(stageRaw);
  const envStress = typeof env?.stress_level === "string" ? (env.stress_level as string) : "-";
  const riskLevel = typeof predictive?.risk_level === "string" ? (predictive.risk_level as string) : "-";
  const riskScore =
    typeof predictive?.risk_score === "number" || typeof predictive?.risk_score === "string"
      ? String(predictive.risk_score)
      : "-";
  const qualityGrade = typeof quality?.grade === "string" ? (quality.grade as string) : "-";
  const movement =
    typeof vision?.movement_intensity === "number" || typeof vision?.movement_intensity === "string"
      ? String(vision.movement_intensity)
      : "-";

  const yExtra = useMemo(() => {
    const e = yoloLatest?.extra;
    return e && typeof e === "object" ? (e as Record<string, unknown>) : null;
  }, [yoloLatest]);

  const yLarva = useMemo(() => {
    const m = (yExtra as any)?.larva_metrics;
    return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
  }, [yExtra]);

  const yMolting = useMemo(() => {
    const m = (yExtra as any)?.molting;
    return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
  }, [yExtra]);

  const yDisease = useMemo(() => {
    const d = (yExtra as any)?.diseased_confirmation;
    return d && typeof d === "object" ? (d as Record<string, unknown>) : null;
  }, [yExtra]);

  const movementFallback = useMemo(() => {
    const mi = (yLarva as any)?.movement_index;
    if (typeof mi === "number" && Number.isFinite(mi)) return mi.toFixed(3);
    if (typeof mi === "string") return mi;
    return "-";
  }, [yLarva]);

  const riskFallback = useMemo(() => {
    const confirmed = (yDisease as any)?.confirmed;
    const hits = (yDisease as any)?.hits;
    if (typeof confirmed === "boolean") {
      const h = typeof hits === "number" && Number.isFinite(hits) ? ` (hits=${hits})` : "";
      return `${confirmed ? "HIGH" : "LOW"}${h}`;
    }
    return "-";
  }, [yDisease]);

  const gradeFallback = useMemo(() => {
    const confirmed = (yDisease as any)?.confirmed;
    if (confirmed === true) return "RISK";
    const moltingState = (yMolting as any)?.state;
    if (typeof moltingState === "string" && (moltingState === "MOLTING" || moltingState === "PRE_MOLTING")) return "MOLTING";
    const ml = (yLarva as any)?.movement_level;
    if (ml === "high_stress") return "STRESS";
    if (ml === "low_risk") return "LOW";
    if (yExtra) return "OK";
    return "-";
  }, [yDisease, yMolting, yLarva, yExtra]);

  const moltingLine = useMemo(() => {
    const state = (yMolting as any)?.state;
    const sinceIso = (yMolting as any)?.since_iso;
    const durSec = (yMolting as any)?.duration_sec;
    const durMin = typeof durSec === "number" && Number.isFinite(durSec) ? Math.round(Math.max(0, durSec) / 60) : null;
    if (typeof state !== "string") return null;
    return `Molting: ${state}${typeof sinceIso === "string" ? ` · ${sinceIso}` : ""}${durMin !== null ? ` · ~${durMin} dk` : ""}`;
  }, [yMolting]);

  return (
    <AppShell
      title="Panel"
      subtitle="Orchestrator özeti, aksiyonlar ve son ajan sinyalleri"
      onRefresh={refresh}
    >
      {error && <div className="k-alert">{error}</div>}

      <div className="k-grid">
        <Card title="Genel Durum" right={<StatusBadge status={status} />} span={4}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 140, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <div className="k-kpi">{formatOverallStatus(status)}</div>
              <div className="k-sub">Sistemin genel risk ve stres durum özeti</div>
            </>
          )}
        </Card>

        <Card title="İnsan Onayı" span={4}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 180, height: 28 }} />
              <div className="k-skeleton" style={{ width: 240 }} />
            </div>
          ) : (
            <>
              <div className="k-kpi">{humanApproval ? "GEREKLİ" : "GEREKMİYOR"}</div>
              <div className="k-sub">Çelişki / uyarı durumlarında insan onayı gerekir</div>
            </>
          )}
        </Card>

        <Card title="Sinyaller" span={4}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 260 }} />
            </div>
          ) : (
            <>
              <div className="k-kpi">{reasons.length + actions.length}</div>
              <div className="k-sub">Toplam neden + aksiyon sayısı</div>
            </>
          )}
        </Card>

        <Card title="Ortam Stresi" span={6}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 120, height: 28 }} />
              <div className="k-skeleton" style={{ width: 200 }} />
            </div>
          ) : (
            <>
              <div className="k-sub">Evre: {envStage}</div>
              <div className="k-kpi">{typeof envStress === "string" ? formatStressLevel(envStress) : String(envStress)}</div>
              <div className="k-sub">Çevresel değerlendirme (stres seviyesi)</div>
            </>
          )}
        </Card>

        <Card title="Hastalık Riski" span={6}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 140, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <div className="k-kpi">{String(riskLevel).toUpperCase() !== "-" ? String(riskLevel).toUpperCase() : riskFallback}</div>
              <div className="k-sub">Risk skoru: {riskScore}</div>
              {moltingLine ? <div className="k-sub">{moltingLine}</div> : null}
            </>
          )}
        </Card>

        <Card title="Kalite Sınıfı" span={6}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 90, height: 28 }} />
              <div className="k-skeleton" style={{ width: 240 }} />
            </div>
          ) : (
            <>
              <div className="k-kpi">{String(qualityGrade).toUpperCase() !== "-" ? String(qualityGrade).toUpperCase() : gradeFallback}</div>
              <div className="k-sub">Quality agent (grade)</div>
            </>
          )}
        </Card>

        <Card title="Hareket" span={6}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 90, height: 28 }} />
              <div className="k-skeleton" style={{ width: 220 }} />
            </div>
          ) : (
            <>
              <div className="k-kpi">{movement !== "-" ? movement : movementFallback}</div>
              <div className="k-sub">Vision agent (movement_intensity)</div>
            </>
          )}
        </Card>

        <Panel title="Nedenler" subtitle="Neden bu durum?" span={6}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" />
              <div className="k-skeleton" />
              <div className="k-skeleton" style={{ width: 240 }} />
            </div>
          ) : reasons.length ? (
            <ul className="k-list">
              {reasons.map((r: string, i: number) => (
                <li key={i}>{humanizeKeyOrText(r)}</li>
              ))}
            </ul>
          ) : (
            <div className="k-sub">Şu an neden yok.</div>
          )}
        </Panel>

        <Panel title="Önerilen Aksiyonlar" subtitle="Ortam/önlem aksiyonları" span={6}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" />
              <div className="k-skeleton" style={{ width: 260 }} />
            </div>
          ) : actions.length ? (
            <ul className="k-list">
              {actions.map((a: string, i: number) => (
                <li key={i}>{humanizeKeyOrText(a)}</li>
              ))}
            </ul>
          ) : (
            <div className="k-sub">Şu an aksiyon önerisi yok.</div>
          )}
        </Panel>

        <Panel title="Son Ham Veriler" subtitle="Ajanlardan gelen son mesajlar" span={12}>
          <pre className="k-json">
            {JSON.stringify(
              {
                stage_source: cfgStageRaw !== "-" ? "device_config.active_stage" : envStageRaw !== "-" ? "environment.stage" : "-",
                stage_raw: stageRaw,
                latest: snapshot?.latest ?? null
              },
              null,
              2
            )}
          </pre>
        </Panel>
      </div>
    </AppShell>
  );
}
