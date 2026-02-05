#include <WiFi.h>

#include <time.h>

#include <esp_task_wdt.h>

#include <Preferences.h>

#include "Config.h"

#include "Types.h"

#include "Sensors.h"
#include "Actuators.h"
#include "ApiClient.h"
#include "Controller.h"
#include "LocalWeb.h"

DHT22Sensor sDht(PIN_DHT);
MHZ19Sensor sCo2(Serial2, PIN_MHZ19_RX, PIN_MHZ19_TX);
BH1750Sensor sLux;

ISensor* sensorList[] = { &sDht, &sCo2, &sLux };
const int SENSOR_COUNT = sizeof(sensorList) / sizeof(sensorList[0]);
SensorManager sensorManager(sensorList, SENSOR_COUNT);

RelayActuator aFan("ventilation", PIN_RELAY_FAN, true);
RelayActuator aHeater("heater", PIN_RELAY_HEATER, true);
RelayActuator aHumidifier("humidifier", PIN_RELAY_HUMIDIFIER, true);
RelayActuator aLight("lighting", PIN_RELAY_LIGHT, true);

ActuatorSet actuators = { &aFan, &aHeater, &aHumidifier, &aLight };

ControlModes modes;
ApiClient api(API_BASE, DEVICE_ID);
Thresholds thresholds;
Controller controller(actuators, &modes, &api, &thresholds);
LocalWeb localWeb(80, &sensorManager, &controller, &modes);

Preferences prefs;
String activeStage = String(DEFAULT_STAGE);

unsigned long lastSendMs = 0;
unsigned long lastCmdPollMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastConfigPollMs = 0;

static void loadThresholdsFromNvs(Thresholds& out) {
  prefs.begin("koza", true);
  activeStage = prefs.getString("active_stage", DEFAULT_STAGE);
  out.tMin = prefs.getFloat("t_min", T_OK_MIN);
  out.tOpt = prefs.getFloat("t_opt", NAN);
  out.tMax = prefs.getFloat("t_max", T_OK_MAX);
  out.hMin = prefs.getFloat("h_min", H_OK_MIN);
  out.hOpt = prefs.getFloat("h_opt", NAN);
  out.hMax = prefs.getFloat("h_max", H_OK_MAX);
  out.co2Min = prefs.getInt("co2_min", 0);
  out.co2Opt = prefs.getInt("co2_opt", -1);
  out.co2Max = prefs.getInt("co2_max", CO2_OK_MAX);
  prefs.end();

  Serial.println("[CFG] Loaded from NVS");
  Serial.print("[CFG] active_stage=");
  Serial.println(activeStage);
  Serial.print("[CFG] T=");
  Serial.print(out.tMin);
  Serial.print("..");
  Serial.println(out.tMax);
  Serial.print("[CFG] T_opt=");
  Serial.println(out.tOpt);
  Serial.print("[CFG] H=");
  Serial.print(out.hMin);
  Serial.print("..");
  Serial.println(out.hMax);
  Serial.print("[CFG] H_opt=");
  Serial.println(out.hOpt);
  Serial.print("[CFG] CO2=");
  Serial.print(out.co2Min);
  Serial.print("..");
  Serial.println(out.co2Max);
  Serial.print("[CFG] CO2_opt=");
  Serial.println(out.co2Opt);
}

static void saveThresholdsToNvs(const Thresholds& t) {
  prefs.begin("koza", false);
  prefs.putString("active_stage", activeStage);
  if (!isnan(t.tMin)) prefs.putFloat("t_min", t.tMin);
  if (!isnan(t.tOpt)) prefs.putFloat("t_opt", t.tOpt);
  if (!isnan(t.tMax)) prefs.putFloat("t_max", t.tMax);
  if (!isnan(t.hMin)) prefs.putFloat("h_min", t.hMin);
  if (!isnan(t.hOpt)) prefs.putFloat("h_opt", t.hOpt);
  if (!isnan(t.hMax)) prefs.putFloat("h_max", t.hMax);
  if (t.co2Min >= 0) prefs.putInt("co2_min", t.co2Min);
  if (t.co2Opt >= 0) prefs.putInt("co2_opt", t.co2Opt);
  if (t.co2Max >= 0) prefs.putInt("co2_max", t.co2Max);
  prefs.end();
}

void setup() {
  Serial.begin(115200);
  delay(100);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  esp_task_wdt_init(WATCHDOG_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  loadThresholdsFromNvs(thresholds);
  api.setStage(activeStage.c_str());
  Serial.print("[CFG] ApiClient stage set to ");
  Serial.println(api.getStage());

  sensorManager.begin();

  aFan.begin();
  aHeater.begin();
  aHumidifier.begin();
  aLight.begin();

  localWeb.begin();
}

void loop() {
  localWeb.handle();

  esp_task_wdt_reset();

  EnvReading r;
  r.tsMs = millis();
  sensorManager.readAll(r);

  if (millis() - lastCmdPollMs >= COMMAND_POLL_INTERVAL_MS) {
    lastCmdPollMs = millis();

    ActuatorCommand cmd;
    if (api.pollActuatorCommand(cmd) && cmd.id > 0) {
      bool ok = true;

      controller.setMode(cmd.actuator.c_str(), cmd.mode == "manual" ? MODE_MANUAL : MODE_AUTO);
      if (cmd.mode == "manual") {
        controller.applyManual(cmd.actuator.c_str(), cmd.state, r);
      }

      api.ackActuatorCommand(cmd.id, ok);
    }
  }

  if (millis() - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = millis();
    api.postHeartbeat();
  }

  if (millis() - lastConfigPollMs >= CONFIG_POLL_INTERVAL_MS) {
    lastConfigPollMs = millis();

    String fetchedStage;
    if (api.fetchActiveStage(fetchedStage) && fetchedStage.length() > 0 && fetchedStage != activeStage) {
      activeStage = fetchedStage;
      api.setStage(activeStage.c_str());
      prefs.begin("koza", false);
      prefs.putString("active_stage", activeStage);
      prefs.end();

      Serial.print("[CFG] active_stage updated from API -> ");
      Serial.println(activeStage);
    }

    Thresholds fetched;
    if (api.fetchStageThresholds(activeStage.c_str(), fetched)) {
      thresholds = fetched;
      saveThresholdsToNvs(thresholds);

      Serial.print("[CFG] thresholds updated for stage=");
      Serial.println(activeStage);
      Serial.print("[CFG] T=");
      Serial.print(thresholds.tMin);
      Serial.print("..");
      Serial.println(thresholds.tMax);
      Serial.print("[CFG] T_opt=");
      Serial.println(thresholds.tOpt);
      Serial.print("[CFG] H=");
      Serial.print(thresholds.hMin);
      Serial.print("..");
      Serial.println(thresholds.hMax);
      Serial.print("[CFG] H_opt=");
      Serial.println(thresholds.hOpt);
      Serial.print("[CFG] CO2=");
      Serial.print(thresholds.co2Min);
      Serial.print("..");
      Serial.println(thresholds.co2Max);
      Serial.print("[CFG] CO2_opt=");
      Serial.println(thresholds.co2Opt);
    }
  }

  controller.applyAutoControl(r);

  if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = millis();
    api.postEnvironmentMessage(r);
  }

  delay(200);
}
