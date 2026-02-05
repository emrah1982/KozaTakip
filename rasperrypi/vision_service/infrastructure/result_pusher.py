from __future__ import annotations

import threading
import time
from typing import Optional

import requests

from vision_service import config
from vision_service.domain.models import Detection, YoloResult


def _compute_movement_index(dets: list[Detection]) -> float:
  return min(1.0, max(0.0, len(dets) / 10.0))


def _compute_texture_anomaly(dets: list[Detection]) -> bool:
  for d in dets:
    if "anom" in d.label.lower() or "mold" in d.label.lower() or "fung" in d.label.lower():
      return True
  return False


def _compute_confidence(dets: list[Detection]) -> float:
  if not dets:
    return 0.0
  return float(max(d.confidence for d in dets))


class KozaApiResultPusher:
  def __init__(self, yolo_engine) -> None:
    self._engine = yolo_engine
    self._stop = threading.Event()
    self._thread: Optional[threading.Thread] = None

  def start(self) -> None:
    if not config.KOZA_PUSH_ENABLED:
      return
    if not config.KOZA_API_BASE:
      return
    if self._thread and self._thread.is_alive():
      return
    self._stop.clear()
    self._thread = threading.Thread(target=self._run, daemon=True)
    self._thread.start()

  def stop(self) -> None:
    self._stop.set()

  def maybe_push(self, yolo: YoloResult) -> None:
    self._push(yolo)

  def _run(self) -> None:
    interval = max(2, int(config.KOZA_PUSH_EVERY_SEC))
    last_ts = 0

    while not self._stop.is_set():
      y = self._engine.latest()
      if y and y.ts_ms != last_ts:
        last_ts = y.ts_ms
        self._push(y)
      time.sleep(interval)

  def _push(self, yolo: YoloResult) -> None:
    base = config.KOZA_API_BASE.rstrip("/")
    url = f"{base}/api/vision/messages"

    dets = list(yolo.detections)
    payload = {
      "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
      "movement_index": _compute_movement_index(dets),
      "size_change_ratio": 1.0,
      "texture_anomaly": _compute_texture_anomaly(dets),
      "confidence": _compute_confidence(dets),
    }

    try:
      requests.post(url, json=payload, timeout=4)
    except Exception:
      return
