from __future__ import annotations

import threading
import time
from collections import deque
from typing import Optional

import cv2
import numpy as np

from vision_service import config
from vision_service.application.ports import MetricExtractor
from vision_service.domain.molting import MoltingStateMachine
from vision_service.domain.models import BBox, Detection, FramePacket, YoloResult

try:
  from ultralytics import YOLO  # type: ignore
except Exception:  # pragma: no cover
  YOLO = None  # type: ignore


class UltralyticsYoloEngine:
  def __init__(self, frame_source, metric_extractor: MetricExtractor | None = None) -> None:
    self._frame_source = frame_source
    self._metric_extractor = metric_extractor
    self._lock = threading.Lock()
    self._latest: Optional[YoloResult] = None
    self._stop = threading.Event()
    self._thread: Optional[threading.Thread] = None

    self._model = None
    if config.YOLO_MODEL_PATH and YOLO is not None:
      self._model = YOLO(config.YOLO_MODEL_PATH)

    self._frame_counter = 0

    self._diseased_window = deque(maxlen=max(1, int(getattr(config, "DISEASED_WINDOW_N", 10) or 10)))
    self._prev_gray: np.ndarray | None = None
    self._molting = MoltingStateMachine()

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

      try:
        img = cv2.imdecode(np.frombuffer(pkt.jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
          time.sleep(0.1)
          continue

        h_img, w_img = img.shape[:2]
        frame_area_px = float(max(1, w_img * h_img))
        now_ts_ms = int(time.time() * 1000)

        def _normalize_stage_key(stage_raw: str) -> str:
          s = (stage_raw or "").strip().lower()
          if not s:
            return ""
          s = s.replace("-", "_")
          if s in ("adaptasyon", "adaptation", "adaptation_0_1", "adaptasyon_0_1", "day0", "day_0", "day1", "day_1"):
            return "adaptasyon"
          if s in ("koza", "cocoon", "cocoon_stage"):
            return "koza"
          if s in ("koza_oncesi", "kozaoncesi", "pre_koza", "prekoza", "pre_cocoon"):
            return "koza_oncesi"
          if s.startswith("larva"):
            return s
          if s.startswith("instar"):
            parts = s.replace("instar", "").strip("_")
            if parts.isdigit():
              return f"larva_{parts}"
            if parts.startswith("_") and parts[1:].isdigit():
              return f"larva_{parts[1:]}"
          return s

        MOVEMENT_THRESHOLDS = {
          "adaptasyon": {"risk_low": 0.15, "stress_high": 0.50, "ideal": (0.25, 0.40), "normal": (0.20, 0.45)},
          "larva_1": {"risk_low": 0.20, "stress_high": 0.60, "ideal": (0.30, 0.50), "normal": (0.25, 0.55)},
          "larva_2": {"risk_low": 0.15, "stress_high": 0.50, "ideal": (0.25, 0.40), "normal": (0.20, 0.45)},
          "larva_3": {"risk_low": 0.10, "stress_high": 0.45, "ideal": (0.20, 0.35), "normal": (0.15, 0.40)},
          "larva_4": {"risk_low": 0.08, "stress_high": 0.40, "ideal": (0.15, 0.30), "normal": (0.10, 0.35)},
          "larva_5": {"risk_low": 0.05, "stress_high": 0.35, "ideal": (0.10, 0.25), "normal": (0.08, 0.30)},
          "koza_oncesi": {"risk_low": 0.02, "stress_high": 0.25, "ideal": (0.05, 0.15), "normal": (0.03, 0.20)},
          "koza": {"risk_low": None, "stress_high": None, "ideal": (0.00, 0.00), "normal": (0.00, 0.02)},
        }

        motion_score = None
        movement_index = None
        try:
          gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
          if self._prev_gray is not None and self._prev_gray.shape == gray.shape:
            diff = cv2.absdiff(gray, self._prev_gray)
            mean_diff = float(np.mean(diff)) if diff.size else 0.0
            movement_index = max(0.0, min(1.0, (mean_diff / 255.0)))
            motion_score = movement_index * 100.0
          self._prev_gray = gray
        except Exception:
          motion_score = None
          movement_index = None

        active_stage_key = _normalize_stage_key(getattr(config, "ACTIVE_STAGE", ""))
        stage_thresholds = MOVEMENT_THRESHOLDS.get(active_stage_key)

        movement_level = None
        if movement_index is not None and stage_thresholds is not None:
          risk_low = stage_thresholds.get("risk_low")
          stress_high = stage_thresholds.get("stress_high")
          if isinstance(risk_low, (int, float)) and movement_index < float(risk_low):
            movement_level = "low_risk"
          elif isinstance(stress_high, (int, float)) and movement_index > float(stress_high):
            movement_level = "high_stress"
          else:
            movement_level = "normal"

        molting = self._molting.update(
          ts_ms=now_ts_ms,
          stage_key=active_stage_key,
          movement_index=movement_index,
        )

        if not self._model:
          y_extra = {
            "stage_hint": {
              "cocoon_count": 0,
              "larva_count": 0,
              "has_cocoon": False,
              "has_larva": False,
              "stage": "none",
            },
            "larva_metrics": {
              "larva_density_area_ratio": 0.0,
              "larva_bbox_area_px_sum": 0.0,
              **({"movement_index": float(movement_index)} if movement_index is not None else {}),
              **({"motion_score": float(motion_score)} if motion_score is not None else {}),
              **({"movement_level": movement_level} if movement_level is not None else {}),
              **({"movement_stage": active_stage_key} if isinstance(active_stage_key, str) and active_stage_key else {}),
              **(
                {
                  "movement_thresholds": {
                    "ideal": list(stage_thresholds.get("ideal")) if stage_thresholds and isinstance(stage_thresholds.get("ideal"), tuple) else None,
                    "normal": list(stage_thresholds.get("normal")) if stage_thresholds and isinstance(stage_thresholds.get("normal"), tuple) else None,
                    "risk_low": stage_thresholds.get("risk_low") if stage_thresholds else None,
                    "stress_high": stage_thresholds.get("stress_high") if stage_thresholds else None,
                  }
                }
                if stage_thresholds is not None
                else {}
              ),
            },
            "molting": molting,
            "model_loaded": False,
          }
          y = YoloResult(ts_ms=now_ts_ms, source_frame_ts_ms=pkt.ts_ms, detections=[], extra=y_extra)
          with self._lock:
            self._latest = y
          time.sleep(0.15)
          continue

        diseased_conf_threshold = float(getattr(config, "DISEASED_CONF_THRESHOLD", 0.6) or 0.6)
        diseased_min_hits = int(getattr(config, "DISEASED_MIN_HITS", 3) or 3)

        def _is_cocoon_label(label: str) -> bool:
          l = (label or "").strip().lower()
          return l in ("cocoon", "cocoons", "koza", "koza_cocoon") or "cocoon" in l or "koza" in l

        def _is_larva_label(label: str) -> bool:
          l = (label or "").strip().lower()
          return l in ("larva", "larvae", "kurt", "bocek", "böcek") or "larva" in l

        def _is_diseased_label(label: str) -> bool:
          l = (label or "").strip().lower()
          return l in ("diseased", "disease", "hasta", "hastalik") or "diseas" in l or "hasta" in l

        res = self._model.predict(
          source=img,
          conf=float(config.YOLO_CONF),
          iou=float(config.YOLO_IOU),
          verbose=False,
        )

        dets: list[Detection] = []
        diseased_hit = False
        cocoon_count = 0
        larva_count = 0
        larva_area_px_sum = 0.0
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

                if _is_diseased_label(label) and c >= diseased_conf_threshold:
                  diseased_hit = True

                if _is_cocoon_label(label):
                  cocoon_count += 1
                if _is_larva_label(label):
                  larva_count += 1
                  w_px = max(0.0, float(max(x1, x2) - min(x1, x2)))
                  h_px = max(0.0, float(max(y1, y2) - min(y1, y2)))
                  larva_area_px_sum += w_px * h_px

                extra = None
                if _is_cocoon_label(label) and self._metric_extractor is not None:
                  extra = self._metric_extractor.extract(img, label, x1, y1, x2, y2)

                dets.append(Detection(label=label, confidence=c, bbox=BBox(x1=x1, y1=y1, x2=x2, y2=y2), extra=extra))

        self._diseased_window.append(bool(diseased_hit))
        hits = int(sum(1 for x in self._diseased_window if x))
        window_n = int(len(self._diseased_window))
        confirmed = bool(window_n > 0 and hits >= diseased_min_hits)

        larva_density_ratio = float(larva_area_px_sum / frame_area_px)
        stage = "cocoon" if cocoon_count > 0 else "larva" if larva_count > 0 else "none"

        y_extra = {
          "stage_hint": {
            "cocoon_count": int(cocoon_count),
            "larva_count": int(larva_count),
            "has_cocoon": bool(cocoon_count > 0),
            "has_larva": bool(larva_count > 0),
            "stage": stage,
          },
          "larva_metrics": {
            "larva_density_area_ratio": float(larva_density_ratio),
            "larva_bbox_area_px_sum": float(larva_area_px_sum),
            **({"movement_index": float(movement_index)} if movement_index is not None else {}),
            **({"motion_score": float(motion_score)} if motion_score is not None else {}),
            **({"movement_level": movement_level} if movement_level is not None else {}),
            **({"movement_stage": active_stage_key} if isinstance(active_stage_key, str) and active_stage_key else {}),
            **(
              {
                "movement_thresholds": {
                  "ideal": list(stage_thresholds.get("ideal")) if stage_thresholds and isinstance(stage_thresholds.get("ideal"), tuple) else None,
                  "normal": list(stage_thresholds.get("normal")) if stage_thresholds and isinstance(stage_thresholds.get("normal"), tuple) else None,
                  "risk_low": stage_thresholds.get("risk_low") if stage_thresholds else None,
                  "stress_high": stage_thresholds.get("stress_high") if stage_thresholds else None,
                }
              }
              if stage_thresholds is not None
              else {}
            ),
          },
          "molting": molting,
          "diseased_confirmation": {
            "window_n": int(window_n),
            "min_hits": int(diseased_min_hits),
            "hits": int(hits),
            "threshold_conf": float(diseased_conf_threshold),
            "confirmed": bool(confirmed),
          }
        }

        y = YoloResult(ts_ms=now_ts_ms, source_frame_ts_ms=pkt.ts_ms, detections=dets, extra=y_extra)
        with self._lock:
          self._latest = y
      except Exception:
        time.sleep(0.2)
        continue

      time.sleep(0.05)
