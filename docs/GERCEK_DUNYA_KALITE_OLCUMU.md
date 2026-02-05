# Gerçek Dünyada Koza Kalite Ölçümü (Boyut / Renk / Homojenlik / Sağlık)

Bu doküman, Vision/YOLO çıktılarından üretilen kalite skorunun (Boyut, Renk, Homojenlik, Çevresel Stabilite) **sahada nasıl daha doğru/standart** hale getirileceğini özetler.

> Not: Uygulamadaki mevcut skor yaklaşımı hızlı devreye almak için **heuristic (kural-tabanlı) bir ilk sürümdür**. Üretimde ölçüm, kalibrasyon ve doğrulama adımlarıyla güçlendirilir.

---

## 1) Boyut (Size) — px değil, mm/cm hedeflenir

### Mevcut (hızlı) yaklaşım
- YOLO bbox alanı veya `area_ratio = bbox_area_px / frame_area_px` gibi oranlar.

### Sahada doğru yaklaşım
- Boyut hedefi genellikle **mm/cm** cinsinden ölçümdür.
- Bunun için:
  - Kamera kurulumunun sabit olması (mesafe/odak/zoom)
  - **Kamera kalibrasyonu** (intrinsic + distortion)
  - Sahneye **referans ölçek** ekleme
    - ArUco/AprilTag marker
    - Ölçek çizgisi / cetvel
    - Referans obje

### Bbox yerine daha iyi ölçüm
- Bbox, objenin gerçek alanını şişirebilir.
- Mümkünse:
  - **segmentasyon maskesi** ile gerçek alan
  - koza için: uzunluk/genişlik/ovalite gibi şekil metrikleri

---

## 2) Renk (Color) — ışık/white balance sabitleme şart

### Mevcut (hızlı) yaklaşım
- Bbox ROI içi ortalama RGB/HSV.

### Sahada doğru yaklaşım
- Renk ölçümü için görüntüleme koşulları sabitlenmelidir:
  - Sabit aydınlatma (ör. ring light)
  - Sabit pozlama/ISO
  - Sabit white balance
- Daha ölçümsel değerlendirme için:
  - RGB/HSV yerine **CIELAB (L*a*b*)**
  - Hedef renk ile **ΔE (Delta E)** renk farkı
- “Lekeli/kirli” gibi kusurlar:
  - Ortalama renk yerine **lekelenme/doku** analizi
  - Spot/defect segmentasyonu

---

## 3) Homojenlik (Homogeneity) — varyans/dağılım metrikleri

### Mevcut yaklaşım
- Bbox alanlarının std/mean oranı ile dağılım.

### Sahada doğru yaklaşım
- Aynı partide boyut/renk dağılımı:
  - medyan, IQR, std gibi istatistiklerle
- Segmentasyon ile:
  - koza yüzey düzgünlüğü
  - doku/lekelenme yoğunluğu

---

## 4) Sağlıklı / Hastalıklı (Healthy / Diseased)

- Eğitimli YOLO modeliniz “sağlıklı/hastalıklı” sınıfları veriyorsa, bu bilgi kalite kararında çok değerlidir.
- Sahada kritik nokta:
  - **False positive** maliyeti (yanlış hastalıklı) yüksek olabilir.
  - Tek kare yerine **çoklu kare** doğrulama önerilir:
    - Son N karede M kez hastalıklı görülürse alarm/ret

---

## 5) Skor Ağırlıkları (0.30/0.25/0.20/0.25)

Bu ağırlıklar genellikle iki kaynaktan belirlenir:
- İş standardı / müşteri şartnamesi
- Geçmiş veriden istatistiksel optimizasyon (regresyon, sınıflandırma, AHP vb.)

Sahada doğru yöntem:
- “Gerçek kalite” (insan etiketleri / laboratuvar ölçümü) ile model skorunu kıyaslayıp ağırlıkları güncellemek.

---

## 6) Evreye Duyarlı Skor (Koza yoksa N/A)

- Kamera görüntülerinde obje henüz **koza evresinde değilse** (larva / ön-koza), “koza kalite skoru” hesaplamak hatalıdır.
- Bu nedenle sahada önerilen uygulama:
  - Önce YOLO çıktısından **koza var mı?** kontrol et
  - Koza yoksa kalite panelinde **N/A (uygulanamaz)** göster
  - Kullanıcıya nedenini açıkça söyle: “Koza tespit edilmedi, bu evrede koza kalite skoru hesaplanmaz.”

Bu yaklaşım yanlış alarmı azaltır ve ölçümün “doğru zamanda” yapılmasını sağlar.

---

## 7) Larva Dönemi için Ayrı Metrikler (Koza kalitesi yerine)

Koza evresine gelmeden önce de görsel veriden fayda üretmek mümkündür; ancak bu metrikler **koza kalite ölçümü** ile karıştırılmamalıdır.

Örnek (larva odaklı) metrikler:
- Larva var/yok, yaklaşık adet/yoğunluk
- Hareketlilik (movement)
- Anomali/lekelenme (ayrı sınıflar veya ayrı model)

Pratikte en iyi sonuç:
- `larva` / `koza` (gerekirse `pre_koza`) gibi sınıflarla **multi-stage** model
- Koza kalite skorunun sadece `koza` sınıfında çalıştırılması

### Hareketlilik (movement) ne demek?

- Hareketlilik, larvanın belirli bir zaman aralığında **aktif davranış gösterme düzeyidir**.
- “Yürüyor mu?”dan daha geniştir:
  - baş hareketi / yaprak arama
  - kemirme davranışı
  - vücut segmentlerinin dalgalanması

#### Pratik yorum (yetiştirici gözüyle)

