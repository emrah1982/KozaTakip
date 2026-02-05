from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class BBox:
  x1: float
  y1: float
  x2: float
  y2: float


@dataclass(frozen=True)
class Detection:
  label: str
  confidence: float
  bbox: BBox
  extra: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class FramePacket:
  ts_ms: int
  width: int
  height: int
  jpeg_bytes: bytes


@dataclass(frozen=True)
class YoloResult:
  ts_ms: int
  source_frame_ts_ms: int
  detections: List[Detection]
  extra: Optional[Dict[str, Any]] = None


def clamp01(v: float) -> float:
  if v < 0.0:
    return 0.0
  if v > 1.0:
    return 1.0
  return v


def bbox_to_normalized(b: BBox, w: int, h: int) -> BBox:
  if w <= 0 or h <= 0:
    return b
  return BBox(
    x1=clamp01(b.x1 / w),
    y1=clamp01(b.y1 / h),
    x2=clamp01(b.x2 / w),
    y2=clamp01(b.y2 / h),
  )


def detection_to_dict(d: Detection, w: int, h: int) -> Dict[str, Any]:
  nb = bbox_to_normalized(d.bbox, w, h)
  return {
    "label": d.label,
    "class": d.label,
    "confidence": float(d.confidence),
    "conf": float(d.confidence),
    "x1": float(nb.x1),
    "y1": float(nb.y1),
    "x2": float(nb.x2),
    "y2": float(nb.y2),
    "bbox": [float(nb.x1), float(nb.y1), float(nb.x2), float(nb.y2)],
    **({"extra": d.extra} if isinstance(d.extra, dict) else {}),
  }


def yolo_result_to_jsonable(r: YoloResult, frame_w: int, frame_h: int) -> Dict[str, Any]:
  return {
    "ts_ms": int(r.ts_ms),
    "source_frame_ts_ms": int(r.source_frame_ts_ms),
    "frame": {"width": int(frame_w), "height": int(frame_h)},
    "detections": [detection_to_dict(d, frame_w, frame_h) for d in r.detections],
    **({"extra": r.extra} if isinstance(r.extra, dict) else {}),
  }
