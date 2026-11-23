"""Le Blueprint Render (render.yaml) reste cohérent avec l'image et avec docker-compose.yml.

Render ne lit ce fichier qu'au moment du déploiement. Ces tests trouvent les erreurs plus
tôt, dans la CI.
"""

import fnmatch
import json
import os
import re
import subprocess
import sys

import pytest
import yaml  # PyYAML, installé avec drf-spectacular
from django.conf import settings
from django.urls import resolve

from apps.core.views import health

# Valeurs saisies dans le tableau de bord de Render (sync: false), jamais écrites dans le dépôt.
DASHBOARD_ONLY = {"SECRET_KEY", "DATABASE_URL", "ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS"}


def load_yaml(name):
    return yaml.safe_load((settings.BASE_DIR / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def blueprint():
    return load_yaml("render.yaml")


@pytest.fixture(scope="module")
def service(blueprint):
    (project,) = blueprint["projects"]
    (environment,) = project["environments"]
    (web,) = environment["services"]
    return web


@pytest.fixture(scope="module")
def values(service):
    """Les variables dont la valeur est écrite dans render.yaml."""
    return {item["key"]: item["value"] for item in service["envVars"] if "value" in item}


class TestWebService:
    def test_service_is_in_the_production_environment(self, blueprint):
        (project,) = blueprint["projects"]
        assert project["name"] == "TravelHub"
        assert [env["name"] for env in project["environments"]] == ["Production"]
        # Un service déclaré aussi à la racine serait créé hors du projet.
        assert "services" not in blueprint

    def test_docker_web_service_on_the_free_plan(self, service):
        assert service["type"] == "web"
        assert service["runtime"] == "docker"
        assert service["plan"] == "free"
        assert service["branch"] == "master"

    def test_deploys_only_after_green_checks(self, service):
        assert service["autoDeployTrigger"] == "checksPass"
        # autoDeploy est l'ancien champ, remplacé par autoDeployTrigger.
        assert "autoDeploy" not in service

    def test_no_pre_deploy_command_on_the_free_plan(self, service):
        assert "preDeployCommand" not in service

    def test_health_check_path_is_the_health_view(self, service):
        assert resolve(service["healthCheckPath"]).func is health

    def test_frontend_changes_do_not_redeploy_the_api(self, service):
        assert "frontend/**" in service["buildFilter"]["ignoredPaths"]

    def test_neon_cli_files_do_not_redeploy_the_api(self, service):
        # neon.ts et ses dépendances (package.json, .npmrc) ne servent qu'à la CLI Neon.
        # Ils ne sont pas non plus copiés dans l'image (voir .dockerignore).
        dockerignore = (settings.BASE_DIR / ".dockerignore").read_text(encoding="utf-8")
        for name in ("package.json", ".npmrc", "neon.ts"):
            assert name in service["buildFilter"]["ignoredPaths"], name
            assert name in dockerignore.splitlines(), name

    def test_build_filter_paths_use_only_the_characters_render_accepts(self, service):
        # Règle appliquée par Render au moment de lire le Blueprint, mais absente de son
        # schéma JSON publié. L'ancien dossier « Modèle_de_Rapport_LaTex » était refusé à
        # cause du « è ». Nous l'avons renommé sans accent.
        allowed = re.compile(r"[A-Za-z0-9\-_./^*? \[\]]+")
        for path in service["buildFilter"]["ignoredPaths"]:
            assert allowed.fullmatch(path), path

    def test_build_filter_still_matches_the_report_folder(self, service):
        report = next(p for p in service["buildFilter"]["ignoredPaths"] if "Rapport" in p)
        folder = report.removesuffix("/**")
        folders = [path.name for path in settings.BASE_DIR.iterdir() if path.is_dir()]
        assert any(fnmatch.fnmatchcase(name, folder) for name in folders), folder


class TestStartCommand:
    def test_image_applies_migrations_then_starts_gunicorn(self):
        dockerfile = (settings.BASE_DIR / "Dockerfile").read_text(encoding="utf-8")
        # Le CMD du HEALTHCHECK est indenté. Seul le dernier CMD en début de ligne compte.
        (*_, command) = [line for line in dockerfile.splitlines() if line.startswith("CMD ")]
        # Forme JSON : Docker passe chaque argument tel quel, sans shell ni guillemets.
        assert json.loads(command.removeprefix("CMD ")) == [
            "sh",
            "-c",
            "python manage.py migrate --noinput && exec gunicorn config.wsgi",
        ]

    def test_render_uses_the_command_of_the_image(self, service):
        # Render garde les guillemets d'un dockerCommand. Avec sh -c "…", sh cherchait une
        # commande nommée « python manage.py migrate … » et le conteneur s'arrêtait (127).
        assert "dockerCommand" not in service

    def test_docker_compose_uses_the_command_of_the_image(self):
        compose = load_yaml("docker-compose.yml")
        assert "command" not in compose["services"]["web"]


class TestEnvironment:
    def test_secrets_are_typed_in_the_dashboard(self, service):
        variables = {item["key"]: item for item in service["envVars"]}
        for key in DASHBOARD_ONLY:
            # Ni value ni generateValue : la valeur n'existe que dans le tableau de bord.
            assert variables[key] == {"key": key, "sync": False}

    def test_production_values(self, service, values):
        assert values == {
            "DJANGO_SETTINGS_MODULE": "config.settings.prod",
            "NUM_PROXIES": "1",
            "THROTTLE_ANON_RATE": "300/hour",
            "LOG_FILE": "",
            "WEB_CONCURRENCY": "2",
        }
        assert {item["key"] for item in service["envVars"]} == DASHBOARD_ONLY | set(values)

    @pytest.mark.slow
    def test_production_settings_accept_these_values(self, values):
        # SECRET_KEY et DATABASE_URL viennent de l'environnement de la CI ou du fichier .env.
        # Les deux autres valeurs du tableau de bord sont remplacées par des exemples.
        env = {
            **os.environ,
            **values,
            "ALLOWED_HOSTS": "travelhub-uqar-api.onrender.com,localhost",
            "CORS_ALLOWED_ORIGINS": "https://travelhub-uqar.vercel.app",
        }
        result = subprocess.run(  # noqa: S603 : commande fixe, sans entrée externe
            [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
            cwd=settings.BASE_DIR,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )

        assert result.returncode == 0, result.stderr
        assert "no issues" in result.stdout
