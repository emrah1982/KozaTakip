#pragma once

#include "Types.h"

#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>

class ISensor {
public:
  virtual void begin() = 0;
  virtual void read(EnvReading& out) = 0;
  virtual const char* name() const = 0;
  virtual ~ISensor() = default;
};

class DHT22Sensor : public ISensor {
  DHT dht;

public:
  explicit DHT22Sensor(int pin);
  void begin() override;
  void read(EnvReading& out) override;
  const char* name() const override;
};

class MHZ19Sensor : public ISensor {
  HardwareSerial& ser;
  int rxPin;
  int txPin;

public:
  MHZ19Sensor(HardwareSerial& s, int rx, int tx);
  void begin() override;
  void read(EnvReading& out) override;
  const char* name() const override;
};

class BH1750Sensor : public ISensor {
  BH1750 lightMeter;
  bool ok = false;

public:
  BH1750Sensor() = default;
  void begin() override;
  void read(EnvReading& out) override;
  const char* name() const override;
};

class SensorManager {
  ISensor** sensors;
  int sensorCount;

public:
  SensorManager(ISensor** list, int count);
  void begin();
  void readAll(EnvReading& out);
};
