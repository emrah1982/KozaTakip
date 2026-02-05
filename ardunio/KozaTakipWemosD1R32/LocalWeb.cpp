#include "LocalWeb.h"

#include <WiFi.h>
#include <ArduinoJson.h>

static ControlMode parseMode(const String& v, ControlMode fallback) {
  if (v == "auto") return MODE_AUTO;
  if (v == "manual") return MODE_MANUAL;
  return fallback;
}

LocalWeb::LocalWeb(int port, SensorManager* s, Controller* c, ControlModes* m)
  : server(port), sensors(s), controller(c), modes(m) {}

void LocalWeb::begin() {
  server.on("/set", [this]() {
    String act = server.arg("act");
    String mode = server.arg("mode");
    String state = server.arg("state");

    EnvReading r;
    r.tsMs = millis();
    sensors->readAll(r);

    if (act.length() > 0 && mode.length() > 0) {
      controller->setMode(act.c_str(), parseMode(mode, MODE_AUTO));
    }

    if (state.length() > 0) {
      bool on = (state == "1" || state == "true");
      controller->applyManual(act.c_str(), on, r);
    }

    server.send(200, "application/json", "{\"ok\":true}");
  });

  server.on("/status", [this]() {
    StaticJsonDocument<512> doc;
    doc["ip"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();

    JsonObject m = doc.createNestedObject("modes");
    m["ventilation"] = (modes->fan == MODE_AUTO ? "auto" : "manual");
    m["heater"] = (modes->heater == MODE_AUTO ? "auto" : "manual");
    m["humidifier"] = (modes->humidifier == MODE_AUTO ? "auto" : "manual");
    m["lighting"] = (modes->lighting == MODE_AUTO ? "auto" : "manual");

    String out;
    serializeJson(doc, out);
    server.send(200, "application/json", out);
  });

  server.begin();
}

void LocalWeb::handle() { server.handleClient(); }