- Yavaş ama ritmik hareket: genelde sağlıklı
- Hiç hareket yok: gömlek değişimi (molting) veya hastalık/stres
- Çok hızlı/düzensiz hareket: stres/açlık/rahatsızlık

#### Sistem nasıl hesaplar? (görüntü işleme)

- Raspberry Pi tarafında ardışık kareler arasında gri-seviye **mutlak fark** (absdiff) ortalaması alınır ve 0–100 aralığına ölçeklenir.
- JSON çıktısında örnek alanlar:
  - `extra.larva_metrics.movement_index` (0–1)
  - `extra.larva_metrics.motion_score` (0–100) (movement_index × 100)
  - `extra.larva_metrics.movement_level` (low_risk / normal / high_stress)

Evreye göre örnek aralıklar (movement_index):

| Evre                 | **İdeal Movement** | Normal Aralık | Düşük (Risk) | Yüksek (Stres) |
| -------------------- | ------------------ | ------------- | ------------ | -------------- |
| **Adaptasyon (0–1)** | **0.25 – 0.40**    | 0.20 – 0.45   | < 0.15       | > 0.50         |
| **Instar 1**         | **0.30 – 0.50**    | 0.25 – 0.55   | < 0.20       | > 0.60         |
| **Instar 2**         | **0.25 – 0.40**    | 0.20 – 0.45   | < 0.15       | > 0.50         |
| **Instar 3**         | **0.20 – 0.35**    | 0.15 – 0.40   | < 0.10       | > 0.45         |
| **Instar 4**         | **0.15 – 0.30**    | 0.10 – 0.35   | < 0.08       | > 0.40         |
| **Instar 5**         | **0.10 – 0.25**    | 0.08 – 0.30   | < 0.05       | > 0.35         |
| **Koza Öncesi**      | **0.05 – 0.15**    | 0.03 – 0.20   | < 0.02       | > 0.25         |
| **Koza**             | **≈ 0.00**         | 0.00 – 0.02   | –            | –              |

---

## 8) Gömlek Değişimi (Molting) — alarm değil, “özel durum”

Gömlek değişimi (molting) doğru anlaşılmazsa:

- yanlış yemleme yapılır
- gereksiz alarm üretilir
- AI “hasta” sanıp yanlış öğrenir

### Molting nedir?

Larvanın büyüyebilmek için **eski deri tabakasını bırakıp yenisini oluşturmasıdır**. Bu sırada larva **yemez, çok az hareket eder ve hassastır**.

### 1) Gerçek dünyada (yetiştirici nasıl anlar?)

Görsel ve davranışsal işaretler:

- Larva **yem yemeyi bırakır**
- Hareket **belirgin şekilde azalır**
- Vücut **daha mat / soluk** görünebilir
- Baş kısmı hafif kalkık, sabit durabilir
- Aynı pozisyonda **saatlerce kalabilir**

### 2) Sistem (otomasyon) bunu nasıl anlayacak?

Bu iş tek sinyalle olmaz. Doğru yaklaşım: **çoklu sinyal birleşimi**.

#### A) Movement (hareketlilik) sinyali

- `movement_index` genelde **normalin %50–80 altına düşer**
- Bu düşüş çoğunlukla:
  - ani değil
  - kademeli
  - 2–12 saat sürer (evreye göre)

Not:

- Ani sıfırlanma → hastalık şüphesi
- Yavaş düşüş → molting olasılığı

#### B) Yem davranışı

- Yaprak var ama **yenmiyor**
- (Varsa) leaf_remaining_ratio değişmiyor
- CO₂:
  - **yükselmiyor**, hatta biraz düşüyor olabilir

#### C) Süre & zamanlama

Molting genelde evre geçişlerinde olur. Ortalama süreler:

| Geçiş        | Süre       |
| ------------ | ---------- |
| Instar 1 → 2 | 12–18 saat |
| Instar 2 → 3 | 16–24 saat |
| Instar 3 → 4 | 18–30 saat |
| Instar 4 → 5 | 24–36 saat |

Bu sürelerin **çok uzaması** risk işaretidir.

#### D) Görüntü (Vision Agent) ipuçları

- Boy artışı geçici olarak sabitlenebilir
- Segment hareketleri azalır
- Vücut dokusu daha pürüzsüz / mat görünebilir
- Eski deri arka kısımda ince şerit gibi görülebilir

### 3) Çin modeli (profesyonel yaklaşım)

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

### 4) “Molting var” karar algoritması

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

### 5) Molting mi, hastalık mı? (en kritik ayrım)

| Özellik         | Molting        | Hastalık        |
| --------------- | -------------- | --------------- |
| Hareket düşüşü  | Yavaş          | Ani             |
| Süre            | Saatler        | Uzun / belirsiz |
| CO₂             | Düşük / stabil | Düzensiz        |
| Yaprak tüketimi | Yok ama stabil | Yok + bozulma   |
| Sonrası         | Normalleşme    | Ölüm / zayıflık |

Molting sonrası movement geri gelmezse → alarm.

### Altın kurallar

1. Molting normaldir, alarm değildir
2. Moltingte yem verme en büyük hatadır
3. Tek sinyal asla yeterli değildir
4. Trend, anlıktan önemlidir
5. Molting süresi evreyle orantılıdır

## Önerilen Yol Haritası (Pratik)

1. Boyutu px değil mm yap (kalibrasyon/marker)
2. Renk için ışık + WB sabitle, mümkünse Lab/ΔE
3. Hastalıklı kararını çoklu-kare doğrulama ile güvenli hale getir
4. Ağırlıkları gerçek etiketli veriyle optimize et
