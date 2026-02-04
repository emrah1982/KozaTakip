import type { ReactNode } from "react";

export function Card(props: { title: string; right?: ReactNode; children: ReactNode; span?: 4 | 6 | 8 | 12 }) {
  const spanClass = props.span ? `k-span-${props.span}` : "k-span-12";

  return (
    <section className={`k-card ${spanClass}`}>
      <div className="k-cardhd">
        <h3>{props.title}</h3>
        {props.right}
      </div>
      <div className="k-cardbd">{props.children}</div>
    </section>
  );
}
