#include "Controller.h"

#include <Arduino.h>

#include "Config.h"

static bool strEq(const char* a, const char* b) {
  if (!a || !b) return false;
  return String(a) == String(b);
}

Controller::Controller(const ActuatorSet& set, ControlModes* m, ApiClient* a, Thresholds* th)
  : actuators(set), modes(m), api(a), thresholds(th) {}

void Controller::setMode(const char* actuatorId, ControlMode mode) {
  if (strEq(actuatorId, "ventilation")) modes->fan = mode;
  else if (strEq(actuatorId, "heater")) modes->heater = mode;
  else if (strEq(actuatorId, "humidifier")) modes->humidifier = mode;
  else if (strEq(actuatorId, "lighting")) modes->lighting = mode;
}

void Controller::applyManual(const char* actuatorId, bool state, const EnvReading& r) {
  if (strEq(actuatorId, "ventilation")) {
    if (modes->fan != MODE_MANUAL) return;
    if (state != actuators.fan->state()) {
      actuators.fan->set(state);
      api->postActuatorAudit("ventilation", "manual", state, r);
    }
    return;
  }

  if (strEq(actuatorId, "heater")) {
    if (modes->heater != MODE_MANUAL) return;
    if (state != actuators.heater->state()) {
      actuators.heater->set(state);
      api->postActuatorAudit("heater", "manual", state, r);
    }
    return;
  }

  if (strEq(actuatorId, "humidifier")) {
    if (modes->humidifier != MODE_MANUAL) return;
    if (state != actuators.humidifier->state()) {
      actuators.humidifier->set(state);
      api->postActuatorAudit("humidifier", "manual", state, r);
    }
    return;
  }

  if (strEq(actuatorId, "lighting")) {
    if (modes->lighting != MODE_MANUAL) return;
    if (state != actuators.lighting->state()) {
      actuators.lighting->set(state);
      api->postActuatorAudit("lighting", "manual", state, r);
    }
    return;
  }
}

void Controller::applyAutoControl(const EnvReading& r) {
  const float tMin = (thresholds && !isnan(thresholds->tMin)) ? thresholds->tMin : T_OK_MIN;
  const float tOpt = (thresholds && !isnan(thresholds->tOpt)) ? thresholds->tOpt : (tMin + ((thresholds && !isnan(thresholds->tMax)) ? thresholds->tMax : T_OK_MAX)) / 2.0f;
  const float tMax = (thresholds && !isnan(thresholds->tMax)) ? thresholds->tMax : T_OK_MAX;
  const float hMin = (thresholds && !isnan(thresholds->hMin)) ? thresholds->hMin : H_OK_MIN;
  const float hOpt = (thresholds && !isnan(thresholds->hOpt)) ? thresholds->hOpt : (hMin + ((thresholds && !isnan(thresholds->hMax)) ? thresholds->hMax : H_OK_MAX)) / 2.0f;
  const float hMax = (thresholds && !isnan(thresholds->hMax)) ? thresholds->hMax : H_OK_MAX;
  const int co2Min = (thresholds && thresholds->co2Min >= 0) ? thresholds->co2Min : 0;
  const int co2Opt = (thresholds && thresholds->co2Opt > 0) ? thresholds->co2Opt : (co2Min + ((thresholds && thresholds->co2Max > 0) ? thresholds->co2Max : CO2_OK_MAX)) / 2;
  const int co2Max = (thresholds && thresholds->co2Max > 0) ? thresholds->co2Max : CO2_OK_MAX;

  if (modes->fan == MODE_AUTO) {
    bool need = false;
    if (r.co2ppm > 0) {
      if (r.co2ppm > co2Max) need = true;
      else if (r.co2ppm > (co2Opt + CO2_HYST)) need = true;
      else if (r.co2ppm < (co2Opt - CO2_HYST)) need = false;
    }

    if (!isnan(r.temperatureC)) {
      if (r.temperatureC > tMax) need = true;
      else if (r.temperatureC > (tOpt + T_HYST)) need = true;
    }

    if (!isnan(r.humidityPct)) {
      if (r.humidityPct > hMax) need = true;
      else if (r.humidityPct > (hOpt + H_HYST)) need = true;
    }

    if (need != actuators.fan->state()) {
      actuators.fan->set(need);
      api->postActuatorAudit("ventilation", "auto", need, r);
    }
  }

  if (modes->heater == MODE_AUTO) {
    bool need = false;
    if (!isnan(r.temperatureC)) {
      if (r.temperatureC < tMin) need = true;
      else if (r.temperatureC > tMax) need = false;
      else {
        const bool wasOn = actuators.heater->state();
        if (!wasOn && r.temperatureC < (tOpt - T_HYST)) need = true;
        else if (wasOn && r.temperatureC > (tOpt + T_HYST)) need = false;
        else need = wasOn;
      }
    }
    if (need != actuators.heater->state()) {
      actuators.heater->set(need);
      api->postActuatorAudit("heater", "auto", need, r);
    }
  }

  if (modes->humidifier == MODE_AUTO) {
    bool need = false;
    if (!isnan(r.humidityPct)) {
      if (r.humidityPct < hMin) need = true;
      else if (r.humidityPct > hMax) need = false;
      else {
        const bool wasOn = actuators.humidifier->state();
        if (!wasOn && r.humidityPct < (hOpt - H_HYST)) need = true;
        else if (wasOn && r.humidityPct > (hOpt + H_HYST)) need = false;
        else need = wasOn;
      }
    }
    if (need != actuators.humidifier->state()) {
      actuators.humidifier->set(need);
      api->postActuatorAudit("humidifier", "auto", need, r);
    }
  }

  if (modes->lighting == MODE_AUTO) {
    bool need = (!isnan(r.lux) && r.lux < 50.0);
    if (need != actuators.lighting->state()) {
      actuators.lighting->set(need);
      api->postActuatorAudit("lighting", "auto", need, r);
    }
  }
}
