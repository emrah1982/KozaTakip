import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type DashboardSnapshot = {
  orchestrator?: {
    overall_status?: "ok" | "warning" | "critical";
    reason?: string[];
    actions_required?: string[];
  };
  latest?: {
    environment?: {
      stress_level?: string;
      recommended_action?: unknown;
      risk_flags?: Record<string, unknown>;
    };
  };
};

function computeAlertsCount(snap: DashboardSnapshot | null) {
  if (!snap) return 0;

  const status = snap.orchestrator?.overall_status ?? "ok";
  if (status === "ok") return 0;
  const reasons = Array.isArray(snap.orchestrator?.reason) ? snap.orchestrator?.reason ?? [] : [];
  const actions = Array.isArray(snap.orchestrator?.actions_required) ? snap.orchestrator?.actions_required ?? [] : [];

  const env = snap.latest?.environment;
  const envActions = Array.isArray(env?.recommended_action)
    ? (env?.recommended_action as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const riskFlags = env?.risk_flags && typeof env.risk_flags === "object" ? (env.risk_flags as Record<string, unknown>) : {};
  const riskCount = Object.values(riskFlags).filter((v) => v === true).length;

  const set = new Set<string>();
  for (const r of reasons) if (typeof r === "string" && r.length) set.add(r);
  for (const a of actions) if (typeof a === "string" && a.length) set.add(a);
  for (const a of envActions) if (typeof a === "string" && a.length) set.add(a);

  const base = set.size + riskCount;
  return Math.max(1, base);
}

export type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
  right?: ReactNode;
};

export function AppShell(props: AppShellProps) {
  const [alertsCount, setAlertsCount] = useState(0);
  const [alertsStatus, setAlertsStatus] = useState<"ok" | "warning" | "critical">("ok");

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/dashboard/snapshot`, { signal: ctrl.signal });
        if (!res.ok) return;
        const snap = (await res.json()) as DashboardSnapshot;
        const next = computeAlertsCount(snap);
        const status = snap.orchestrator?.overall_status ?? "ok";
        if (alive) {
          setAlertsStatus(status);
          setAlertsCount(next);
        }
      } catch {
        // ignore
      }
    };

    tick();
    const t = window.setInterval(tick, 7000);
    return () => {
      alive = false;
      ctrl.abort();
      window.clearInterval(t);
    };
  }, []);

  return (
    <div className="k-layout">
      <aside className="k-sidebar">
        <div className="k-brand">
          <div className="k-logo" />
          <div>
            <h1>KozaTakip</h1>
            <p>Çok ajanlı serikültür takip</p>
          </div>
        </div>

        <nav className="k-nav">
          <NavLink
            to="/panel"
            end
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span className="k-navicon" />
            Panel
          </NavLink>
          <NavLink
            to="/canli-izleme"
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span className="k-navicon" />
            Canlı İzleme
          </NavLink>
          <NavLink
            to="/vision-yonetimi"
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span className="k-navicon" />
            Vision Yönetimi
          </NavLink>
          <NavLink
            to="/alarmlar"
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span
              className="k-navicon"
              style={{
                background:
                  alertsCount > 0
                    ? alertsStatus === "critical"
                      ? "var(--crit)"
                      : "var(--warn)"
                    : undefined
              }}
            />
            <span style={{ flex: 1 }}>Alarmlar</span>
            {alertsCount > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 26,
                  height: 20,
                  padding: "0 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  border:
                    alertsStatus === "critical" ? "1px solid rgba(251,113,133,.35)" : "1px solid rgba(251,191,36,.35)",
                  background:
                    alertsStatus === "critical" ? "rgba(251,113,133,.12)" : "rgba(251,191,36,.16)",
                  color: "var(--text)"
                }}
                title={alertsStatus === "critical" ? "Kritik alarm" : "Uyarı"}
              >
                {alertsCount}
              </span>
            )}
          </NavLink>
          <NavLink
            to="/mesajlar"
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span className="k-navicon" />
            Mesajlar
          </NavLink>
          <NavLink
            to="/raporlar"
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span className="k-navicon" />
            Raporlar
          </NavLink>
          <NavLink
            to="/ayarlar"
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span className="k-navicon" />
            Ayarlar
          </NavLink>
        </nav>
      </aside>

      <main className="k-main">
        <header className="k-topbar">
          <div className="k-title">
            <h2>{props.title}</h2>
            <small>{props.subtitle}</small>
          </div>

          <div className="k-actions">
            {props.right}
            {props.onRefresh && (
              <button className="k-btn" onClick={props.onRefresh}>
                Yenile
              </button>
            )}
          </div>
        </header>

        {props.children}
      </main>
    </div>
  );
}
