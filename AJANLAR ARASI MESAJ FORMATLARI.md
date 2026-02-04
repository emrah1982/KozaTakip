7.1 Environment → Orchestrator
{
  "agent": "environment",
  "timestamp": "ISO-8601",
  "stage": "larva_4_5",
  "temperature": 25.6,
  "humidity": 72.3,
  "co2_ppm": 1180,
  "stress_level": "medium",
  "recommended_action": ["increase_ventilation"]
}

7.2 Vision → Orchestrator
{
  "agent": "vision",
  "timestamp": "ISO-8601",
  "movement_index": 0.42,
  "size_change_ratio": -0.08,
  "texture_anomaly": true,
  "confidence": 0.91
}

7.3 Predictive AI → Orchestrator
{
  "agent": "predictive_ai",
  "timestamp": "ISO-8601",
  "risk_score": 72,
  "risk_level": "high",
  "predicted_disease": "flacherie",
  "time_horizon_hours": 48,
  "recommended_prevention": [
    "reduce_humidity",
    "increase_ventilation"
  ]
}

7.4 Quality Agent → Orchestrator
{
  "agent": "quality",
  "timestamp": "ISO-8601",
  "quality_score": 88,
  "grade": "A",
  "market_recommendation": "premium_export"
}

7.5 Orchestrator → Dashboard / Human
{
  "overall_status": "warning",
  "reason": [
    "High disease risk predicted",
    "CO2 trend increasing"
  ],
  "actions_required": [
    "Ventilation adjustment",
    "Human inspection recommended"
  ],
  "human_approval_required": true
}
