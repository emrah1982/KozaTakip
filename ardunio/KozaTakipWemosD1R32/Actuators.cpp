#include "Actuators.h"

#include <Arduino.h>

RelayActuator::RelayActuator(const char* id, int pin, bool activeLow) : _id(id), _pin(pin), _activeLow(activeLow) {}

void RelayActuator::begin() {
  pinMode(_pin, OUTPUT);
  set(false);
}

const char* RelayActuator::id() const { return _id; }

bool RelayActuator::state() const { return _stateOn; }

void RelayActuator::set(bool on) {
  _stateOn = on;
  if (_activeLow) digitalWrite(_pin, on ? LOW : HIGH);
  else digitalWrite(_pin, on ? HIGH : LOW);
}
