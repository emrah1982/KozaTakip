import type { AgentInboundMessage } from "@kozatakip/shared";
import mysql from "mysql2/promise";
import type { MessageRepository } from "../../application/ports/messageRepository.js";
import type { StoredAgentMessage } from "../../domain/events/agentMessages.js";

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export class MySqlMessageRepository implements MessageRepository {
  private readonly pool: mysql.Pool;

  constructor(cfg: DbConfig) {
    this.pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectionLimit: 10,
      enableKeepAlive: true
    });
  }

  async append(message: AgentInboundMessage): Promise<StoredAgentMessage> {
    const receivedAt = new Date();
    await this.pool.execute(
      "INSERT INTO messages (agent, received_at, payload) VALUES (?, ?, CAST(? AS JSON))",
      [message.agent, receivedAt, JSON.stringify(message)]
    );

    return { ...(message as any), received_at: receivedAt.toISOString() } as StoredAgentMessage;
  }

  async list(limit: number): Promise<StoredAgentMessage[]> {
    const safeLimit = Math.max(0, Math.trunc(limit));
    const sql =
      "SELECT agent, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS received_at, payload FROM messages ORDER BY id DESC LIMIT " +
      safeLimit;
    const [rows] = await this.pool.execute<
      (mysql.RowDataPacket & { agent: string; received_at: string; payload: unknown })[]
    >(
      sql
    );

    return rows.map((r) => {
      const payload =
        typeof r.payload === "string" ? (JSON.parse(r.payload) as Record<string, unknown>) : (r.payload as any);
      return { ...payload, agent: r.agent, received_at: r.received_at } as StoredAgentMessage;
    });
  }

  async listByAgent(agent: AgentInboundMessage["agent"], limit: number): Promise<StoredAgentMessage[]> {
    const safeLimit = Math.max(0, Math.trunc(limit));
    const sql =
      "SELECT agent, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS received_at, payload FROM messages WHERE agent = ? ORDER BY id DESC LIMIT " +
      safeLimit;
    const [rows] = await this.pool.execute<
      (mysql.RowDataPacket & { agent: string; received_at: string; payload: unknown })[]
    >(
      sql,
      [agent]
    );

    return rows.map((r) => {
      const payload =
        typeof r.payload === "string" ? (JSON.parse(r.payload) as Record<string, unknown>) : (r.payload as any);
      return { ...payload, agent: r.agent, received_at: r.received_at } as StoredAgentMessage;
    });
  }

  async latestByAgent(agent: AgentInboundMessage["agent"]): Promise<StoredAgentMessage | null> {
    const [rows] = await this.pool.execute<
      (mysql.RowDataPacket & { agent: string; received_at: string; payload: unknown })[]
    >(
      "SELECT agent, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS received_at, payload FROM messages WHERE agent = ? ORDER BY id DESC LIMIT 1",
      [agent]
    );

    const r = rows[0];
    if (!r) return null;
    const payload =
      typeof r.payload === "string" ? (JSON.parse(r.payload) as Record<string, unknown>) : (r.payload as any);
    return { ...payload, agent: r.agent, received_at: r.received_at } as StoredAgentMessage;
  }
}
