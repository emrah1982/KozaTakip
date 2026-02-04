import type {
  AgentInboundMessage,
  EnvironmentToOrchestratorMessage,
  PredictiveAiToOrchestratorMessage,
  QualityToOrchestratorMessage,
  VisionToOrchestratorMessage
} from "@kozatakip/shared";

export type StoredAgentMessage = AgentInboundMessage & { received_at: string };

export function isEnvironmentMessage(
  msg: AgentInboundMessage
): msg is EnvironmentToOrchestratorMessage {
  return msg.agent === "environment";
}

export function isVisionMessage(
  msg: AgentInboundMessage
): msg is VisionToOrchestratorMessage {
  return msg.agent === "vision";
}

export function isPredictiveAiMessage(
  msg: AgentInboundMessage
): msg is PredictiveAiToOrchestratorMessage {
  return msg.agent === "predictive_ai";
}

export function isQualityMessage(
  msg: AgentInboundMessage
): msg is QualityToOrchestratorMessage {
  return msg.agent === "quality";
}
