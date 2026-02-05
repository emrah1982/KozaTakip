const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const ACTUATOR_API_KEY = import.meta.env.VITE_ACTUATOR_API_KEY ?? "koza_local_key_2026";

export async function getDashboardSnapshot() {
  const res = await fetch(`${API_BASE}/api/dashboard/snapshot`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return (await res.json()) as any;
}

export type Agent = "environment" | "vision" | "predictive_ai" | "quality";

export type StoredAgentMessage = {
  agent: Agent;
  timestamp?: string;
  received_at?: string;
} & Record<string, unknown>;

export async function listMessages(params: { limit?: number; agent?: Agent }) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.agent) qs.set("agent", params.agent);

  const res = await fetch(`${API_BASE}/api/messages?${qs.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as StoredAgentMessage[];
}

export type ActuatorAuditRow = {
  id: number;
  created_at: string;
  actuator: string;
  mode: string;
  state: boolean;
  client_ip: string | null;
  user_agent: string | null;
  payload: Record<string, unknown> | null;
};

export async function listActuatorAudit(params: {
  limit?: number;
  actuator?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.actuator) qs.set("actuator", params.actuator);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);

  const res = await fetch(`${API_BASE}/api/actuators/audit?${qs.toString()}`, {
    headers: {
      ...(ACTUATOR_API_KEY ? { "x-api-key": ACTUATOR_API_KEY } : {})
    }
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as ActuatorAuditRow[];
}

export type StageThresholds = {
  t_min: number;
  t_opt?: number;
  t_max: number;
  h_min: number;
  h_opt?: number;
  h_max: number;
  co2_min: number;
  co2_opt?: number;
  co2_max: number;
};

export type FeedingPlan = {
  enabled?: boolean;
  notes?: string;
  larvae_count?: number;
  matrix?: {
    stage: string;
    daily_feed_g_min?: number;
    daily_feed_g_max?: number;
    daily_feed_kg_min?: number;
    daily_feed_kg_max?: number;
    feedings_per_day_min?: number;
    feedings_per_day_max?: number;
    co2_rise_ppm_min?: number;
    co2_rise_ppm_max?: number;
    critical_minutes_min?: number;
    critical_minutes_max?: number;
    risk_note?: string;
  }[];
  decision_params?: {
    leaf_remaining_ratio_max?: number;
    co2_over_opt_ppm?: number;
    humidity_over_opt?: number;
    movement_threshold?: number;
  };
  recipes?: {
    stage: string;
    day_in_stage?: number;
    time?: string;
    leaf_type?: string;
    amount_g?: number;
    freq_per_day?: number;
    notes?: string;
  }[];
};

export type DeviceConfig = {
  active_stage?: string;
  auto_stage?: {
    enabled?: boolean;
    start_stage?: string;
    start_at?: string;
  };
  stages: Record<string, StageThresholds>;
  feeding_plan?: FeedingPlan;
};

export async function getDeviceConfig(params: { deviceId: string }) {
  const res = await fetch(`${API_BASE}/api/devices/config?device_id=${encodeURIComponent(params.deviceId)}`, {
    headers: {
      ...(ACTUATOR_API_KEY ? { "x-api-key": ACTUATOR_API_KEY } : {})
    }
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as { ok: true; device_id: string; updated_at: string | null; config: DeviceConfig | null };
}

export async function putDeviceConfig(params: { deviceId: string; config: DeviceConfig }) {
  const res = await fetch(`${API_BASE}/api/devices/config`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(ACTUATOR_API_KEY ? { "x-api-key": ACTUATOR_API_KEY } : {})
    },
    body: JSON.stringify({ device_id: params.deviceId, config: params.config })
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as { ok: true };
}

export async function pushVisionStage(params: { targetUrl: string; stage: string }) {
  const u = new URL(`${API_BASE}/api/vision/proxy/stage`);
  u.searchParams.set("url", params.targetUrl);
  const res = await fetch(u.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ stage: params.stage }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as any;
}

export async function getVisionYoloLatest(params: { targetUrl: string }) {
  const u = new URL(`${API_BASE}/api/vision/proxy/yolo`);
  u.searchParams.set("url", params.targetUrl);
  const res = await fetch(u.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as any;
}
