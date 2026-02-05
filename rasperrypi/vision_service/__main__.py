from __future__ import annotations

import uvicorn

from vision_service import config
from vision_service.infrastructure.camera_source import OpenCvCameraSource
from vision_service.infrastructure.result_pusher import KozaApiResultPusher
from vision_service.infrastructure.yolo_engine import UltralyticsYoloEngine
from vision_service.presentation.http_api import create_app


def main() -> None:
  camera = OpenCvCameraSource()
  camera.start()

  yolo = UltralyticsYoloEngine(camera)
  yolo.start()

  pusher = KozaApiResultPusher(yolo)
  pusher.start()

  app = create_app(camera, yolo)
  uvicorn.run(app, host=config.BIND_HOST, port=config.BIND_PORT)


if __name__ == "__main__":
  main()
