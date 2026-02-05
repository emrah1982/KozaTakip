import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";
import { listActuatorAudit, listMessages, type ActuatorAuditRow, type StoredAgentMessage } from "../services/api";

type RangeKey = "24h" | "7d" | "30d";

function rangeToMs(key: RangeKey) {
  if (key === "24h") return 24 * 60 * 60 * 1000;
  if (key === "7d") return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

function toTimeMs(m: StoredAgentMessage) {
  const ts = typeof m.timestamp === "string" ? m.timestamp : typeof m.received_at === "string" ? m.received_at : null;
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
}

function metricNumber(v: unknown) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function stats(values: number[]) {
  if (!values.length) return null;
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / values.length, count: values.length };
}

function formatNumber(n: number, decimals = 1) {
  return n.toFixed(decimals);
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const [range, setRange] = useState<RangeKey>("24h");
  const [env, setEnv] = useState<StoredAgentMessage[] | null>(null);
  const [risk, setRisk] = useState<StoredAgentMessage[] | null>(null);
  const [quality, setQuality] = useState<StoredAgentMessage[] | null>(null);
  const [audit, setAudit] = useState<ActuatorAuditRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windowInfo = useMemo(() => {
    const now = Date.now();
    const fromMs = now - rangeToMs(range);
    return {
      fromMs,
      toMs: now,
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(now).toISOString()
    };
  }, [range]);

  const refresh = () => {
    setLoading(true);
    setError(null);

    Promise.all([
      listMessages({ agent: "environment", limit: 500 }),
      listMessages({ agent: "predictive_ai", limit: 50 }),
      listMessages({ agent: "quality", limit: 50 }),
      listActuatorAudit({ limit: 200, from: windowInfo.fromIso, to: windowInfo.toIso })
    ])
      .then(([envRows, riskRows, qualityRows, auditRows]) => {
        setEnv(envRows);
        setRisk(riskRows);
        setQuality(qualityRows);
        setAudit(auditRows);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, [range]);

  const envWindow = useMemo(() => {
    const rows = env ?? [];
    const filtered = rows
      .map((m) => ({ m, t: toTimeMs(m) }))
      .filter((x): x is { m: StoredAgentMessage; t: number } => typeof x.t === "number")
      .filter((x) => x.t >= windowInfo.fromMs && x.t <= windowInfo.toMs)
      .map((x) => x.m);

    const temperature = filtered.map((m) => metricNumber(m.temperature)).filter((n): n is number => n !== null);
    const humidity = filtered.map((m) => metricNumber(m.humidity)).filter((n): n is number => n !== null);
    const co2 = filtered.map((m) => metricNumber(m.co2_ppm)).filter((n): n is number => n !== null);

    const stressCounts: Record<string, number> = {};
    for (const m of filtered) {
      const k = typeof m.stress_level === "string" ? m.stress_level : "unknown";
      stressCounts[k] = (stressCounts[k] ?? 0) + 1;
    }

    const recActionCounts: Record<string, number> = {};
    for (const m of filtered) {
      const a = (m.recommended_action ?? []) as unknown;
      if (Array.isArray(a)) {
        for (const item of a) {
          if (typeof item === "string" && item.trim()) {
            recActionCounts[item] = (recActionCounts[item] ?? 0) + 1;
          }
        }
      }
    }

    return {
      count: filtered.length,
      temperature: stats(temperature),
      humidity: stats(humidity),
      co2: stats(co2),
      stressCounts,
      recActionCounts,
      latest: filtered[0] ?? null
    };
  }, [env, windowInfo.fromMs, windowInfo.toMs]);

  const riskLatest = useMemo(() => (risk && risk.length ? risk[0] : null), [risk]);
  const qualityLatest = useMemo(() => (quality && quality.length ? quality[0] : null), [quality]);

  const auditSummary = useMemo(() => {
    const rows = audit ?? [];
    const countsByActuator: Record<string, number> = {};
    const onCountByActuator: Record<string, number> = {};
    for (const r of rows) {
      countsByActuator[r.actuator] = (countsByActuator[r.actuator] ?? 0) + 1;
      if (r.state) onCountByActuator[r.actuator] = (onCountByActuator[r.actuator] ?? 0) + 1;
    }
    return {
      total: rows.length,
      countsByActuator,
      onCountByActuator,
      latest: rows.slice(0, 10)
    };
  }, [audit]);

  const exportData = () => {
    downloadJson(`kozatakip-rapor-${range}-${new Date().toISOString().slice(0, 19)}.json`, {
      range,
      window: windowInfo,
      environment: envWindow,
      latest: {
        predictive_ai: riskLatest,
        quality: qualityLatest
      },
      actuator_audit: auditSummary
    });
  };

  return (
    <AppShell
      title="Raporlar"
      subtitle="Zaman aralığına göre özet metrikler, risk/kalite ve manuel aksiyon kayıtları"
      onRefresh={refresh}
    >
      {error && <div className="k-alert">{error}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Zaman Aralığı</span>
        <select className="k-btn" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
          <option value="24h">Son 24 saat</option>
          <option value="7d">Son 7 gün</option>
          <option value="30d">Son 30 gün</option>
        </select>
        <button className="k-btn" onClick={exportData} disabled={loading}>
          JSON indir
        </button>
        {loading && <span style={{ color: "var(--muted)", fontSize: 12 }}>Yükleniyor…</span>}
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          {new Date(windowInfo.fromMs).toLocaleString()} → {new Date(windowInfo.toMs).toLocaleString()}
        </span>
      </div>

      <div className="k-grid">
        <Panel title="Ortam Özeti" subtitle={`Environment mesajları: ${envWindow.count}`} span={6}>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="k-sub">
              Sıcaklık: {envWindow.temperature ? `${formatNumber(envWindow.temperature.avg)}°C (min ${formatNumber(envWindow.temperature.min)} / max ${formatNumber(envWindow.temperature.max)})` : "veri yok"}
            </div>
            <div className="k-sub">
              Nem: {envWindow.humidity ? `${formatNumber(envWindow.humidity.avg)}% (min ${formatNumber(envWindow.humidity.min)} / max ${formatNumber(envWindow.humidity.max)})` : "veri yok"}
            </div>
            <div className="k-sub">
              CO₂: {envWindow.co2 ? `${formatNumber(envWindow.co2.avg, 0)} ppm (min ${formatNumber(envWindow.co2.min, 0)} / max ${formatNumber(envWindow.co2.max, 0)})` : "veri yok"}
            </div>
            <div className="k-sub">
              Stres dağılımı: {Object.keys(envWindow.stressCounts).length ? JSON.stringify(envWindow.stressCounts) : "veri yok"}
            </div>
            <div className="k-sub">
              Önerilen aksiyonlar: {Object.keys(envWindow.recActionCounts).length ? JSON.stringify(envWindow.recActionCounts) : "yok"}
            </div>
          </div>
        </Panel>

        <Panel title="Risk ve Kalite" subtitle="Son predictive_ai / quality" span={6}>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Predictive AI</div>
              <pre className="k-json">{JSON.stringify(riskLatest, null, 2)}</pre>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Quality</div>
              <pre className="k-json">{JSON.stringify(qualityLatest, null, 2)}</pre>
            </div>
          </div>
        </Panel>

        <Panel title="Manuel Aksiyonlar" subtitle={`Audit kayıtları: ${auditSummary.total}`} span={12}>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="k-sub">Cihaz bazlı adet: {Object.keys(auditSummary.countsByActuator).length ? JSON.stringify(auditSummary.countsByActuator) : "veri yok"}</div>
            <div className="k-sub">Aç (state=true) sayısı: {Object.keys(auditSummary.onCountByActuator).length ? JSON.stringify(auditSummary.onCountByActuator) : "veri yok"}</div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Son 10 kayıt</div>
              <pre className="k-json">{JSON.stringify(auditSummary.latest, null, 2)}</pre>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
