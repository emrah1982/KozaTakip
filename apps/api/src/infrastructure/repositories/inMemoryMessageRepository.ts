import type { AgentInboundMessage } from "@kozatakip/shared";
import type { MessageRepository } from "../../application/ports/messageRepository.js";
import type { StoredAgentMessage } from "../../domain/events/agentMessages.js";

export class InMemoryMessageRepository implements MessageRepository {
  private readonly messages: StoredAgentMessage[] = [];

  async append(message: AgentInboundMessage): Promise<StoredAgentMessage> {
    const stored: StoredAgentMessage = {
      ...message,
      received_at: new Date().toISOString()
    };
    this.messages.unshift(stored);
    return stored;
  }

  async list(limit: number): Promise<StoredAgentMessage[]> {
    return this.messages.slice(0, Math.max(0, limit));
  }

  async listByAgent(
    agent: AgentInboundMessage["agent"],
    limit: number
  ): Promise<StoredAgentMessage[]> {
    const safeLimit = Math.max(0, limit);
    const result: StoredAgentMessage[] = [];
    for (const m of this.messages) {
      if (m.agent !== agent) continue;
      result.push(m);
      if (result.length >= safeLimit) break;
    }
    return result;
  }

  async latestByAgent(
    agent: AgentInboundMessage["agent"]
  ): Promise<StoredAgentMessage | null> {
    const found = this.messages.find((m) => m.agent === agent);
    return found ?? null;
  }
}
