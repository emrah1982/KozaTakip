#pragma once

#include <WebServer.h>

#include "Types.h"
#include "Sensors.h"
#include "Controller.h"

class LocalWeb {
  WebServer server;
  SensorManager* sensors;
  Controller* controller;
  ControlModes* modes;

public:
  LocalWeb(int port, SensorManager* sensors, Controller* controller, ControlModes* modes);
  void begin();
  void handle();
};
