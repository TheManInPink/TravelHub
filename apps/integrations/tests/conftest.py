"""Fixtures des tests des services externes."""

import pytest

from apps.integrations.services import http


@pytest.fixture
def cache_timeouts(monkeypatch):
    """Durée de mise en cache demandée pour chaque clé, par type de donnée (geocode…)."""
    timeouts = {}
    original = http.cache.set

    def spy(key, value, timeout):
        timeouts[key.split(":")[1]] = timeout
        original(key, value, timeout)

    monkeypatch.setattr(http.cache, "set", spy)
    return timeouts
