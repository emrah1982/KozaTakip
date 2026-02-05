# Gömlek Değişimi (Molting) — alarm değil, “özel durum”

Gömlek değişimi (molting) doğru anlaşılmazsa:

- yanlış yemleme yapılır
- gereksiz alarm üretilir
- AI “hasta” sanıp yanlış öğrenir

## Molting nedir?

Larvanın büyüyebilmek için **eski deri tabakasını bırakıp yenisini oluşturmasıdır**. Bu sırada larva **yemez, çok az hareket eder ve hassastır**.

## 1) Gerçek dünyada (yetiştirici nasıl anlar?)

Görsel ve davranışsal işaretler:

- Larva **yem yemeyi bırakır**
- Hareket **belirgin şekilde azalır**
- Vücut **daha mat / soluk** görünebilir
- Baş kısmı hafif kalkık, sabit durabilir
- Aynı pozisyonda **saatlerce kalabilir**

## 2) Sistem (otomasyon) bunu nasıl anlayacak?

Bu iş tek sinyalle olmaz. Doğru yaklaşım: **çoklu sinyal birleşimi**.

### A) Movement (hareketlilik) sinyali

- `movement_index` genelde **normalin %50–80 altına düşer**
- Bu düşüş çoğunlukla:
  - ani değil
  - kademeli
  - 2–12 saat sürer (evreye göre)

Not:

- Ani sıfırlanma → hastalık şüphesi
- Yavaş düşüş → molting olasılığı

### B) Yem davranışı

- Yaprak var ama **yenmiyor**
- (Varsa) leaf_remaining_ratio değişmiyor
- CO₂:
  - **yükselmiyor**, hatta biraz düşüyor olabilir

### C) Süre & zamanlama

Molting genelde evre geçişlerinde olur. Ortalama süreler:

| Geçiş        | Süre       |
| ------------ | ---------- |
| Instar 1 → 2 | 12–18 saat |
| Instar 2 → 3 | 16–24 saat |
| Instar 3 → 4 | 18–30 saat |
| Instar 4 → 5 | 24–36 saat |

Bu sürelerin **çok uzaması** risk işaretidir.

### D) Görüntü (Vision Agent) ipuçları

- Boy artışı geçici olarak sabitlenebilir
- Segment hareketleri azalır
- Vücut dokusu daha pürüzsüz / mat görünebilir
- Eski deri arka kısımda ince şerit gibi görülebilir

## 3) Çin modeli (profesyonel yaklaşım)

Çin’de molting için “özel durum/state” kullanılır:

```text
NORMAL
↓
PRE-MOLTING
↓
MOLTING
↓
POST-MOLTING
↓
NORMAL
```

Bu state’lerde:

- Yemleme KAPALI
- Alarm üretme KAPALI
- Sadece ortam stabil tutulur

## 4) “Molting var” karar algoritması

Orta seviye (kural + sensör):

```text
IF movement < (ideal_movement * 0.4)
   AND leaf_remaining_ratio > 0.6
   AND co2_trend == stable_or_decreasing
   AND duration >= expected_molting_min_hours:
       STATE = MOLTING
```

İleri seviye (AI destekli):

```text
molting_score =
  w1 * movement_drop_ratio +
  w2 * feeding_pause_duration +
  w3 * co2_flatness +
  w4 * stage_transition_probability

IF molting_score > molting_threshold:
    STATE = MOLTING
```

## 6) Evre bazlı molting tespiti — threshold tablosu

Amaç:

- Hastalığı molting sanmamak
- Molting’i hastalık sanmamak

Kullanılan ana sinyaller:

- Movement Index (MI)
- Movement düşüş oranı
- Süre
- CO₂ trendi
- Yem tüketimi

