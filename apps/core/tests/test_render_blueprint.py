"""Le Blueprint Render (render.yaml) reste cohérent avec l'image et avec docker-compose.yml.

Render ne lit ce fichier qu'au moment du déploiement. Ces tests trouvent les erreurs plus
tôt, dans la CI.
"""

import os
import shlex
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


class TestStartCommand:
    def test_same_command_as_docker_compose(self, service):
        compose = load_yaml("docker-compose.yml")
        assert service["dockerCommand"] == compose["services"]["web"]["command"]

    def test_runs_through_a_shell(self, service):
        # Sans sh -c, Render passerait « && » à manage.py comme un simple argument.
        assert shlex.split(service["dockerCommand"]) == [
            "sh",
            "-c",
            "python manage.py migrate --noinput && exec gunicorn config.wsgi",
        ]


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
