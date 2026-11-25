"""Le service frontend de docker-compose.yml reste branché sur le service web.

Ces tests lisent seulement les fichiers. La CI ne construit pas l'image du front-end : cela
prend plusieurs minutes, et Vercel construit déjà le front-end à chaque PR.
"""

import pytest
import yaml  # PyYAML, installé avec drf-spectacular
from django.conf import settings

FRONTEND = settings.BASE_DIR / "frontend"


@pytest.fixture(scope="module")
def services():
    compose = (settings.BASE_DIR / "docker-compose.yml").read_text(encoding="utf-8")
    return yaml.safe_load(compose)["services"]


def test_frontend_starts_only_with_its_profile(services):
    # docker compose up seul démarre web, db et pgadmin, comme dans la tâche « Image Docker »
    # de la CI, et laisse le port 3000 à npm run dev.
    assert services["frontend"]["profiles"] == ["frontend"]
    assert all("profiles" not in services[name] for name in ("web", "db", "pgadmin"))


def test_frontend_calls_django_by_the_name_of_the_web_service(services):
    frontend = services["frontend"]
    assert frontend["environment"]["DJANGO_API_URL"] == "http://web:8000"
    assert frontend["depends_on"]["web"]["condition"] == "service_healthy"
    # Django répond 400 à un hôte absent de ALLOWED_HOSTS : « web » s'ajoute à ceux de .env.
    assert services["web"]["environment"]["ALLOWED_HOSTS"].split(",")[-1] == "web"


def test_supabase_url_is_the_same_at_build_and_at_runtime(services):
    # next/image lit la liste des images au build, et TripCover relit SUPABASE_URL au
    # démarrage. Deux valeurs différentes donneraient des images cassées.
    frontend = services["frontend"]
    assert frontend["build"]["args"]["SUPABASE_URL"] == frontend["environment"]["SUPABASE_URL"]


def test_secrets_of_the_frontend_stay_out_of_the_image(services):
    dockerignore = (FRONTEND / ".dockerignore").read_text(encoding="utf-8").splitlines()
    assert ".env*" in dockerignore
    # La clé secrète arrive au démarrage du conteneur (env_file), jamais pendant le build.
    assert "SUPABASE_SECRET_KEY" not in services["frontend"]["build"]["args"]
    assert "SUPABASE_SECRET_KEY" not in (FRONTEND / "Dockerfile").read_text(encoding="utf-8")


def test_frontend_image_uses_the_standalone_output():
    dockerfile = (FRONTEND / "Dockerfile").read_text(encoding="utf-8")
    assert "NEXT_OUTPUT=standalone" in dockerfile
    assert 'CMD ["node", "server.js"]' in dockerfile
    config = (FRONTEND / "next.config.ts").read_text(encoding="utf-8")
    assert 'process.env.NEXT_OUTPUT === "standalone"' in config
