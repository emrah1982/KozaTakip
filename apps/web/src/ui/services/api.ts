const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function getDashboardSnapshot() {
  const res = await fetch(`${API_BASE}/api/dashboard/snapshot`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return (await res.json()) as any;
}
