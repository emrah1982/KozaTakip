#pragma once

#include "Types.h"

class RelayActuator {
  const char* _id;
  int _pin;
  bool _activeLow;
  bool _stateOn = false;

public:
  RelayActuator(const char* id, int pin, bool activeLow = true);
  void begin();
  const char* id() const;
  bool state() const;
  void set(bool on);
};

struct ActuatorSet {
  RelayActuator* fan;
  RelayActuator* heater;
  RelayActuator* humidifier;
  RelayActuator* lighting;
};
