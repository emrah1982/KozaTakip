from __future__ import annotations

import threading
import time
from typing import Optional

import cv2
import numpy as np

from vision_service import config
from vision_service.domain.models import BBox, Detection, FramePacket, YoloResult

try:
  from ultralytics import YOLO  # type: ignore
except Exception:  # pragma: no cover
  YOLO = None  # type: ignore


class UltralyticsYoloEngine:
  def __init__(self, frame_source) -> None:
    self._frame_source = frame_source
    self._lock = threading.Lock()
    self._latest: Optional[YoloResult] = None
    self._stop = threading.Event()
    self._thread: Optional[threading.Thread] = None

    self._model = None
    if config.YOLO_MODEL_PATH and YOLO is not None:
      self._model = YOLO(config.YOLO_MODEL_PATH)

    self._frame_counter = 0

  def start(self) -> None:
    if self._thread and self._thread.is_alive():
      return
    self._stop.clear()
    self._thread = threading.Thread(target=self._run, daemon=True)
    self._thread.start()

  def stop(self) -> None:
    self._stop.set()

  def latest(self) -> YoloResult | None:
    with self._lock:
      return self._latest

  def _run(self) -> None:
    while not self._stop.is_set():
      pkt: FramePacket | None = self._frame_source.latest()
      if not pkt:
        time.sleep(0.1)
        continue

      self._frame_counter += 1
      every = max(1, int(config.YOLO_INFER_EVERY_N_FRAMES))
      if (self._frame_counter % every) != 0:
        time.sleep(0.02)
        continue

      if not self._model:
        with self._lock:
          self._latest = YoloResult(ts_ms=int(time.time() * 1000), source_frame_ts_ms=pkt.ts_ms, detections=[])
        time.sleep(0.15)
        continue

      try:
        img = cv2.imdecode(np.frombuffer(pkt.jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
          time.sleep(0.1)
          continue

        h_img, w_img = img.shape[:2]

        def _is_cocoon_label(label: str) -> bool:
          l = (label or "").strip().lower()
          return l in ("cocoon", "cocoons", "koza", "koza_cocoon") or "cocoon" in l or "koza" in l

        def _clip_bbox(x1: float, y1: float, x2: float, y2: float) -> tuple[int, int, int, int] | None:
          xa = int(max(0, min(w_img - 1, round(min(x1, x2)))))
          xb = int(max(0, min(w_img - 1, round(max(x1, x2)))))
          ya = int(max(0, min(h_img - 1, round(min(y1, y2)))))
          yb = int(max(0, min(h_img - 1, round(max(y1, y2)))))
          if xb <= xa or yb <= ya:
            return None
          return xa, ya, xb, yb

        res = self._model.predict(
          source=img,
          conf=float(config.YOLO_CONF),
          iou=float(config.YOLO_IOU),
          verbose=False,
        )

        dets: list[Detection] = []
        if res and len(res) > 0:
          r0 = res[0]
          names = getattr(r0, "names", None)
          boxes = getattr(r0, "boxes", None)
          if boxes is not None:
            xyxy = getattr(boxes, "xyxy", None)
            conf = getattr(boxes, "conf", None)
            cls = getattr(boxes, "cls", None)
            if xyxy is not None and conf is not None and cls is not None:
              xyxy_list = xyxy.cpu().numpy().tolist()
              conf_list = conf.cpu().numpy().tolist()
              cls_list = cls.cpu().numpy().tolist()

              for i in range(min(len(xyxy_list), len(conf_list), len(cls_list))):
                x1, y1, x2, y2 = [float(v) for v in xyxy_list[i]]
                c = float(conf_list[i])
                ci = int(cls_list[i])
                label = str(ci)
                if isinstance(names, dict) and ci in names:
                  label = str(names[ci])

                extra = None
                if _is_cocoon_label(label):
                  clipped = _clip_bbox(x1, y1, x2, y2)
                  if clipped is not None:
                    xa, ya, xb, yb = clipped
                    w_px = int(max(0, xb - xa))
                    h_px = int(max(0, yb - ya))
                    area_px = int(max(0, w_px * h_px))
                    frame_area = float(max(1, w_img * h_img))
                    area_ratio = float(area_px / frame_area)

                    roi = img[ya:yb, xa:xb]
                    if roi.size > 0:
                      mean_bgr = cv2.mean(roi)[:3]
                      b, g, r = [float(v) for v in mean_bgr]
                      rgb = {"r": r, "g": g, "b": b}
                      hsv = cv2.cvtColor(np.uint8([[list(mean_bgr)]]), cv2.COLOR_BGR2HSV)[0, 0]
                      h_val, s_val, v_val = [int(x) for x in hsv.tolist()]

                      extra = {
                        "size": {
                          "width_px": w_px,
                          "height_px": h_px,
                          "area_px": area_px,
                          "area_ratio": area_ratio,
                        },
                        "color": {
                          "mean_rgb": rgb,
                          "mean_hsv": {"h": h_val, "s": s_val, "v": v_val},
                        },
                      }

                dets.append(Detection(label=label, confidence=c, bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2), extra=extra))

        y = YoloResult(ts_ms=int(time.time() * 1000), source_frame_ts_ms=pkt.ts_ms, detections=dets)
        with self._lock:
          self._latest = y
      except Exception:
        time.sleep(0.2)
        continue

      time.sleep(0.05)
