# Image de production de TravelHub : Gunicorn derrière un proxy HTTPS, statiques servis
# par WhiteNoise. Construction : docker build -t travelhub .

# Étape 1 : dépendances installées dans un environnement virtuel, copié tel quel ensuite.
FROM python:3.14-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install -r requirements.txt


# Étape 2 : image d'exécution, sans pip ni cache de construction.
FROM python:3.14-slim AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

RUN groupadd --system --gid 10001 travelhub \
    && useradd --system --uid 10001 --gid travelhub --no-create-home travelhub

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
# Code et statiques appartiennent à root : l'utilisateur du serveur ne peut pas les modifier.
COPY . .

# collectstatic n'ouvre pas la base, mais les paramètres exigent ces deux variables.
RUN SECRET_KEY=collectstatic DATABASE_URL=postgres://build@localhost/build LOG_FILE= \
    python manage.py collectstatic --noinput

# Seul répertoire modifiable par le serveur : journaux rotatifs (volume web-logs).
RUN install -d -o travelhub -g travelhub /app/logs

USER travelhub

EXPOSE 8000

# /health/ vérifie la base et le cache ; il est exempté de la redirection HTTPS.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request as u; u.urlopen('http://localhost:8000/health/', timeout=4)"]

# Options dans gunicorn.conf.py (lu depuis /app).
CMD ["gunicorn", "config.wsgi"]
