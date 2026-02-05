# 🤖 Alarm Verilerinden AI Feature Listesi

Bu doküman, **alarm/aksiyon kayıtlarının** yapay zekâ (Predictive AI) için **öğrenilebilir feature** setine nasıl dönüştürüleceğini tanımlar.

## 🧠 Temel Felsefe

- Alarm = olay
- Feature = anlam

AI’ye sadece “alarm oldu” bilgisini vermek yerine, alarmın **bağlamını** ve **dinamiğini** öğret:

- Ne kadar sürdü?
- Ne kadar hızlı değişti?
- Hangi evrede oldu?
- Başka hangi parametrelerle aynı anda oluştu?

---

## 1) Feature Grupları

Feature’ları 5 ana gruba ayır:

1. Seviye (Magnitude)
2. Süre (Duration)
3. Hız (Rate of Change)
4. Kombinasyon (Interaction)
5. Evre Bağlamı (Stage Context)

---

## 2) Seviye (Magnitude) Feature’ları

“Optimumdan ne kadar saptı?”

| Feature | Açıklama | Kaynak |
| --- | --- | --- |
| `temp_opt_deviation` | `temperature - t_opt` (°C) | Environment & IoT |
| `humidity_opt_deviation` | `humidity - h_opt` (%) | Environment & IoT |
| `co2_opt_deviation` | `co2_ppm - co2_opt` (ppm) | Environment & IoT |
| `max_co2_last_24h` | Son 24 saatte max CO₂ | Backend/Orchestrator |

Örnek:

- `co2_opt_deviation = 1180 - 800 = +380`

---

## 3) Süre (Duration) Feature’ları

“Ne kadar uzun sürdü?”

| Feature | Açıklama |
| --- | --- |
| `temp_warning_duration_min` | 🟡 sıcaklık alarm süresi (dk) |
| `humidity_risk_duration_min` | 🟠 nem alarm süresi (dk) |
| `co2_critical_duration_min` | 🔴 CO₂ alarm süresi (dk) |
| `total_alarm_time_last_12h` | Son 12 saatte toplam alarm süresi |

Not:

- Kısa ama sık alarmlar, uzun tek alarmdan daha tehlikeli olabilir.

---

## 4) Hız (Rate of Change) Feature’ları

“Ne kadar hızlı oldu?”

| Feature | Açıklama |
| --- | --- |
| `temp_change_rate_1h` | 1 saatte sıcaklık değişimi (°C) |
| `humidity_change_rate_30m` | 30 dk nem değişimi (%) |
| `co2_change_rate_10m` | 10 dk CO₂ değişimi (ppm) |
| `num_spikes_24h` | Son 24 saatte ani sıçrama sayısı |

Özellikle:

- Flacherie
- Grasserie

gibi vakalarda hızlı değişim güçlü sinyaldir.

---

## 5) Kombinasyon (Interaction) Feature’ları

“Tek başına değil, birlikte ne oldu?”

| Feature | Açıklama |
| --- | --- |
| `co2_humidity_overlap_time_min` | Yüksek CO₂ + yüksek nem aynı anda kaç dakika sürdü |
| `temp_drop_with_high_humidity` | Sıcaklık düşüşü + yüksek nem beraberliği |
| `multi_alarm_overlap_count` | Aynı anda kaç parametre alarmdaydı |
| `co2_after_feeding_peak` | Besleme sonrası CO₂ sıçraması |

Altın kural:

- **CO₂ + yüksek nem** en güçlü hastalık sinyallerinden biridir.

---

## 6) Evre Bağlamı (Stage Context) Feature’ları

“Bu alarm hangi evrede oluştu?”

| Feature | Açıklama |
| --- | --- |
| `current_stage` | aktif evre ID (`larva_4`, `cocoon` vb.) |
| `days_in_stage` | evrede kaçıncı gün |
| `alarm_stage_weighted_score` | evre ağırlıklı alarm skoru |

Not:

- Aynı alarm, farklı evrede farklı risk anlamına gelebilir.

---

## 7) Türetilmiş (Composite) Feature’lar

Model performansını genelde ciddi artıran birleşik feature’lar:

| Feature | Açıklama |
| --- | --- |
| `stress_index_24h` | 24 saatte birleşik stres indeksi |
| `environment_instability_score` | dalgalanma yoğunluğu |
| `recovery_time_after_alarm_min` | alarmdan normale dönüş süresi |
| `alarm_frequency_score` | alarm sıklığı skoru |

---

## 8) Örnek Feature Vektörü

```json
{
  "stage": "larva_4",
  "days_in_stage": 3,
  "temp_opt_deviation": 0.6,
  "humidity_opt_deviation": 4.2,
  "co2_opt_deviation": 380,
  "co2_critical_duration_min": 18,
  "co2_change_rate_10m": 120,
  "co2_humidity_overlap_time_min": 14,
  "stress_index_24h": 0.71,
  "environment_instability_score": 0.64
}
```

---

## 9) Hangi Agent Hangi Feature’ı Üretir?

| Feature Grubu | Üreten |
| --- | --- |
| Seviye & Süre | Environment & IoT |
| Hız | Environment & IoT |
| Kombinasyon | Orchestrator / Backend |
| Evre bağlamı | Orchestrator |
| Stres indeksleri | Predictive AI |

---

## 🔑 Özet Kurallar

- Alarm = olay, feature = anlam
- Tek alarm ≠ hastalık
- Süre + hız + evre = risk
- CO₂ + nem = en güçlü sinyal
- Normalleşme süresi kritik bir feature’tır
