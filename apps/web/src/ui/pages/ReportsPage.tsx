import { AppShell } from "../layout/AppShell";
import { Panel } from "../components/Panel";

export function ReportsPage() {
  return (
    <AppShell title="Raporlar" subtitle="Zaman serileri ve özet raporlar (MVP)">
      <div className="k-grid">
        <Panel title="Günlük Özet" subtitle="Son 24 saat" span={6}>
          <div className="k-sub">
            Bu ekran MVP aşamasında. İleride sensör zaman serileri, risk trendleri ve kalite dağılımları burada
            raporlanacak.
          </div>
        </Panel>
        <Panel title="Haftalık Trend" subtitle="Son 7 gün" span={6}>
          <div className="k-sub">
            Plan: sıcaklık/nem/CO₂ trendleri, hastalık riski tahmini, aksiyon etkinliği ve kalite skorları.
          </div>
        </Panel>
        <Panel title="Dışa Aktarım" subtitle="CSV / JSON" span={12}>
          <div className="k-sub">Plan: raporları dosya olarak indirme ve arşivleme.</div>
        </Panel>
      </div>
    </AppShell>
  );
}