| Evre     | Normal MI | **Molting MI** | Düşüş Oranı | Min Süre | Max Süre | CO₂ Davranışı       |
| -------- | --------- | -------------- | ----------- | -------- | -------- | ------------------- |
| Instar 1 | 0.30–0.50 | **0.05–0.15**  | ≥ %60       | 8 saat   | 18 saat  | Sabit / düşüş       |
| Instar 2 | 0.25–0.40 | **0.05–0.12**  | ≥ %60       | 12 saat  | 24 saat  | Sabit               |
| Instar 3 | 0.20–0.35 | **0.04–0.10**  | ≥ %65       | 16 saat  | 30 saat  | Sabit / hafif düşüş |
| Instar 4 | 0.15–0.30 | **0.03–0.08**  | ≥ %70       | 20 saat  | 36 saat  | Düşüş               |
| Instar 5 | 0.10–0.25 | **0.02–0.06**  | ≥ %70       | 24 saat  | 48 saat  | Düşük & stabil      |

Yorumlama ipucu:

- Süre min’den kısa → geçici durgunluk
- Süre max’tan uzun → hastalık alarmı
- Düşüş ani ise → hastalık şüphesi

Ek doğrulama koşulları:

- Yaprak tüketimi neredeyse sıfır
- Leaf_remaining_ratio değişmiyor
- CO₂ yükselmiyor
- Nem üst sınıra yakın değil

## 7) Molting state’i tüm sistemi nasıl kilitler?

Molting, özel bir sistem durumu (state) olarak ele alınır.

Genel akış:

```text
NORMAL
  ↓ (molting sinyali)
PRE-MOLTING
  ↓ (threshold sağlandı)
MOLTING
  ↓ (movement geri döndü)
POST-MOLTING
  ↓ (stabilite sağlandı)
NORMAL
```

### Molting state’inde sistem davranışı

Kapatılanlar:

- Yemleme
- Hastalık alarmları
- Stres alarmları
- Evre geçiş alarmları

Açık kalanlar:

- Sıcaklık kontrolü
- Nem kontrolü
- CO₂ izleme
- Güvenlik alarmları (aşırı değerler)

### Agent bazlı kilitleme

Environment & IoT Agent:

- Optimum değerleri dar toleransla tutar
- CO₂ yükselirse yumuşak havalandırma

Vision Agent:

- Sadece gözlem yapar
- Alarm üretmez
- Movement trendini izler

Predictive AI Agent:

- Hastalık skoru dondurulur
- “Molting mode” flag’i aktif

Orchestrator Agent:

- Diğer ajanların alarm üretmesini engeller
- Sadece kritik eşik ihlallerine izin verir

### Molting’den çıkış (POST-MOLTING)

Çıkış koşulları:

- Movement Index molting MI’nin 2× üstüne çıkarsa
- Yem tüketimi başlarsa
- CO₂ yemleme sonrası tekrar yükselirse

```text
IF movement > molting_MI * 2
   AND feeding_resumed == true:
       STATE = POST_MOLTING
```

POST-MOLTING’te:

- İlk yemleme %30 azaltılmış yapılır
- Alarm hassasiyeti kademeli açılır

### Molting vs hastalık — son güvenlik kuralı

```text
IF STATE == MOLTING
   AND duration > max_molting_duration:
       → HASTALIK ALARMI (override)
```

Molting sonsuz değildir.

## 5) Molting mi, hastalık mı? (en kritik ayrım)

| Özellik         | Molting        | Hastalık        |
| --------------- | -------------- | --------------- |
| Hareket düşüşü  | Yavaş          | Ani             |
| Süre            | Saatler        | Uzun / belirsiz |
| CO₂             | Düşük / stabil | Düzensiz        |
| Yaprak tüketimi | Yok ama stabil | Yok + bozulma   |
| Sonrası         | Normalleşme    | Ölüm / zayıflık |

Molting sonrası movement geri gelmezse → alarm.

## Altın kurallar

1. Molting normaldir, alarm değildir
2. Moltingte yem verme en büyük hatadır
3. Tek sinyal asla yeterli değildir
4. Trend, anlıktan önemlidir
5. Molting süresi evreyle orantılıdır

6. Molting state’i = alarm susturucu
7. Süre aşımı = hastalık
8. Çıkış sonrası ilk yemleme hafif olur
