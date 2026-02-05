# Besleme Planı ve Yemek Reçeteleri

Bu doküman, ipekböceği üretim sürecinde **evre bazlı besleme planının** sistemde nasıl tutulacağını ve ilerleyen aşamada **yemek/yevmiye (yaprak) reçetelerinin** nasıl standartlaştırılacağını tarif eder.

Bu içerik iki amaçla kullanılacaktır:

1. Web UI (Ayarlar) üzerinden operatörün besleme planını girmesi
2. API/DB üzerinde kalıcı saklama (cihaz config JSON’u içinde)

Not: Bu alanların tasarımı **gelecekte genişletilebilir** olacak şekilde yapılmıştır.

---

## 1) Hedef

- Evreye göre (larva_1..larva_5, cocoon vb.)
- Gün/saat bazında (ör: evrede 3. gün, 08:00)
- Yaprak türü / miktar / öğün sıklığı / notlar

bilgilerinin girilip saklanabilmesi.

---

## 2) Veri Modeli (Öneri)

Bu yapı `device_config.config` JSON’u içinde `feeding_plan` alanında tutulur.

```json
{
  "feeding_plan": {
    "enabled": true,
    "notes": "Yapraklar kuru/ıslak kontrol edilsin. Küf oluşumuna dikkat.",
    "recipes": [
      {
        "stage": "larva_4",
        "day_in_stage": 2,
        "time": "08:00",
        "leaf_type": "dut",
        "amount_g": 120,
        "freq_per_day": 4,
        "notes": "Sabah ilk öğün. Yaprak taze olmalı."
      }
    ]
  }
}
```

### Alanlar

- `enabled`
  - Besleme planı UI ve otomasyonlarda devrede mi?
- `notes`
  - Genel notlar (hijyen, yaprak seçimi, depolama, gözlem vb.)
- `recipes[]`
  - Evre/gün/saat kırılımında reçete kayıtları

`recipes[]` elemanı:

- `stage`: string (örn. `larva_3`)
- `day_in_stage`: number (opsiyonel)
- `time`: string (opsiyonel, `HH:mm`)
- `leaf_type`: string (opsiyonel)
- `amount_g`: number (opsiyonel)
- `freq_per_day`: number (opsiyonel)
- `notes`: string (opsiyonel)

---

## 3) UI (Ayarlar) Yaklaşımı

İlk aşamada:

- `enabled` anahtarı
- `notes` alanı
- `recipes` için JSON edit alanı

Sonraki aşamada (planlanan):

- Tablo formu (evre satırı, gün/saat seçimi, miktar/frekans)
- Hata kontrolü ve şablonlar
- “Evreye göre önerilen başlangıç reçetesi” butonu

---

## 4) Persist / Senkron

- Web UI `PUT /api/devices/config` ile tüm config’i kaydeder.
- ESP32 cihazı periyodik olarak `GET /api/devices/config` çekerek NVS’e yazar.

Besleme planı şu anda ESP32 kontrol döngüsünde kullanılmasa bile, ileride:

- “Besleme hatırlatma/alarm”
- “Besleme uyumu”
- “Gözlem/kalite korelasyonu”

için temel veri kaynağı olacaktır.
