import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
};

export function AppShell(props: AppShellProps) {
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
            to="/alarmlar"
            className={({ isActive }) => "k-navbtn" + (isActive ? " k-navbtn--active" : "")}
          >
            <span className="k-navicon" />
            Alarmlar
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
