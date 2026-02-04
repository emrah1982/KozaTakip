CREATE TABLE IF NOT EXISTS demo_environment (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ts DATETIME(3) NOT NULL,
  stage VARCHAR(32) NOT NULL,
  temperature DOUBLE NOT NULL,
  humidity DOUBLE NOT NULL,
  co2_ppm DOUBLE NOT NULL,
  stress_level VARCHAR(16) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_demo_env_ts (ts)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agent VARCHAR(32) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_messages_agent_received_at (agent, received_at)
);

CREATE TABLE IF NOT EXISTS actuator_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at DATETIME(3) NOT NULL,
  actuator VARCHAR(32) NOT NULL,
  mode VARCHAR(16) NOT NULL,
  state TINYINT(1) NOT NULL,
  client_ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  payload JSON NULL,
  PRIMARY KEY (id),
  INDEX idx_actuator_audit_created_at (created_at),
  INDEX idx_actuator_audit_actuator_created_at (actuator, created_at)
);

INSERT INTO demo_environment (ts, stage, temperature, humidity, co2_ppm, stress_level)
SELECT * FROM (
  SELECT
    (NOW(3) - INTERVAL 55 MINUTE) AS ts,
    'larva_4_5' AS stage,
    25.1 AS temperature,
    78.0 AS humidity,
    980 AS co2_ppm,
    'low' AS stress_level
  UNION ALL SELECT (NOW(3) - INTERVAL 45 MINUTE), 'larva_4_5', 25.4, 79.0, 1050, 'low'
  UNION ALL SELECT (NOW(3) - INTERVAL 35 MINUTE), 'larva_4_5', 25.8, 80.0, 1200, 'medium'
  UNION ALL SELECT (NOW(3) - INTERVAL 25 MINUTE), 'larva_4_5', 26.2, 81.0, 1350, 'medium'
  UNION ALL SELECT (NOW(3) - INTERVAL 15 MINUTE), 'larva_4_5', 26.7, 82.0, 1500, 'high'
  UNION ALL SELECT (NOW(3) - INTERVAL 5 MINUTE),  'larva_4_5', 26.1, 81.0, 1400, 'medium'
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM demo_environment);
