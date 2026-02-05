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

## Önerilen Yol Haritası (Pratik)

1. Boyutu px değil mm yap (kalibrasyon/marker)
2. Renk için ışık + WB sabitle, mümkünse Lab/ΔE
3. Hastalıklı kararını çoklu-kare doğrulama ile güvenli hale getir
4. Ağırlıkları gerçek etiketli veriyle optimize et
