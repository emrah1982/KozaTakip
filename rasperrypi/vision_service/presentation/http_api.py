from __future__ import annotations

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from vision_service import config
from vision_service.application.usecases import get_latest_frame_jpeg, get_latest_yolo_json


def create_app(frame_source, yolo_engine) -> FastAPI:
  app = FastAPI(title="KozaTakip RaspberryPi Vision Service")

  allow = [o.strip() for o in config.CORS_ALLOW_ORIGINS.split(",") if o.strip()]
  app.add_middleware(
    CORSMiddleware,
    allow_origins=allow if allow else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
  )

  @app.get("/health")
  def health():
    return {"ok": True}

  @app.get("/frame.jpg")
  def frame_jpeg():
    b = get_latest_frame_jpeg(frame_source)
    if not b:
      return Response(status_code=404)
    return Response(content=b, media_type="image/jpeg", headers={"cache-control": "no-store"})

  @app.get("/yolo/latest.json")
  def yolo_latest():
    y = get_latest_yolo_json(yolo_engine, frame_source)
    if not y:
      return Response(status_code=404)
    return y

  return app
