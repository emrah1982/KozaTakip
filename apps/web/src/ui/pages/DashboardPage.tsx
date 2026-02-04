import { useEffect, useState } from "react";
import type { OrchestratorToDashboardMessage } from "@kozatakip/shared";
import { getDashboardSnapshot } from "../services/api";
import { AppShell } from "../layout/AppShell";
import { Card } from "../components/Card";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    getDashboardSnapshot()
      .then((data) => {
        setSnapshot(data);
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
              <div className="k-kpi">{status.toUpperCase()}</div>
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
              <div className="k-kpi">{String(envStress).toUpperCase()}</div>
              <div className="k-sub">Environment agent (stress_level)</div>
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
              <div className="k-kpi">{String(riskLevel).toUpperCase()}</div>
              <div className="k-sub">Risk skoru: {riskScore}</div>
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
              <div className="k-kpi">{String(qualityGrade).toUpperCase()}</div>
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
              <div className="k-kpi">{movement}</div>
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
                <li key={i}>{r}</li>
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
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : (
            <div className="k-sub">Şu an aksiyon önerisi yok.</div>
          )}
        </Panel>

        <Panel title="Son Ham Veriler" subtitle="Ajanlardan gelen son mesajlar" span={12}>
          <pre className="k-json">{JSON.stringify(snapshot?.latest ?? null, null, 2)}</pre>
        </Panel>
      </div>
    </AppShell>
  );
}
