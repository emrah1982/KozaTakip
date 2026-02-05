#include "RuleEngine.h"

static AlarmLevel maxLevel(AlarmLevel a, AlarmLevel b) {
  return (a > b) ? a : b;
}

void RuleEngine::reset() {
  lastTempC = NAN;
  lastTempMs = 0;
}

const char* RuleEngine::toStressLevel(AlarmLevel lvl) {
  if (lvl == ALARM_CRITICAL) return "high";
  if (lvl == ALARM_RISK) return "medium";
  if (lvl == ALARM_WARNING) return "medium";
  return "low";
}

RuleOutput RuleEngine::evaluate(const String& stage, const EnvReading& r, unsigned long nowMs) {
  RuleOutput out;

  auto mark = [&](AlarmLevel lvl) { out.level = maxLevel(out.level, lvl); };

  const bool hasT = !isnan(r.temperatureC);
  const bool hasH = !isnan(r.humidityPct);
  const bool hasCO2 = r.co2ppm > 0;

  // Rapid temperature change (explicitly mentioned for Instar 5)
  if (hasT && !isnan(lastTempC) && lastTempMs > 0) {
    const unsigned long dt = nowMs - lastTempMs;
    if (dt <= 60UL * 60UL * 1000UL) {
      const float dT = fabsf(r.temperatureC - lastTempC);
      if (dT >= 2.0f && stage == "larva_5") {
        out.rapidTempChange = true;
        mark(ALARM_CRITICAL);
      }
    }
  }

  // Stage-specific rules from docs (alarm–action matrix)
  if (stage == "egg_incubation") {
    if (hasT) {
      if (r.temperatureC < 24 || r.temperatureC > 27) mark(ALARM_CRITICAL);
      else if (r.temperatureC < 25 || r.temperatureC > 26) mark(ALARM_WARNING);
      if (r.temperatureC < 25) out.increaseTemperature = true;
      if (r.temperatureC > 26) out.decreaseTemperature = true;
    }
    if (hasH) {
      if (r.humidityPct < 80 || r.humidityPct > 90) mark(ALARM_CRITICAL);
      else if (r.humidityPct < 82 || r.humidityPct > 88) mark(ALARM_WARNING);
      if (r.humidityPct < 82) out.increaseHumidity = true;
      if (r.humidityPct > 88) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 1000) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 900) mark(ALARM_RISK);
      if (r.co2ppm > 900) out.increaseVentilation = true;
    }
  } else if (stage == "adaptation_0_1") {
    if (hasT) {
      if (r.temperatureC < 27 || r.temperatureC > 29) mark(ALARM_CRITICAL);
      else if (r.temperatureC < 27.5f || r.temperatureC > 28.5f) mark(ALARM_WARNING);
      if (r.temperatureC < 27.5f) out.increaseTemperature = true;
      if (r.temperatureC > 28.5f) out.decreaseTemperature = true;
    }
    if (hasH) {
      if (r.humidityPct < 86 || r.humidityPct > 92) mark(ALARM_CRITICAL);
      else if (r.humidityPct < 88 || r.humidityPct > 91) mark(ALARM_WARNING);
      if (r.humidityPct < 88) out.increaseHumidity = true;
      if (r.humidityPct > 91) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 800) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 700) mark(ALARM_RISK);
      if (r.co2ppm > 700) out.increaseVentilation = true;
    }
  } else if (stage == "larva_1") {
    if (hasT) {
      if (r.temperatureC < 26.5f || r.temperatureC > 27.5f) mark(ALARM_WARNING);
      if (r.temperatureC < 26.5f) out.increaseTemperature = true;
      if (r.temperatureC > 27.5f) out.decreaseTemperature = true;
    }
    if (hasH) {
      if (r.humidityPct > 90) { mark(ALARM_CRITICAL); out.muscardineRisk = true; }
      else if (r.humidityPct < 86 || r.humidityPct > 89) mark(ALARM_WARNING);
      if (r.humidityPct < 86) out.increaseHumidity = true;
      if (r.humidityPct > 89) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 900) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 800) mark(ALARM_RISK);
      if (r.co2ppm > 800) out.increaseVentilation = true;
    }
  } else if (stage == "larva_2") {
    if (hasT) {
      if (r.temperatureC < 25.5f || r.temperatureC > 26.5f) mark(ALARM_WARNING);
      if (r.temperatureC < 25.5f) out.increaseTemperature = true;
      if (r.temperatureC > 26.5f) out.decreaseTemperature = true;
    }
    if (hasH) {
      if (r.humidityPct > 85) mark(ALARM_CRITICAL);
      else if (r.humidityPct < 81 || r.humidityPct > 84) mark(ALARM_WARNING);
      if (r.humidityPct < 81) out.increaseHumidity = true;
      if (r.humidityPct > 84) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 1000) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 900) mark(ALARM_RISK);
      if (r.co2ppm > 900) out.increaseVentilation = true;
    }
  } else if (stage == "larva_3") {
    if (hasT) {
      if (r.temperatureC < 24.5f || r.temperatureC > 25.5f) mark(ALARM_WARNING);
      if (r.temperatureC < 24.5f) out.increaseTemperature = true;
      if (r.temperatureC > 25.5f) out.decreaseTemperature = true;
    }
    if (hasH) {
      if (r.humidityPct > 80) { mark(ALARM_CRITICAL); out.muscardineRisk = true; }
      else if (r.humidityPct < 76 || r.humidityPct > 79) mark(ALARM_WARNING);
      if (r.humidityPct < 76) out.increaseHumidity = true;
      if (r.humidityPct > 79) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 1100) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 1000) mark(ALARM_RISK);
      if (r.co2ppm > 1000) out.increaseVentilation = true;
    }
  } else if (stage == "larva_4") {
    if (hasH) {
      if (r.humidityPct > 75) { mark(ALARM_CRITICAL); out.muscardineRisk = true; }
      else if (r.humidityPct > 74) mark(ALARM_WARNING);
      if (r.humidityPct > 74) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 1200) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 1100) mark(ALARM_RISK);
      if (r.co2ppm > 1100) out.increaseVentilation = true;
    }
    if (hasCO2 && hasH && r.co2ppm > 1200 && r.humidityPct > 75) {
      out.flacherieRisk = true;
      mark(ALARM_CRITICAL);
    }
  } else if (stage == "larva_5") {
    if (hasH) {
      if (r.humidityPct > 70) { mark(ALARM_CRITICAL); out.muscardineRisk = true; }
      else if (r.humidityPct > 69) mark(ALARM_WARNING);
      if (r.humidityPct > 69) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 1200) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 1100) mark(ALARM_RISK);
      if (r.co2ppm > 1100) out.increaseVentilation = true;
    }
  } else if (stage == "cocoon") {
    if (hasH) {
      if (r.humidityPct > 70) { mark(ALARM_CRITICAL); out.cocoonQualityRisk = true; }
      else if (r.humidityPct < 63 || r.humidityPct > 68) mark(ALARM_WARNING);
      if (r.humidityPct < 63) out.increaseHumidity = true;
      if (r.humidityPct > 68) out.decreaseHumidity = true;
    }
    if (hasCO2) {
      if (r.co2ppm > 1000) mark(ALARM_CRITICAL);
      else if (r.co2ppm > 900) mark(ALARM_RISK);
      if (r.co2ppm > 900) out.increaseVentilation = true;
    }
  }

  // Keep last temp for rapid-change detection
  if (hasT) {
    lastTempC = r.temperatureC;
    lastTempMs = nowMs;
  }

  // Convert risks into action hints
  if (out.decreaseTemperature || out.decreaseHumidity) {
    out.increaseVentilation = true;
  }

  return out;
}
