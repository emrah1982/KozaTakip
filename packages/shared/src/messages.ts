export type ISO8601 = string;

export type Stage =
  | "egg"
  | "larva_1"
  | "larva_2"
  | "larva_3"
  | "larva_4_5"
  | "cocoon"
  | "pupa";

export type StressLevel = "low" | "medium" | "high";

export type EnvironmentAction =
  | "increase_ventilation"
  | "decrease_ventilation"
  | "increase_humidity"
  | "decrease_humidity"
  | "increase_temperature"
  | "decrease_temperature";

export interface EnvironmentToOrchestratorMessage {
  agent: "environment";
  timestamp: ISO8601;
  stage: Stage;
  temperature: number;
  humidity: number;
  co2_ppm: number;
  stress_level: StressLevel;
  recommended_action: EnvironmentAction[];
}

export interface VisionToOrchestratorMessage {
  agent: "vision";
  timestamp: ISO8601;
  movement_index: number;
  size_change_ratio: number;
  texture_anomaly: boolean;
  confidence: number;
}

export type RiskLevel = "low" | "medium" | "high";

export type PreventionAction =
  | "reduce_humidity"
  | "increase_ventilation"
  | "reduce_temperature"
  | "increase_temperature";

export interface PredictiveAiToOrchestratorMessage {
  agent: "predictive_ai";
  timestamp: ISO8601;
  risk_score: number;
  risk_level: RiskLevel;
  predicted_disease: string;
  time_horizon_hours: number;
  recommended_prevention: PreventionAction[];
}

export type QualityGrade = "A" | "B" | "C";

export interface QualityToOrchestratorMessage {
  agent: "quality";
  timestamp: ISO8601;
  quality_score: number;
  grade: QualityGrade;
  market_recommendation: string;
}

export type AgentInboundMessage =
  | EnvironmentToOrchestratorMessage
  | VisionToOrchestratorMessage
  | PredictiveAiToOrchestratorMessage
  | QualityToOrchestratorMessage;

export type OverallStatus = "ok" | "warning" | "critical";

export interface OrchestratorToDashboardMessage {
  overall_status: OverallStatus;
  reason: string[];
  actions_required: string[];
  human_approval_required: boolean;
}
