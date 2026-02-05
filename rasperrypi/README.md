# Raspberry Pi Vision Service

Bu klasör Raspberry Pi üzerinde çalışacak **kamera + YOLO inference** servisidir.

## Amaç

Web tarafındaki **Vision Yönetimi** ve **Canlı İzleme** sayfaları aşağıdaki endpoint'lere bağlanır:

- `GET /frame.jpg` -> anlık kamera görüntüsü (JPEG)
- `GET /yolo/latest.json` -> son YOLO tespitleri (JSON)

Servis ayrıca istenirse KozaTakip API'ına vision mesajı gönderebilir.

## Çalıştırma

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Örnek
export KOZA_CAMERA_SOURCE=0
export KOZA_YOLO_MODEL=./models/best.pt
export KOZA_BIND_HOST=0.0.0.0
export KOZA_BIND_PORT=8080

python -m vision_service
```

## USB kamera (OpenCV index)

- `KOZA_CAMERA_SOURCE=0` -> genelde ilk USB kamera
- `KOZA_CAMERA_SOURCE=1` -> ikinci kamera (varsa)

Not: Bu servis `KOZA_CAMERA_SOURCE` değeri **tam sayı** ise OpenCV'yi "kamera index" modunda kullanır.

Tarayıcıdan test:

- `http://<pi-ip>:8080/frame.jpg`
- `http://<pi-ip>:8080/yolo/latest.json`

## Notlar

- CORS açıktır (`*`).
- `KOZA_CAMERA_SOURCE` olarak `0` (USB / default) veya `rtsp/http` URL verilebilir.
- `KOZA_YOLO_MODEL` ultralytics YOLO model dosyasıdır (`.pt`).
