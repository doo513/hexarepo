import os


def _load_env_file() -> None:
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
    if not os.path.isfile(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_env_file()

# Base paths
CORE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CORE_DIR)
ROOT_DIR = os.path.dirname(BASE_DIR)

# Data / static paths
DATA_DIR = os.path.join(ROOT_DIR, "data")
STATIC_DIR = os.path.join(ROOT_DIR, "static")
PAGES_DIR = os.path.join(STATIC_DIR, "pages")

# Challenge / instance storage
CHALLENGE_FILE = os.path.join(ROOT_DIR, "challenges.json")
INSTANCES_FILE = os.path.join(ROOT_DIR, "instances.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")

# Auth / token storage
USERS_FILE = os.path.join(DATA_DIR, "users.json")
SECRET_FILE = os.path.join(DATA_DIR, "secret.key")
