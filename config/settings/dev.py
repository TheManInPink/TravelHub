"""Paramètres de développement local."""

from .base import *  # noqa: F403
from .base import env

DEBUG = env("DEBUG", default=True)
ALLOWED_HOSTS = env("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
