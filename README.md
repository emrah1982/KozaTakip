# 🐛 İpekböceği Otomasyon & Yapay Zekâ Sistemi

Bu depo, **ipekböceği (sericulture) yetiştiriciliği** için geliştirilen **çok ajanlı (multi‑agent) otomasyon ve yapay zekâ mimarisini** içerir.

Sistem; **hobi ölçeğinde başlayıp profesyonel/yarı endüstriyel üretime ölçeklenebilecek**, çevre kontrolü, erken hastalık tahmini ve koza kalite skorlama yeteneklerine sahip olacak şekilde tasarlanmıştır.

---

## 🎯 Projenin Amacı

* İpekböcekleri için **ideal çevre koşullarını otomatik sağlamak**
* Hastalıklar ortaya çıkmadan önce **risk tahmini yapmak** ("Hasta olacak mı?")
* Karanlık ortamı bozmadan **kamera tabanlı analiz** yapmak
* Koza kalitesini **objektif ve sayısal olarak puanlamak**
* Yapay zekâ için **temiz, izlenebilir ve tutarlı veri** üretmek

---

## 🏗️ Sistem Mimarisi (Özet)

Sistem **çok ajanlı (multi‑agent)** bir yapıya sahiptir:

```text
[ Orchestrator Agent ]
        |
        |—— Environment & IoT Agent
        |—— Vision Agent
        |—— Predictive AI Agent
        |—— Quality Scoring Agent
        |—— Data & Backend Agent
```

Her ajan **tek sorumluluk ilkesine** göre çalışır. Nihai kararlar **Orchestrator Agent** tarafından verilir.

---

## 🤖 Ajanlar ve Görevleri

### 1️⃣ Orchestrator Agent

**Sistemin beyni ve koordinatörü**

* Ajan çıktılarının birleştirilmesi
* Çakışmaların yönetimi
* Nihai alarm ve aksiyon kararları
* İnsan onayı gerektiren durumların işaretlenmesi

---

### 2️⃣ Environment & IoT Agent

**Çevre kontrol uzmanı (ESP32)**

* Sıcaklık, nem ve CO₂ izleme
* Evre bazlı eşik yönetimi
* Fan / ısıtıcı / nemlendirici aksiyon önerileri
* Çevresel stres tespiti

---

### 3️⃣ Vision Agent

**Karanlık ortam görüntü analizi (Raspberry Pi)**

* Pi NoIR kamera + 850 nm IR LED
* Ortamı aydınlatmadan görüntü alma
* Hareket, boyut ve doku özellikleri çıkarımı

---

### 4️⃣ Predictive AI Agent

**"Hasta olacak mı?" tahmin modülü**

* Zaman serisi çevre verileri
* Görüntüden türetilmiş metrikler
* 24–72 saatlik hastalık risk tahmini
* Önleyici aksiyon önerileri

---

### 5️⃣ Quality Scoring Agent

**Koza kalite değerlendirme ajanı**

* Koza boyut, şekil ve yüzey analizi
* Çevresel geçmişin kaliteye etkisi
* A / B / C kalite sınıflandırması

---

### 6️⃣ Data & Backend Agent

**Sistemin hafızası**

* Tüm verilerin zaman serisi olarak saklanması
* Dashboard ve API veri akışı
* Yapay zekâ eğitim setlerinin hazırlanması

---

## 🌡️ Kritik Çevre Parametreleri

* **Sıcaklık** (evre bazlı)
* **Nem** (yüksek nem = mantar riski)
* **CO₂ (NDIR sensör)** – görünmeyen ama kritik stres faktörü

CO₂ eşikleri:

* 400–800 ppm → İdeal
* 800–1200 ppm → İzleme
* ≥1200 ppm → Havalandırma
* ≥1500 ppm → Uyarı
* ≥3000 ppm → Acil alarm

---

## 📸 Kamera ve Karanlık Ortam Yaklaşımı

* Kamera: **Raspberry Pi + Pi NoIR Camera**
* Aydınlatma: **850 nm Infrared LED**
* Ortam: İpekböcekleri için tamamen **karanlık**

Bu yaklaşım, **Çin’de kullanılan endüstriyel sericülter sistemleriyle uyumludur**.

---

## 🧠 Yapay Zekâ Yaklaşımı

### Hastalık Risk Tahmini

* Faz 1: Kural tabanlı
* Faz 2: Random Forest / XGBoost
* Faz 3: LSTM (zaman serisi) + CNN (görüntü)

### Koza Kalite Skoru

```text
Kalite Skoru =
  Boyut × 0.30 +
  Renk / Yansıma × 0.25 +
  Homojenlik × 0.20 +
  Çevresel Stabilite × 0.25
```

---

## 📊 Veri Modeli (Örnek)

```json
{
  "timestamp": "ISO-8601",
  "stage": "larva_4_5",
  "temperature": 25.6,
  "humidity": 72.3,
  "co2_ppm": 1180,
  "fan": true,
  "heater": false,
  "risk_score": 42
}
```

---

## 🔐 Temel Tasarım İlkeleri

* Önleme > tespit
* Stabilite > hız
* Açıklanabilirlik > ham alarm
* Ölçeklenebilirlik > kısa yol çözümleri
* İnsan onayı kritik kararlarda zorunlu

---

## 🚀 Bu Proje Ne Seviyede?

Bu depo:

* ❌ Basit bir hobi projesi değildir
* ✅ **Endüstriyel yaklaşımla tasarlanmış** bir akıllı tarım sistemidir
* ✅ TÜBİTAK / yatırım / pilot tesis seviyesine uygundur

---

## 📌 Son Not

Bu README, sistemin **nasıl çalıştığını** açıklar.
Detaylı uygulama için:

* Ajanlara ait **SYSTEM PROMPT** dosyaları
* **JSON mesaj şemaları**
* Teknik mimari dokümantasyon

kullanılmalıdır.

---

👤 Bu sistem; veri, biyoloji ve yapay zekâyı birleştiren **geleceğe dönük bir sericülter platformudur**.
