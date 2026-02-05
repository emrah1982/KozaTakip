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
  private readonly pool: any;
  private schemaReady: Promise<void> | null = null;

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

  private ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        await this.pool.execute(
          `CREATE TABLE IF NOT EXISTS messages (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            agent VARCHAR(32) NOT NULL,
            received_at DATETIME(3) NOT NULL,
            payload JSON NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_messages_agent_received_at (agent, received_at)
          )`
        );
      })();
    }
    return this.schemaReady;
  }

  async append(message: AgentInboundMessage): Promise<StoredAgentMessage> {
    await this.ensureSchema();
    const receivedAt = new Date();
    await this.pool.execute(
      "INSERT INTO messages (agent, received_at, payload) VALUES (?, ?, CAST(? AS JSON))",
      [message.agent, receivedAt, JSON.stringify(message)]
    );

    return { ...(message as any), received_at: receivedAt.toISOString() } as StoredAgentMessage;
  }

  async list(limit: number): Promise<StoredAgentMessage[]> {
    await this.ensureSchema();
    const safeLimit = Math.max(0, Math.trunc(limit));
    const sql =
      "SELECT agent, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS received_at, payload FROM messages ORDER BY id DESC LIMIT " +
      safeLimit;
    const [rows] = (await this.pool.execute(sql)) as any;

    return rows.map((r: (typeof rows)[number]) => {
      const payload =
        typeof r.payload === "string" ? (JSON.parse(r.payload) as Record<string, unknown>) : (r.payload as any);
      return { ...payload, agent: r.agent, received_at: r.received_at } as StoredAgentMessage;
    });
  }

  async listByAgent(agent: AgentInboundMessage["agent"], limit: number): Promise<StoredAgentMessage[]> {
    await this.ensureSchema();
    const safeLimit = Math.max(0, Math.trunc(limit));
    const sql =
      "SELECT agent, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS received_at, payload FROM messages WHERE agent = ? ORDER BY id DESC LIMIT " +
      safeLimit;
    const [rows] = (await this.pool.execute(sql, [agent])) as any;

    return rows.map((r: (typeof rows)[number]) => {
      const payload =
        typeof r.payload === "string" ? (JSON.parse(r.payload) as Record<string, unknown>) : (r.payload as any);
      return { ...payload, agent: r.agent, received_at: r.received_at } as StoredAgentMessage;
    });
  }

  async latestByAgent(agent: AgentInboundMessage["agent"]): Promise<StoredAgentMessage | null> {
    await this.ensureSchema();
    const [rows] = (await this.pool.execute(
      "SELECT agent, DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS received_at, payload FROM messages WHERE agent = ? ORDER BY id DESC LIMIT 1",
      [agent]
    )) as any;

    const r = rows[0];
    if (!r) return null;
    const payload =
      typeof r.payload === "string" ? (JSON.parse(r.payload) as Record<string, unknown>) : (r.payload as any);
    return { ...payload, agent: r.agent, received_at: r.received_at } as StoredAgentMessage;
  }
}
