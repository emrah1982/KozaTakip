import type { ReactNode } from "react";

export type TabItem = {
  key: string;
  label: string;
  content: ReactNode;
};

export function Tabs(props: {
  value: string;
  onChange: (key: string) => void;
  tabs: TabItem[];
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {props.tabs.map((t) => {
          const active = t.key === props.value;
          return (
            <button
              key={t.key}
              className="k-btn"
              onClick={() => props.onChange(t.key)}
              style={{
                padding: "8px 12px",
                textAlign: "left",
                border: active ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.08)",
                background: active ? "rgba(77, 171, 247, 0.12)" : undefined
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div>{props.tabs.find((t) => t.key === props.value)?.content ?? null}</div>
    </div>
  );
}
