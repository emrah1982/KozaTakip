from __future__ import annotations

from typing import Any, Dict, Optional

import cv2
import numpy as np

from vision_service import config


def _clip_bbox(w_img: int, h_img: int, x1: float, y1: float, x2: float, y2: float) -> tuple[int, int, int, int] | None:
  xa = int(max(0, min(w_img - 1, round(min(x1, x2)))))
  xb = int(max(0, min(w_img - 1, round(max(x1, x2)))))
  ya = int(max(0, min(h_img - 1, round(min(y1, y2)))))
  yb = int(max(0, min(h_img - 1, round(max(y1, y2)))))
  if xb <= xa or yb <= ya:
    return None
  return xa, ya, xb, yb


def _parse_lab_target(raw: str) -> Optional[tuple[float, float, float]]:
  s = (raw or "").strip()
  if not s:
    return None
  parts = [p.strip() for p in s.split(",")]
  if len(parts) != 3:
    return None
  try:
    return float(parts[0]), float(parts[1]), float(parts[2])
  except Exception:
    return None


def _delta_e76(lab1: tuple[float, float, float], lab2: tuple[float, float, float]) -> float:
  dl = lab1[0] - lab2[0]
  da = lab1[1] - lab2[1]
  db = lab1[2] - lab2[2]
  return float((dl * dl + da * da + db * db) ** 0.5)


class OpenCvMetricExtractor:
  def __init__(self) -> None:
    self._lab_target = _parse_lab_target(getattr(config, "COLOR_LAB_TARGET", ""))

  def extract(self, img_bgr: np.ndarray, label: str, x1: float, y1: float, x2: float, y2: float) -> Optional[Dict[str, Any]]:
    if img_bgr is None or img_bgr.size == 0:
      return None

    h_img, w_img = img_bgr.shape[:2]
    clipped = _clip_bbox(w_img, h_img, x1, y1, x2, y2)
    if clipped is None:
      return None

    xa, ya, xb, yb = clipped
    w_px = int(max(0, xb - xa))
    h_px = int(max(0, yb - ya))
    area_px = int(max(0, w_px * h_px))
    frame_area = float(max(1, w_img * h_img))
    area_ratio = float(area_px / frame_area)

    roi = img_bgr[ya:yb, xa:xb]
    if roi.size == 0:
      return None

    mean_bgr = cv2.mean(roi)[:3]
    b, g, r = [float(v) for v in mean_bgr]

    hsv = cv2.cvtColor(np.uint8([[list(mean_bgr)]]), cv2.COLOR_BGR2HSV)[0, 0]
    h_val, s_val, v_val = [int(x) for x in hsv.tolist()]

    lab_px = cv2.cvtColor(np.uint8([[list(mean_bgr)]]), cv2.COLOR_BGR2LAB)[0, 0]
    l_val, a_val, b_val = [float(x) for x in lab_px.tolist()]

    delta_e = None
    if self._lab_target is not None:
      delta_e = _delta_e76((l_val, a_val, b_val), self._lab_target)

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    mean_gray = float(np.mean(gray)) if gray.size else 0.0
    std_gray = float(np.std(gray)) if gray.size else 0.0
    homogeneity = None
    if mean_gray > 1e-6:
      homogeneity = float(std_gray / mean_gray)

    size_mm = None
    mm_per_px = float(getattr(config, "MM_PER_PIXEL", 0.0) or 0.0)
    if mm_per_px > 0:
      size_mm = {
        "width_mm": float(w_px * mm_per_px),
        "height_mm": float(h_px * mm_per_px),
        "area_mm2": float(area_px * (mm_per_px**2)),
      }

    extra: Dict[str, Any] = {
      "size": {
        "width_px": w_px,
        "height_px": h_px,
        "area_px": area_px,
        "area_ratio": area_ratio,
        **(size_mm if isinstance(size_mm, dict) else {}),
      },
      "color": {
        "mean_rgb": {"r": r, "g": g, "b": b},
        "mean_hsv": {"h": h_val, "s": s_val, "v": v_val},
        "mean_lab": {"l": l_val, "a": a_val, "b": b_val},
        **({"delta_e76": float(delta_e)} if delta_e is not None else {}),
      },
      "homogeneity": {
        "gray_std": float(std_gray),
        "gray_mean": float(mean_gray),
        **({"std_over_mean": float(homogeneity)} if homogeneity is not None else {}),
      },
    }

    return extra
