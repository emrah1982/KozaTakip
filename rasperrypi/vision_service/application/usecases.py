from __future__ import annotations

from typing import Any, Dict

from vision_service.application.ports import FrameSource, ResultPusher, YoloEngine
from vision_service.domain.models import yolo_result_to_jsonable


def get_latest_frame_jpeg(source: FrameSource) -> bytes | None:
  pkt = source.latest()
  return pkt.jpeg_bytes if pkt else None


def get_latest_yolo_json(engine: YoloEngine, frame_source: FrameSource) -> Dict[str, Any] | None:
  y = engine.latest()
  f = frame_source.latest()
  if not y or not f:
    return None
  return yolo_result_to_jsonable(y, f.width, f.height)


def push_if_enabled(pusher: ResultPusher, engine: YoloEngine) -> None:
  y = engine.latest()
  if y:
    pusher.maybe_push(y)
