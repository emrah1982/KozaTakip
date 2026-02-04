import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";

type Agent = "environment" | "vision" | "predictive_ai" | "quality";

type StoredAgentMessage = {
  agent: Agent;
  timestamp?: string;
  received_at?: string;
} & Record<string, unknown>;

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function fetchMessages(limit = 50): Promise<StoredAgentMessage[]> {
  const res = await fetch(`${API_BASE}/api/messages?limit=${limit}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as StoredAgentMessage[];
}

export function MessagesPage() {
  const [messages, setMessages] = useState<StoredAgentMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(50);

  const grouped = useMemo(() => {
    const g: Record<string, StoredAgentMessage[]> = {
      environment: [],
      vision: [],
      predictive_ai: [],
      quality: []
    };
    for (const m of messages ?? []) g[m.agent]?.push(m);
    return g;
  }, [messages]);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetchMessages(limit)
      .then(setMessages)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Bilinmeyen hata"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, [limit]);

  return (
    <AppShell title="Mesajlar" subtitle="Ajanlardan gelen ham veriler (son kayıtlar)" onRefresh={refresh}>
      {error && <div className="k-alert">{error}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Limit</span>
        <select
          className="k-btn"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{ padding: "8px 10px" }}
        >
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        {loading && <span style={{ color: "var(--muted)", fontSize: 12 }}>Yükleniyor…</span>}
      </div>

      <div className="k-grid">
        <Panel title="Ortam (Environment)" subtitle="Sıcaklık / Nem / CO₂ / Stres" span={6}>
          <pre className="k-json">{JSON.stringify(grouped.environment[0] ?? null, null, 2)}</pre>
        </Panel>
        <Panel title="Görüntü (Vision)" subtitle="Hareket / Doku / Güven" span={6}>
          <pre className="k-json">{JSON.stringify(grouped.vision[0] ?? null, null, 2)}</pre>
        </Panel>
        <Panel title="Tahmin (Predictive AI)" subtitle="Risk skoru / Hastalık / Ufuk" span={6}>
          <pre className="k-json">{JSON.stringify(grouped.predictive_ai[0] ?? null, null, 2)}</pre>
        </Panel>
        <Panel title="Kalite (Quality)" subtitle="Skor / Sınıf / Öneri" span={6}>
          <pre className="k-json">{JSON.stringify(grouped.quality[0] ?? null, null, 2)}</pre>
        </Panel>
      </div>
    </AppShell>
  );
}
