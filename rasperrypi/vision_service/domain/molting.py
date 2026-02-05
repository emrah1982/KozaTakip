from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple


@dataclass
class MoltingThresholds:
  normal_mi: Tuple[float, float]
  molting_mi: Tuple[float, float]
  drop_ratio_min: float
  min_hours: float
  max_hours: float


MOLTING_THRESHOLDS: Dict[str, MoltingThresholds] = {
  "larva_1": MoltingThresholds(normal_mi=(0.30, 0.50), molting_mi=(0.05, 0.15), drop_ratio_min=0.60, min_hours=8, max_hours=18),
  "larva_2": MoltingThresholds(normal_mi=(0.25, 0.40), molting_mi=(0.05, 0.12), drop_ratio_min=0.60, min_hours=12, max_hours=24),
  "larva_3": MoltingThresholds(normal_mi=(0.20, 0.35), molting_mi=(0.04, 0.10), drop_ratio_min=0.65, min_hours=16, max_hours=30),
  "larva_4": MoltingThresholds(normal_mi=(0.15, 0.30), molting_mi=(0.03, 0.08), drop_ratio_min=0.70, min_hours=20, max_hours=36),
  "larva_5": MoltingThresholds(normal_mi=(0.10, 0.25), molting_mi=(0.02, 0.06), drop_ratio_min=0.70, min_hours=24, max_hours=48),
}


def _clamp01(v: float) -> float:
  if v < 0.0:
    return 0.0
  if v > 1.0:
    return 1.0
  return v


def _hours_to_sec(h: float) -> int:
  return int(max(0, round(float(h) * 3600)))


def _ms_to_iso(ms: Optional[int]) -> Optional[str]:
  if ms is None:
    return None
  try:
    dt = datetime.fromtimestamp(int(ms) / 1000.0, tz=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")
  except Exception:
    return None


class MoltingStateMachine:
  def __init__(self) -> None:
    self._state = "NORMAL"
    self._since_ts_ms: Optional[int] = None
    self._stage_key: str = ""
    self._baseline_mi: Optional[float] = None

  def state(self) -> str:
    return self._state

  def since_ts_ms(self) -> Optional[int]:
    return self._since_ts_ms

  def stage_key(self) -> str:
    return self._stage_key

  def baseline_mi(self) -> Optional[float]:
    return self._baseline_mi

  def reset(self) -> None:
    self._state = "NORMAL"
    self._since_ts_ms = None
    self._stage_key = ""
    self._baseline_mi = None

  def update(self, ts_ms: int, stage_key: str, movement_index: Optional[float]) -> Dict[str, Any]:
    if movement_index is None:
      return self.snapshot(ts_ms=ts_ms)

    sk = (stage_key or "").strip().lower()
    if sk != self._stage_key:
      self._stage_key = sk
      self._state = "NORMAL"
      self._since_ts_ms = None
      self._baseline_mi = None

    th = MOLTING_THRESHOLDS.get(sk)
    if th is None:
      self._state = "NORMAL"
      self._since_ts_ms = None
      self._baseline_mi = None
      return self.snapshot(ts_ms=ts_ms)

    mi = float(_clamp01(movement_index))

    if self._baseline_mi is None:
      self._baseline_mi = mi
    else:
      alpha = 0.06
      self._baseline_mi = float(self._baseline_mi * (1 - alpha) + mi * alpha)

    base = float(max(1e-6, self._baseline_mi))
    drop_ratio = float(max(0.0, min(1.0, 1.0 - (mi / base))))

    molting_low, molting_high = th.molting_mi
    is_molting_range = mi >= molting_low and mi <= molting_high
    is_drop_ok = drop_ratio >= float(th.drop_ratio_min)

    def _dur_sec() -> int:
      if self._since_ts_ms is None:
        return 0
      return int(max(0, (int(ts_ms) - int(self._since_ts_ms)) // 1000))

    def _set_state(s: str) -> None:
      if self._state == s:
        return
      self._state = s
      self._since_ts_ms = int(ts_ms)

    if self._state == "NORMAL":
      if is_molting_range and is_drop_ok:
        _set_state("PRE_MOLTING")

    elif self._state == "PRE_MOLTING":
      if not (is_molting_range and is_drop_ok):
        _set_state("NORMAL")
      else:
        if _dur_sec() >= _hours_to_sec(th.min_hours):
          _set_state("MOLTING")

    elif self._state == "MOLTING":
      if mi > (molting_high * 2.0):
        _set_state("POST_MOLTING")

    elif self._state == "POST_MOLTING":
      if _dur_sec() >= 2 * 3600:
        _set_state("NORMAL")

    return self.snapshot(ts_ms=ts_ms, movement_index=mi, drop_ratio=drop_ratio)

  def snapshot(
    self,
    ts_ms: int,
    movement_index: Optional[float] = None,
    drop_ratio: Optional[float] = None,
  ) -> Dict[str, Any]:
    th = MOLTING_THRESHOLDS.get(self._stage_key)

    duration_sec = 0
    if self._since_ts_ms is not None:
      duration_sec = int(max(0, (int(ts_ms) - int(self._since_ts_ms)) // 1000))

    exceeded_max = False
    if th is not None and self._state in ("PRE_MOLTING", "MOLTING"):
      exceeded_max = duration_sec > _hours_to_sec(th.max_hours)

    payload: Dict[str, Any] = {
      "state": self._state,
      "since_ts_ms": self._since_ts_ms,
      "since_iso": _ms_to_iso(self._since_ts_ms),
      "updated_ts_ms": int(ts_ms),
      "updated_iso": _ms_to_iso(int(ts_ms)),
      "duration_sec": int(duration_sec),
      "stage": self._stage_key or None,
      "baseline_mi": float(self._baseline_mi) if isinstance(self._baseline_mi, float) else None,
      "movement_index": float(movement_index) if isinstance(movement_index, float) else None,
      "drop_ratio": float(drop_ratio) if isinstance(drop_ratio, float) else None,
      "max_duration_exceeded": bool(exceeded_max),
    }

    if th is not None:
      payload["thresholds"] = {
        "normal_mi": [float(th.normal_mi[0]), float(th.normal_mi[1])],
        "molting_mi": [float(th.molting_mi[0]), float(th.molting_mi[1])],
        "drop_ratio_min": float(th.drop_ratio_min),
        "min_hours": float(th.min_hours),
        "max_hours": float(th.max_hours),
      }

    return payload
