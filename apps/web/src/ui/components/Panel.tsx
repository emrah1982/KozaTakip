import type { ReactNode } from "react";

export function Panel(props: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; span?: 6 | 8 | 12 }) {
  const spanClass = props.span ? `k-span-${props.span}` : "k-span-12";

  return (
    <section className={`${spanClass} k-panel`}>
      <div className="k-panelhd">
        <div>
          <h3 style={{ margin: 0 }}>{props.title}</h3>
          {props.subtitle && <small>{props.subtitle}</small>}
        </div>
        {props.right}
      </div>
      <div className="k-panelbd">{props.children}</div>
    </section>
  );
}
