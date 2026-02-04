import { useEffect, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";

type DashboardSnapshot = {
  orchestrator: {
    overall_status: "ok" | "warning" | "critical";
    reason: string[];
    actions_required: string[];
    human_approval_required: boolean;
  };
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const res = await fetch(`${API_BASE}/api/dashboard/snapshot`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as DashboardSnapshot;
}

export function AlertsPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetchSnapshot()
      .then(setSnapshot)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const status = snapshot?.orchestrator.overall_status ?? "ok";
  const reasons = snapshot?.orchestrator.reason ?? [];
  const actions = snapshot?.orchestrator.actions_required ?? [];

  return (
    <AppShell title="Alarmlar" subtitle="Kritik uyarılar ve müdahale önerileri" onRefresh={refresh}>
      {error && <div className="k-alert">{error}</div>}

      <div className="k-grid">
        <Panel title="Durum" subtitle="Orchestrator değerlendirmesi" span={12}>
          {loading && !snapshot ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="k-skeleton" style={{ width: 220, height: 28 }} />
              <div className="k-skeleton" style={{ width: 320 }} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Genel durum</div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".2px" }}>{status.toUpperCase()}</div>
                <div className="k-sub">
                  {snapshot?.orchestrator.human_approval_required
                    ? "İnsan onayı gerekli. Aksiyonları uygulamadan önce kontrol edin."
                    : "İnsan onayı gerekmiyor."}
                </div>
              </div>
              <StatusBadge status={status} />
            </div>
          )}
        </Panel>

        <Panel title="Uyarı Nedenleri" subtitle="Sistemin bu değerlendirmeyi yapma gerekçeleri" span={6}>
          {reasons.length ? (
            <ul className="k-list">
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <div className="k-sub">Şu an alarm nedeni yok.</div>
          )}
        </Panel>

        <Panel title="Önerilen Müdahaleler" subtitle="Risk azaltma ve çevresel düzenlemeler" span={6}>
          {actions.length ? (
            <ul className="k-list">
              {actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : (
            <div className="k-sub">Şu an önerilen müdahale yok.</div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
