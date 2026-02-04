import type { OverallStatus } from "@kozatakip/shared";

export function StatusBadge(props: { status: OverallStatus }) {
  const label = props.status;
  return (
    <span className="k-badge">
      <span className={`k-dot ${props.status}`} />
      {label}
    </span>
  );
}
