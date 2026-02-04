import type { AgentInboundMessage } from "@kozatakip/shared";
import type { MessageRepository } from "../ports/messageRepository.js";

export async function ingestAgentMessage(
  repo: MessageRepository,
  message: AgentInboundMessage
) {
  return repo.append(message);
}
