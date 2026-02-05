#pragma once

#include "Types.h"
#include "Actuators.h"
#include "ApiClient.h"

struct ControlModes {
  ControlMode fan = MODE_AUTO;
  ControlMode heater = MODE_AUTO;
  ControlMode humidifier = MODE_AUTO;
  ControlMode lighting = MODE_AUTO;
};

class Controller {
  ActuatorSet actuators;
  ControlModes* modes;
  ApiClient* api;
  Thresholds* thresholds;

public:
  Controller(const ActuatorSet& set, ControlModes* modes, ApiClient* api, Thresholds* thresholds);
  void applyAutoControl(const EnvReading& r);
  void applyManual(const char* actuatorId, bool state, const EnvReading& r);
  void setMode(const char* actuatorId, ControlMode mode);
};
