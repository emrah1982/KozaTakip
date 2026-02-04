import { useState } from "react";
import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";

export function SettingsPage() {
  const [apiBase, setApiBase] = useState(import.meta.env.VITE_API_BASE ?? "");

  return (
    <AppShell title="Ayarlar" subtitle="Ortam ve bağlantı ayarları">
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
    </AppShell>
  );
}
