from __future__ import annotations

import threading
import time
from typing import Optional, Union

import cv2

from vision_service import config
from vision_service.domain.models import FramePacket


def _parse_source(src: str) -> Union[int, str]:
  s = src.strip()
  if s.isdigit():
    return int(s)
  return s


class OpenCvCameraSource:
  def __init__(self) -> None:
    self._lock = threading.Lock()
    self._latest: Optional[FramePacket] = None
    self._stop = threading.Event()
    self._thread: Optional[threading.Thread] = None

  def start(self) -> None:
    if self._thread and self._thread.is_alive():
      return
    self._stop.clear()
    self._thread = threading.Thread(target=self._run, daemon=True)
    self._thread.start()

  def stop(self) -> None:
    self._stop.set()

  def latest(self) -> FramePacket | None:
    with self._lock:
      return self._latest

  def _run(self) -> None:
    src = _parse_source(config.CAMERA_SOURCE)
    cap = cv2.VideoCapture(src)

    try:
      if config.CAMERA_WIDTH > 0:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
      if config.CAMERA_HEIGHT > 0:
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)

      fps = max(0.5, float(config.CAMERA_FPS))
      interval = 1.0 / fps

      while not self._stop.is_set():
        ok, frame = cap.read()
        if not ok or frame is None:
          time.sleep(0.25)
          continue

        h, w = frame.shape[:2]
        ok2, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ok2:
          time.sleep(interval)
          continue

        pkt = FramePacket(ts_ms=int(time.time() * 1000), width=int(w), height=int(h), jpeg_bytes=bytes(buf))
        with self._lock:
          self._latest = pkt

        time.sleep(interval)
    finally:
      try:
        cap.release()
      except Exception:
        pass
