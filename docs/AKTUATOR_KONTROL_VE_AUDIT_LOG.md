# Aktüatör Kontrolü (Otomatik / Manuel) ve MySQL Audit Log

Bu doküman, KozaTakip uygulamasında Canlı İzleme ekranına eklenen **aktüatör kontrol kartlarını** ve manuel işlemlerin **MySQL audit log** olarak kaydedilmesini açıklar.

## Kapsam

Canlı İzleme ekranında (Web) aşağıdaki cihazlar için kontrol kartları bulunur:

- Havalandırma
- Aydınlatma
- Isıtıcı
- Nem Cihazı (Nemlendirici)

Her cihaz için aynı kontrol mantığı uygulanır:

- Otomatik mod (sistem önerisine göre)
- Manuel mod (kullanıcı Aç/Kapat zorlaması)
- Durum gösterimi: **AÇIK (yeşil)**, **KAPALI (kırmızı)**
- Manuel Aç/Kapat tıklamalarında MySQL’e **audit log** kaydı

## UI Davranışı (Web)

### Modlar

- Otomatik:
  - UI, son environment mesajındaki `recommended_action` alanına bakarak cihazın “AÇIK/KAPALI” olma durumunu gösterir.
- Manuel:
  - Kullanıcı `Aç` / `Kapat` butonları ile durumu belirler.
  - Durum ve mod seçimi `localStorage` içinde saklanır (sayfa yenilense de korunur).

### Görsel durum renkleri

- AÇIK: yeşil çerçeve + yeşil tonlu arka plan
- KAPALI: kırmızı çerçeve + kırmızı tonlu arka plan

### LocalStorage anahtarları

- Havalandırma
  - `koza:act:vent:mode`
  - `koza:act:vent:manualOn`
- Aydınlatma
  - `koza:act:light:mode`
  - `koza:act:light:manualOn`
- Isıtıcı
  - `koza:act:heater:mode`
  - `koza:act:heater:manualOn`
- Nem Cihazı
  - `koza:act:humidifier:mode`
  - `koza:act:humidifier:manualOn`

## Otomatik mod karar anahtarları

Otomatik modda UI, `recommended_action` içinde aşağıdaki anahtarları arar:

- Havalandırma:
  - `increase_ventilation`
- Aydınlatma:
  - `increase_lighting`
  - `turn_on_lights`
  - `lights_on`
- Isıtıcı:
  - `increase_heating`
  - `turn_on_heater`
  - `heater_on`
- Nem Cihazı:
  - `increase_humidity`
  - `turn_on_humidifier`
  - `humidifier_on`

Not: Bu anahtarlar demo amaçlıdır. Gerçek sistemde agent/orchestrator çıktısına göre standartlaştırılmalıdır.

## Manuel işlem audit log (API + MySQL)

### API endpoint

Manuel Aç/Kapat tıklamalarında Web uygulaması aşağıdaki endpoint’e istek atar:

- `POST /api/actuators/audit`

Örnek body:

```json
{
  "actuator": "ventilation",
  "mode": "manual",
  "state": true,
  "payload": {
    "stage": "larva_4_5",
    "stress_level": "medium",
    "env_timestamp": "2026-02-04T14:23:59.051Z",
    "temperature": 26.1,
    "humidity": 81,
    "co2_ppm": 1400
  }
}
```

Alanlar:

- `actuator`: `ventilation | lighting | heater | humidifier`
- `mode`: `manual | auto`
- `state`: `true` (Aç) / `false` (Kapat)
- `payload`: cihaz tipine uygun ek bağlam (sensör değerleri vb.)

### Cihaza özel payload kuralı

Manuel işlem kaydı atılırken payload cihaz tipine göre özelleştirilir:

- Havalandırma:
  - `temperature`, `humidity`, `co2_ppm`
- Isıtıcı:
  - `temperature`
- Nem Cihazı:
  - `humidity`
- Aydınlatma:
  - temel bağlam (örn. `stage`, `stress_level`, `env_timestamp`)

### MySQL tablo

Audit kayıtları `actuator_audit` tablosuna yazılır.

- Tablo init script içinde oluşturulur: `docker/mysql/init.sql`
- Ek güvenlik: API endpoint içinde `CREATE TABLE IF NOT EXISTS actuator_audit` çalıştırılarak tablo yoksa da otomatik oluşması sağlanır.

Kolonlar (özet):

- `created_at`: kayıt zamanı
- `actuator`: cihaz
- `mode`: auto/manual
- `state`: 0/1
- `client_ip`: istemci IP (varsa `x-forwarded-for`)
- `user_agent`: tarayıcı bilgisi
- `payload`: JSON

## Doğrulama / Test

### UI üzerinden

1. Canlı İzleme ekranına gir.
2. Bir cihaz kartında `Manuel` seç.
3. `Aç` veya `Kapat` tıkla.
4. Kart renginin (yeşil/kırmızı) değiştiğini doğrula.

### API/DB üzerinden

- Audit endpoint çağrısı:
  - `POST http://localhost:8080/api/actuators/audit`

- DB kontrol (örnek SQL):

```sql
SELECT * FROM actuator_audit ORDER BY id DESC LIMIT 50;
```

## Kaynak Kod Referansı

- Web:
  - `apps/web/src/ui/pages/LiveMonitoringPage.tsx`
- API:
  - `apps/api/src/presentation/http/router.ts`
- MySQL init:
  - `docker/mysql/init.sql`
