#pragma once

static const char* WIFI_SSID = "SSID";
static const char* WIFI_PASS = "PASSWORD";

static const char* API_BASE = "http://localhost:8080";
static const char* DEVICE_ID = "wemos-d1-r32-01";
static const char* ACTUATOR_API_KEY = "koza_local_key_2026";

static const int PIN_DHT = 4;

static const int PIN_RELAY_FAN = 25;
static const int PIN_RELAY_HEATER = 26;
static const int PIN_RELAY_HUMIDIFIER = 27;
static const int PIN_RELAY_LIGHT = 14;

static const int PIN_MHZ19_RX = 16;
static const int PIN_MHZ19_TX = 17;

static const float T_OK_MIN = 24.0;
static const float T_OK_MAX = 28.0;

static const float H_OK_MIN = 75.0;
static const float H_OK_MAX = 85.0;

static const int CO2_OK_MAX = 1200;

static const float T_HYST = 0.3;
static const float H_HYST = 1.0;
static const int CO2_HYST = 50;

static const unsigned long SEND_INTERVAL_MS = 10UL * 1000UL;
static const unsigned long COMMAND_POLL_INTERVAL_MS = 2UL * 1000UL;
static const unsigned long HEARTBEAT_INTERVAL_MS = 30UL * 1000UL;

static const unsigned long CONFIG_POLL_INTERVAL_MS = 60UL * 1000UL;

static const char* DEFAULT_STAGE = "larva_4";

static const int WATCHDOG_TIMEOUT_SEC = 5 * 60;
