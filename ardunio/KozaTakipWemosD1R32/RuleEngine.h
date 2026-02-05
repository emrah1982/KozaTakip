#pragma once

#include <Arduino.h>

#include "Types.h"

enum AlarmLevel {
  ALARM_NORMAL = 0,
  ALARM_WARNING = 1,
  ALARM_RISK = 2,
  ALARM_CRITICAL = 3
};

struct RuleOutput {
  AlarmLevel level = ALARM_NORMAL;

  bool increaseVentilation = false;
  bool increaseHumidity = false;
  bool decreaseHumidity = false;
  bool increaseTemperature = false;
  bool decreaseTemperature = false;

  bool flacherieRisk = false;
  bool muscardineRisk = false;
  bool cocoonQualityRisk = false;

  bool rapidTempChange = false;
};

class RuleEngine {
  float lastTempC = NAN;
  unsigned long lastTempMs = 0;

public:
  RuleEngine() {}

  void reset();
  RuleOutput evaluate(const String& stage, const EnvReading& r) {
    return evaluate(stage, r, millis());
  }
  RuleOutput evaluate(const String& stage, const EnvReading& r, unsigned long nowMs);

  static const char* toStressLevel(AlarmLevel lvl);
};
