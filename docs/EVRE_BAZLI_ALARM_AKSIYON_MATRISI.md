# 🐛 Evre Bazlı Alarm – Aksiyon Matrisi

Bu doküman, ipekböceği otomasyon sisteminde **evre bazlı alarm seviyelerini** ve **aksiyon kararlarını** tanımlar.

> Bu matris, **A) En düşük hastalık riski** hedefi esas alınarak hazırlanmıştır.

---

## 🧭 Alarm Seviyeleri (Standart Tanım)

| Seviye    | Anlam                               |
| --------- | ----------------------------------- |
| 🟢 NORMAL | Optimum aralık                      |
| 🟡 UYARI  | Optimumdan sapma (stres başlangıcı) |
| 🟠 RİSK   | Min/Max sınırına yaklaşma           |
| 🔴 KRİTİK | Min/Max ihlali / acil durum         |

---

## 🥚 YUMURTA (KULUÇKA)

| Parametre | Alarm | Koşul        | Aksiyon                 |
| --------- | ----- | ------------ | ----------------------- |
| Sıcaklık  | 🟡    | <25 veya >26 | Isıtıcı / fan ince ayar |
| Sıcaklık  | 🔴    | <24 veya >27 | Acil müdahale + alarm   |
| Nem       | 🟡    | <82 veya >88 | Nemlendirici ayarla     |
| Nem       | 🔴    | <80 veya >90 | Alarm + manuel kontrol  |
| CO₂       | 🟠    | >900         | Fan aç                  |
| CO₂       | 🔴    | >1000        | Fan + acil uyarı        |

---

## 🐛 ADAPTASYON FAZI (0–1. GÜN)

| Parametre | Alarm | Koşul            | Aksiyon                |
| --------- | ----- | ---------------- | ---------------------- |
| Sıcaklık  | 🟡    | <27.5 veya >28.5 | Isıtıcı/fan mikro ayar |
| Sıcaklık  | 🔴    | <27 veya >29     | Acil alarm             |
| Nem       | 🟡    | <88 veya >91     | Nemlendirici ayarı     |
| Nem       | 🔴    | <86 veya >92     | Alarm                  |
| CO₂       | 🟠    | >700             | Fan aç                 |
| CO₂       | 🔴    | >800             | Fan + kritik alarm     |

---

## 🐛 1. EVRE (INSTAR 1)

| Parametre | Alarm | Koşul            | Aksiyon             |
| --------- | ----- | ---------------- | ------------------- |
| Sıcaklık  | 🟡    | <26.5 veya >27.5 | Ayarlama            |
| Nem       | 🟡    | <86 veya >89     | Nem ayarı           |
| Nem       | 🔴    | >90              | Mantar riski alarmı |
| CO₂       | 🟠    | >800             | Fan                 |
| CO₂       | 🔴    | >900             | Fan + uyarı         |

---

## 🐛 2. EVRE (INSTAR 2)

| Parametre | Alarm | Koşul            | Aksiyon     |
| --------- | ----- | ---------------- | ----------- |
| Sıcaklık  | 🟡    | <25.5 veya >26.5 | Ayarlama    |
| Nem       | 🟡    | <81 veya >84     | Nem ayarı   |
| Nem       | 🔴    | >85              | Uyarı       |
| CO₂       | 🟠    | >900             | Fan         |
| CO₂       | 🔴    | >1000            | Fan + alarm |

---

## 🐛 3. EVRE (INSTAR 3)

| Parametre | Alarm | Koşul            | Aksiyon      |
| --------- | ----- | ---------------- | ------------ |
| Sıcaklık  | 🟡    | <24.5 veya >25.5 | Ayarlama     |
| Nem       | 🟡    | <76 veya >79     | Nem ayarı    |
| Nem       | 🔴    | >80              | Mantar riski |
| CO₂       | 🟠    | >1000            | Fan          |
| CO₂       | 🔴    | >1100            | Fan + uyarı  |

---

## 🐛 4. EVRE (INSTAR 4)

| Parametre | Alarm | Koşul       | Aksiyon             |
| --------- | ----- | ----------- | ------------------- |
| Nem       | 🟡    | >74         | Nem düşür           |
| Nem       | 🔴    | >75         | Mantar alarmı       |
| CO₂       | 🟠    | >1100       | Fan                 |
| CO₂       | 🔴    | >1200       | Fan + alarm         |
| CO₂ + Nem | 🔴    | >1200 & >75 | Flacherie riski     |

---

## 🐛 5. EVRE (INSTAR 5)

| Parametre   | Alarm | Koşul         | Aksiyon           |
| ----------- | ----- | ------------- | ----------------- |
| Nem         | 🟡    | >69           | Nem düşür         |
| Nem         | 🔴    | >70           | Muscardine alarmı |
| CO₂         | 🟠    | >1100         | Fan               |
| CO₂         | 🔴    | >1200         | Fan + alarm       |
| Ani Değişim | 🔴    | ±2°C / 1 saat | Stres alarmı      |

---

## 🕸️ KOZA EVRESİ

| Parametre | Alarm | Koşul        | Aksiyon            |
| --------- | ----- | ------------ | ------------------ |
| Nem       | 🟡    | <63 veya >68 | Düzeltme           |
| Nem       | 🔴    | >70          | Koza kalite alarmı |
| CO₂       | 🟠    | >900         | Fan                |
| CO₂       | 🔴    | >1000        | Fan + uyarı        |

---

## 🤖 Orchestrator Agent Karar Kuralı

```text
IF (iki farklı parametre 🟠) OR (bir parametre 🔴):
    → İnsan bilgilendir
IF (CO₂ 🔴) AND (Nem 🔴):
    → Acil alarm + manuel müdahale
```

---

## 🔑 Altın Kurallar

1. Optimumdan sapma = veri
2. Min/Max ihlali = alarm
3. Hızlı değişim = hastalık sinyali
4. CO₂ + yüksek nem = en tehlikeli kombinasyon
5. Evre ilerledikçe tolerans azalır
