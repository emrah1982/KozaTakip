import type { AgentInboundMessage } from "@kozatakip/shared";
import type { StoredAgentMessage } from "../../domain/events/agentMessages.js";

export interface MessageRepository {
  append(message: AgentInboundMessage): Promise<StoredAgentMessage>;
  list(limit: number): Promise<StoredAgentMessage[]>;
  listByAgent(agent: AgentInboundMessage["agent"], limit: number): Promise<StoredAgentMessage[]>;
  latestByAgent(agent: AgentInboundMessage["agent"]): Promise<StoredAgentMessage | null>;
}
