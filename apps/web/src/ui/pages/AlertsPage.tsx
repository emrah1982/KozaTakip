import { useEffect, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import {
  formatOverallStatus,
  formatRecommendedAction,
  formatRiskFlagKey,
  formatStage,
  formatStressLevel,
  humanizeKeyOrText
} from "../utils/actionLabels";

type DashboardSnapshot = {
  orchestrator: {
    overall_status: "ok" | "warning" | "critical";
    reason: string[];
    actions_required: string[];
    human_approval_required: boolean;
  };
};

type EnvironmentMessage = {
  agent: "environment";
  timestamp?: string;
  stage?: string;
  stress_level?: string;
  recommended_action?: string[];
  risk_flags?: {
    flacherie?: boolean;
    muscardine?: boolean;
    cocoon_quality?: boolean;
    rapid_temp_change?: boolean;
  };
} & Record<string, unknown>;

type DeviceStatus = {
  ok: true;
  device: {
    device_id: string;
    last_seen_at: string;
    last_rssi: number | null;
    last_ip: string | null;
  } | null;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const DEVICE_ID = import.meta.env.VITE_DEVICE_ID ?? "wemos-d1-r32-01";
const ACTUATOR_API_KEY = import.meta.env.VITE_ACTUATOR_API_KEY ?? "koza_local_key_2026";

async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const res = await fetch(`${API_BASE}/api/dashboard/snapshot`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as DashboardSnapshot;
}

async function fetchLatestEnvironment(): Promise<EnvironmentMessage | null> {
  const res = await fetch(`${API_BASE}/api/messages?agent=environment&limit=1`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const arr = (await res.json()) as EnvironmentMessage[];
  return arr?.[0] ?? null;
}

async function fetchDeviceStatus(): Promise<DeviceStatus> {
  const res = await fetch(`${API_BASE}/api/devices/status?device_id=${encodeURIComponent(DEVICE_ID)}`, {
    headers: {
      ...(ACTUATOR_API_KEY ? { "x-api-key": ACTUATOR_API_KEY } : {})
    }
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as DeviceStatus;
}

export function AlertsPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [device, setDevice] = useState<DeviceStatus["device"]>(null);
  const [env, setEnv] = useState<EnvironmentMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchSnapshot(), fetchDeviceStatus(), fetchLatestEnvironment()])
      .then(([snap, dev, latestEnv]) => {
        setSnapshot(snap);
        setDevice(dev.device);
        setEnv(latestEnv);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const status = snapshot?.orchestrator.overall_status ?? "ok";
  const reasons = snapshot?.orchestrator.reason ?? [];
  const actions = snapshot?.orchestrator.actions_required ?? [];

  const lastSeenMs = device?.last_seen_at ? Date.parse(device.last_seen_at) : null;
  const offline = lastSeenMs === null ? true : Date.now() - lastSeenMs > 5 * 60 * 1000;

  const envStageRaw = typeof env?.stage === "string" ? env.stage : "-";
  const envStage = envStageRaw === "-" ? "-" : formatStage(envStageRaw);
  const envStressRaw = typeof env?.stress_level === "string" ? env.stress_level : "-";
  const envStress = envStressRaw === "-" ? "-" : formatStressLevel(envStressRaw);
  const envActions = Array.isArray(env?.recommended_action)
    ? (env?.recommended_action as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const flags = env?.risk_flags ?? {};
  const flagItems = Object.entries(flags)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => ({ key: k, label: formatRiskFlagKey(k) }));

  return (
    <AppShell title="Alarmlar" subtitle="Kritik uyarılar ve müdahale önerileri" onRefresh={refresh}>
      {error && <div className="k-alert">{error}</div>}

      <div className="k-grid">
        <Panel title="Çevresel Alarm" subtitle="ESP32 RuleEngine (Evre bazlı)" span={12}>
          {loading && !env ? (
            <div className="k-skeleton" style={{ width: 360 }} />
          ) : !env ? (
            <div className="k-sub">Henüz environment mesajı yok.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Evre</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{envStage}</div>
                  <div className="k-sub">Zaman: {typeof env.timestamp === "string" ? env.timestamp : "-"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Stres</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{envStress}</div>
                </div>
              </div>

              {flagItems.length > 0 ? (
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Risk bayrakları</div>
                  <ul className="k-list">
                    {flagItems.map((f) => (
                      <li key={f.key}>{f.label}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="k-sub">Risk bayrağı yok.</div>
              )}

              {envActions.length > 0 ? (
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Önerilen aksiyonlar</div>
                  <ul className="k-list">
                    {envActions.map((a, i) => (
                      <li key={i}>{formatRecommendedAction(a)}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="k-sub">Aksiyon önerisi yok.</div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Cihaz Durumu" subtitle="Watchdog + Heartbeat" span={12}>
          {loading && !snapshot ? (
            <div className="k-skeleton" style={{ width: 320 }} />
          ) : offline ? (
            <div className="k-alert">
              Cihaz bağlantısı koptu veya kilitlendi. 5 dakika içinde düzelmezse watchdog otomatik reset atar.
            </div>
          ) : (
            <div className="k-sub">
              Son görüldü: {device?.last_seen_at}
              {typeof device?.last_rssi === "number" ? ` | RSSI: ${device.last_rssi}` : ""}
              {device?.last_ip ? ` | IP: ${device?.last_ip}` : ""}
            </div>
          )}
        </Panel>

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
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".2px" }}>{formatOverallStatus(status)}</div>
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
                <li key={i}>{humanizeKeyOrText(r)}</li>
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
                <li key={i}>{humanizeKeyOrText(a)}</li>
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
