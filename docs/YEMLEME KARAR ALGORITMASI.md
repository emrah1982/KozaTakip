# 🐛 Evre Bazlı Yemleme – CO₂ Yönetimi ve Karar Algoritmaları

Bu doküman, **hobi ve profesyonel ipekböceği yetiştiriciliğinde** yemleme kararlarının **rastgele değil**, çevresel ve biyolojik sinyallere dayalı olarak nasıl verilmesi gerektiğini açıklar.

Doküman; **gerçek saha uygulamaları**, **Çin’de kullanılan endüstriyel sericülter yaklaşımları** ve **otomasyon / AI entegrasyonu** dikkate alınarak hazırlanmıştır.

---

## 🎯 Temel Amaç

* Aşırı yemlemeden kaynaklı hastalıkları önlemek
* CO₂ artışını kontrol altında tutmak
* Yemleme kararlarını **ölçülebilir ve otomatik** hâle getirmek
* Yapay zekâ için **anlamlı beslenme verisi** üretmek

> **Ana ilke:** Biraz açlık sağlıklıdır, aşırı doygunluk hastalıktır.

---

## 1️⃣ Evre Bazlı Yemleme – CO₂ İlişki Tablosu

> Referans: **1000 larva**, normal yoğunluk, kapalı ortam

| Evre             | Günlük Yem (kg) | Besleme Sayısı | Yemleme Sonrası CO₂ Artışı | Kritik Süre | Risk Yorumu        |
| ---------------- | --------------- | -------------- | -------------------------- | ----------- | ------------------ |
| Adaptasyon (0–1) | 0.05–0.07       | 4–5            | +50–100 ppm                | 15 dk       | Çok hassas         |
| Instar 1         | 0.10–0.15       | 4–5            | +80–150 ppm                | 20 dk       | Islak yaprak riski |
| Instar 2         | 0.30–0.40       | 4              | +150–250 ppm               | 20–25 dk    | Fazla yem = stres  |
| Instar 3         | 0.80–1.00       | 3              | +300–500 ppm               | 30 dk       | CO₂ hızlı yükselir |
| Instar 4         | 2.00–2.50       | 3              | +600–900 ppm               | 30–40 dk    | Flacherie riski    |
| Instar 5         | 5.00–6.00       | 3              | +800–1200 ppm              | 40–60 dk    | **En kritik evre** |
| Koza             | 0               | 0              | –                          | –           | Yemleme yok        |

📌 **Yorum:** CO₂ artışı yemlemenin doğal sonucudur; ancak **uzun sürmesi hatalı yemlemeye işaret eder**.

---

## 2️⃣ “Ne Zaman Yem Verilmeli?” – Gerçek Dünya Karar Mantığı

Yemleme kararı **saat bazlı değil**, **durum bazlı** verilmelidir.

### ✅ Yem VERİLMELİ eğer:

* Önceki yaprakların **%80’den fazlası tüketilmişse**
* Larvalar **aktif şekilde yem arıyorsa**
* CO₂ seviyesi **optimuma yakın veya düşüş trendindeyse**
* Nem değeri **üst sınıra yakın değilse**
* Larvalar **gömlek değişiminde değilse**

### ❌ Yem VERİLMEMELİ eğer:

* Yaprak hâlâ büyük oranda duruyorsa
* CO₂ seviyesi hâlâ yüksekse
* Nem özellikle Instar 4–5’te yüksekse
* Larvalar hareketsiz veya gömlek değiştiriyorsa

> **En yaygın hata:** “Saat geldi, yem verelim.”

---

## 3️⃣ Otomasyon İçin Yemleme Karar Algoritmaları

### 3.1 Kural Tabanlı (Başlangıç Seviyesi)

```text
IF stage == COCOON:
    FEED = false

ELSE IF molting_detected == true:
    FEED = false

ELSE IF leaf_remaining_ratio > 0.3:
    FEED = false

ELSE IF co2_ppm > (co2_opt + 200):
    FEED = false

ELSE IF humidity > humidity_opt + 5:
    FEED = false

ELSE:
    FEED = true
```

---

### 3.2 Davranış + CO₂ Tabanlı (Orta Seviye – Çin Pratiği)

```text
IF stage != COCOON
   AND molting_detected == false
   AND leaf_remaining_ratio < 0.2
   AND movement_index > movement_threshold
   AND co2_trend == stable_or_decreasing
   AND humidity < humidity_opt + 3:
       FEED = true
ELSE:
       FEED = false
```

---

### 3.3 AI Destekli Karar (İleri Seviye)

```text
feed_score =
  w1 * hunger_index +
  w2 * movement_index +
  w3 * time_since_last_feed -
  w4 * co2_level -
  w5 * humidity_level -
  w6 * stress_index

IF feed_score > feed_threshold:
    FEED = true
ELSE:
    FEED = false
```

---

## 4️⃣ Yemleme – CO₂ – Hastalık İlişkisi (Özet)

| Gözlem                            | Yorum                             |
| --------------------------------- | --------------------------------- |
| Yemleme sonrası CO₂ hızlı düşüyor | Sağlıklı ortam                    |
| CO₂ uzun süre yüksek kalıyor      | Fazla yem / yetersiz havalandırma |
| Yemleme + yüksek nem              | Mantar riski                      |
| Az yem + stabil CO₂               | İdeal durum                       |
| Çok yem + sessizlik               | Flacherie riski                   |

---

## 🔑 Altın Kurallar

1. Açlık **hafif**, doygunluk **tam olmamalıdır**
2. Yemleme sonrası **ilk 30–60 dakika kritik**
3. Yemleme bir **çevresel olaydır**, tek başına düşünülmez
4. Evre ilerledikçe hata toleransı **azalır**
5. Koza evresinde yemleme **kesinlikle yapılmaz**

---

## 🎯 Sonuç

Bu yaklaşım sayesinde:

* Yemleme hataları azalır
* CO₂ alarmları anlam kazanır
* Yapay zekâ gerçek biyolojik stresi öğrenir
* Hastalık riski ciddi şekilde düşer

---

📌 Bu doküman; **Environment & IoT Agent**, **Predictive AI Agent** ve **Orchestrator Agent** tarafından ortak referans olarak kullanılmalıdır.
