import os


def env_str(name: str, default: str) -> str:
  v = os.getenv(name)
  return v if isinstance(v, str) and v.strip() else default


def env_int(name: str, default: int) -> int:
  try:
    return int(os.getenv(name, str(default)))
  except Exception:
    return default


def env_float(name: str, default: float) -> float:
  try:
    return float(os.getenv(name, str(default)))
  except Exception:
    return default


BIND_HOST = env_str("KOZA_BIND_HOST", "0.0.0.0")
BIND_PORT = env_int("KOZA_BIND_PORT", 8080)

CAMERA_SOURCE = env_str("KOZA_CAMERA_SOURCE", "0")
CAMERA_FPS = env_float("KOZA_CAMERA_FPS", 8.0)
CAMERA_WIDTH = env_int("KOZA_CAMERA_WIDTH", 1280)
CAMERA_HEIGHT = env_int("KOZA_CAMERA_HEIGHT", 720)

YOLO_MODEL_PATH = env_str("KOZA_YOLO_MODEL", "")
YOLO_CONF = env_float("KOZA_YOLO_CONF", 0.25)
YOLO_IOU = env_float("KOZA_YOLO_IOU", 0.45)
YOLO_INFER_EVERY_N_FRAMES = env_int("KOZA_YOLO_EVERY_N_FRAMES", 3)

# Push latest to KozaTakip API (optional)
KOZA_API_BASE = env_str("KOZA_API_BASE", "")  # e.g. http://<server>:3000
KOZA_PUSH_ENABLED = env_str("KOZA_PUSH_ENABLED", "0") in ("1", "true", "TRUE", "yes", "YES")
KOZA_PUSH_EVERY_SEC = env_int("KOZA_PUSH_EVERY_SEC", 5)

# Allow browser to request directly from Pi
CORS_ALLOW_ORIGINS = env_str("KOZA_CORS_ALLOW_ORIGINS", "*")
