#pragma once

#include "Types.h"

struct ActuatorCommand {
  unsigned long id = 0;
  String actuator = "";
  String mode = "";
  bool state = false;
};

class ApiClient {
  const char* apiBase;
  const char* deviceId;
  String stage = "";

public:
  ApiClient(const char* apiBaseUrl, const char* deviceId);

  void setStage(const char* stageId);
  const String& getStage() const;

  bool postEnvironmentMessage(const EnvReading& r);
  bool postActuatorAudit(const char* actuator, const char* modeStr, bool state, const EnvReading& r);

  bool postHeartbeat();

  bool pollActuatorCommand(ActuatorCommand& out);
  bool ackActuatorCommand(unsigned long id, bool ok);

  bool fetchActiveStage(String& outStage);
  bool fetchStageThresholds(const char* stage, Thresholds& out);
};
