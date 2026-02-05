from __future__ import annotations

from typing import Protocol

from vision_service.domain.models import FramePacket, YoloResult


class FrameSource(Protocol):
  def latest(self) -> FramePacket | None: ...


class YoloEngine(Protocol):
  def latest(self) -> YoloResult | None: ...


class ResultPusher(Protocol):
  def maybe_push(self, yolo: YoloResult) -> None: ...
