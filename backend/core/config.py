import os

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
