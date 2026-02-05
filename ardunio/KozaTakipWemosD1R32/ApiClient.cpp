#include "ApiClient.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include <time.h>

#include "Config.h"
#include "RuleEngine.h"

static bool httpPostJson(const String& url, const String& jsonBody) {
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  if (ACTUATOR_API_KEY && String(ACTUATOR_API_KEY).length() > 0) {
    http.addHeader("x-api-key", ACTUATOR_API_KEY);
  }
  int code = http.POST((uint8_t*)jsonBody.c_str(), jsonBody.length());
  http.end();
  return code >= 200 && code < 300;
}

static bool httpGetJson(const String& url, String& outBody) {
  HTTPClient http;
  http.begin(url);
  if (ACTUATOR_API_KEY && String(ACTUATOR_API_KEY).length() > 0) {
    http.addHeader("x-api-key", ACTUATOR_API_KEY);
  }
  int code = http.GET();
  if (code > 0) outBody = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

ApiClient::ApiClient(const char* apiBaseUrl, const char* devId) : apiBase(apiBaseUrl), deviceId(devId) {}

void ApiClient::setStage(const char* stageId) {
  stage = stageId ? String(stageId) : String("");
}

const String& ApiClient::getStage() const {
  return stage;
}

static String isoTimestampNowUtc() {
  time_t now = time(nullptr);
  if (now <= 0) return String("1970-01-01T00:00:00Z");

  struct tm t;
  gmtime_r(&now, &t);

  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

bool ApiClient::postActuatorAudit(const char* actuator, const char* modeStr, bool state, const EnvReading& r) {
  StaticJsonDocument<512> doc;
  doc["actuator"] = actuator;
  doc["mode"] = modeStr;
  doc["state"] = state;

  JsonObject payload = doc.createNestedObject("payload");
  payload["device_id"] = deviceId;
  payload["wifi_rssi"] = WiFi.RSSI();

  String act = String(actuator);
  if (act == "ventilation") {
    if (!isnan(r.temperatureC)) payload["temperature"] = r.temperatureC;
    if (!isnan(r.humidityPct)) payload["humidity"] = r.humidityPct;
    if (r.co2ppm > 0) payload["co2_ppm"] = r.co2ppm;
  } else if (act == "heater") {
    if (!isnan(r.temperatureC)) payload["temperature"] = r.temperatureC;
  } else if (act == "humidifier") {
    if (!isnan(r.humidityPct)) payload["humidity"] = r.humidityPct;
  } else if (act == "lighting") {
    if (!isnan(r.lux)) payload["lux"] = r.lux;
  }

  String body;
  serializeJson(doc, body);

  String url = String(apiBase) + "/api/actuators/audit";
  return httpPostJson(url, body);
}

bool ApiClient::fetchActiveStage(String& outStage) {
  String url = String(apiBase) + "/api/devices/config?device_id=" + String(deviceId);
  String body;
  if (!httpGetJson(url, body)) return false;

  StaticJsonDocument<2048> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return false;

  JsonVariant cfg = doc["config"];
  if (cfg.isNull()) return false;

  const char* st = cfg["active_stage"] | (const char*)nullptr;
  if (!st || String(st).length() == 0) return false;

  outStage = String(st);
  return true;
}

bool ApiClient::postHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["device_id"] = deviceId;
  doc["rssi"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();

  String body;
  serializeJson(doc, body);

  String url = String(apiBase) + "/api/devices/heartbeat";
  return httpPostJson(url, body);
}

bool ApiClient::postEnvironmentMessage(const EnvReading& r) {
  static RuleEngine rules;

  StaticJsonDocument<768> msg;
  msg["agent"] = "environment";
  msg["timestamp"] = isoTimestampNowUtc();
  const String stageId = stage.length() > 0 ? stage : String(DEFAULT_STAGE);
  msg["stage"] = stageId;

  RuleOutput out = rules.evaluate(stageId, r);
  msg["stress_level"] = RuleEngine::toStressLevel(out.level);

  JsonObject risk = msg.createNestedObject("risk_flags");
  risk["flacherie"] = out.flacherieRisk;
  risk["muscardine"] = out.muscardineRisk;
  risk["cocoon_quality"] = out.cocoonQualityRisk;
  risk["rapid_temp_change"] = out.rapidTempChange;

  msg["temperature"] = !isnan(r.temperatureC) ? r.temperatureC : -1.0;
  msg["humidity"] = !isnan(r.humidityPct) ? r.humidityPct : -1.0;
  msg["co2_ppm"] = r.co2ppm > 0 ? r.co2ppm : -1;

  JsonArray rec = msg.createNestedArray("recommended_action");
  if (out.increaseVentilation) rec.add("increase_ventilation");
  if (out.increaseHumidity) rec.add("increase_humidity");
  if (out.decreaseHumidity) rec.add("decrease_humidity");
  if (out.increaseTemperature) rec.add("increase_temperature");
  if (out.decreaseTemperature) rec.add("decrease_temperature");

  String body;
  serializeJson(msg, body);

  String url = String(apiBase) + "/api/messages";
  return httpPostJson(url, body);
}

bool ApiClient::pollActuatorCommand(ActuatorCommand& out) {
  out.id = 0;
  out.actuator = "";
  out.mode = "";
  out.state = false;

  String url = String(apiBase) + "/api/actuators/command/poll?device_id=" + String(deviceId);
  String body;
  if (!httpGetJson(url, body)) return false;

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return false;

  JsonVariant cmd = doc["command"];
  if (cmd.isNull()) return true;

  out.id = cmd["id"] | 0;
  out.actuator = String((const char*)(cmd["actuator"] | ""));
  out.mode = String((const char*)(cmd["mode"] | ""));
  out.state = (bool)(cmd["state"] | false);
  return true;
}

bool ApiClient::ackActuatorCommand(unsigned long id, bool ok) {
  StaticJsonDocument<128> doc;
  doc["id"] = id;
  doc["ok"] = ok;
  String body;
  serializeJson(doc, body);
  String url = String(apiBase) + "/api/actuators/command/ack";
  return httpPostJson(url, body);
}

bool ApiClient::fetchStageThresholds(const char* stage, Thresholds& out) {
  if (!stage || String(stage).length() == 0) return false;

  String url = String(apiBase) + "/api/devices/config?device_id=" + String(deviceId);
  String body;
  if (!httpGetJson(url, body)) return false;

  StaticJsonDocument<2048> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return false;

  JsonVariant cfg = doc["config"];
  if (cfg.isNull()) return false;

  JsonVariant stages = cfg["stages"];
  if (!stages.is<JsonObject>()) return false;

  JsonVariant st = stages[stage];
  if (st.isNull()) return false;

  out.tMin = (float)(st["t_min"] | NAN);
  out.tOpt = (float)(st["t_opt"] | NAN);
  out.tMax = (float)(st["t_max"] | NAN);
  out.hMin = (float)(st["h_min"] | NAN);
  out.hOpt = (float)(st["h_opt"] | NAN);
  out.hMax = (float)(st["h_max"] | NAN);
  out.co2Min = (int)(st["co2_min"] | -1);
  out.co2Opt = (int)(st["co2_opt"] | -1);
  out.co2Max = (int)(st["co2_max"] | -1);

  if (isnan(out.tOpt) && !isnan(out.tMin) && !isnan(out.tMax)) out.tOpt = (out.tMin + out.tMax) / 2.0f;
  if (isnan(out.hOpt) && !isnan(out.hMin) && !isnan(out.hMax)) out.hOpt = (out.hMin + out.hMax) / 2.0f;
  if (out.co2Opt < 0 && out.co2Min >= 0 && out.co2Max >= 0) out.co2Opt = (out.co2Min + out.co2Max) / 2;

  return true;
}
