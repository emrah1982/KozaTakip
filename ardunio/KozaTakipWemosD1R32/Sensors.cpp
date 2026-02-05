#include "Sensors.h"

DHT22Sensor::DHT22Sensor(int pin) : dht(pin, DHT22) {}

void DHT22Sensor::begin() { dht.begin(); }

void DHT22Sensor::read(EnvReading& out) {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(t)) out.temperatureC = t;
  if (!isnan(h)) out.humidityPct = h;
}

const char* DHT22Sensor::name() const { return "DHT22"; }

MHZ19Sensor::MHZ19Sensor(HardwareSerial& s, int rx, int tx) : ser(s), rxPin(rx), txPin(tx) {}

void MHZ19Sensor::begin() { ser.begin(9600, SERIAL_8N1, rxPin, txPin); }

void MHZ19Sensor::read(EnvReading& out) {
  uint8_t cmd[9] = {0xFF, 0x01, 0x86, 0, 0, 0, 0, 0, 0};
  uint8_t checksum = 0;
  for (int i = 1; i < 8; i++) checksum += cmd[i];
  cmd[8] = 0xFF - checksum + 1;

  while (ser.available()) ser.read();
  ser.write(cmd, 9);
  delay(20);

  uint8_t resp[9];
  int n = ser.readBytes(resp, 9);
  if (n == 9 && resp[0] == 0xFF && resp[1] == 0x86) {
    int ppm = (int)resp[2] * 256 + (int)resp[3];
    if (ppm > 0 && ppm < 10000) out.co2ppm = ppm;
  }
}

const char* MHZ19Sensor::name() const { return "MH-Z19"; }

void BH1750Sensor::begin() {
  Wire.begin();
  ok = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
}

void BH1750Sensor::read(EnvReading& out) {
  if (!ok) return;
  float lux = lightMeter.readLightLevel();
  if (lux >= 0) out.lux = lux;
}

const char* BH1750Sensor::name() const { return "BH1750"; }

SensorManager::SensorManager(ISensor** list, int count) : sensors(list), sensorCount(count) {}

void SensorManager::begin() {
  for (int i = 0; i < sensorCount; i++) sensors[i]->begin();
}

void SensorManager::readAll(EnvReading& out) {
  for (int i = 0; i < sensorCount; i++) sensors[i]->read(out);
}
