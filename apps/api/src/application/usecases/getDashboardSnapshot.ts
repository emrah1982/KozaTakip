import type { AgentInboundMessage, OrchestratorToDashboardMessage } from "@kozatakip/shared";
import type { MessageRepository } from "../ports/messageRepository.js";

function statusRank(level: string): number {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

export async function getDashboardSnapshot(repo: MessageRepository) {
  const environment = await repo.latestByAgent("environment");
  const vision = await repo.latestByAgent("vision");
  const predictive = await repo.latestByAgent("predictive_ai");
  const quality = await repo.latestByAgent("quality");

  const reason: string[] = [];
  const actions_required: string[] = [];

  if (predictive && "risk_level" in predictive) {
    reason.push(`Disease risk: ${predictive.risk_level} (${predictive.risk_score})`);
    for (const a of predictive.recommended_prevention) actions_required.push(a);
  }

  if (environment && "stress_level" in environment) {
    reason.push(`Environment stress: ${environment.stress_level}`);
    for (const a of environment.recommended_action) actions_required.push(a);
  }

  const riskLevel = predictive && "risk_level" in predictive ? predictive.risk_level : "low";
  const stressLevel = environment && "stress_level" in environment ? environment.stress_level : "low";

  const overall_status: OrchestratorToDashboardMessage["overall_status"] =
    Math.max(statusRank(riskLevel), statusRank(stressLevel)) >= 3
      ? "critical"
      : Math.max(statusRank(riskLevel), statusRank(stressLevel)) === 2
        ? "warning"
        : "ok";

  const human_approval_required = overall_status !== "ok";

  const orchestrator: OrchestratorToDashboardMessage = {
    overall_status,
    reason,
    actions_required: Array.from(new Set(actions_required)),
    human_approval_required
  };

  return {
    latest: {
      environment,
      vision,
      predictive,
      quality
    } satisfies Record<string, unknown>,
    orchestrator
  };
}
