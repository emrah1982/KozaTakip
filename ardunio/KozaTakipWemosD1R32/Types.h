#pragma once

#include <Arduino.h>

enum ControlMode { MODE_AUTO, MODE_MANUAL };

struct EnvReading {
  float temperatureC = NAN;
  float humidityPct = NAN;
  int co2ppm = -1;
  float lux = NAN;
  unsigned long tsMs = 0;
};

struct Thresholds {
  float tMin = NAN;
  float tOpt = NAN;
  float tMax = NAN;

  float hMin = NAN;
  float hOpt = NAN;
  float hMax = NAN;

  int co2Min = -1;
  int co2Opt = -1;
  int co2Max = -1;
};
