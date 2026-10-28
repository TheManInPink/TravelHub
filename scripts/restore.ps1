<#
.SYNOPSIS
    Restaure une sauvegarde de TravelHub (archive pg_dump -Fc) dans une base PostgreSQL.

.DESCRIPTION
    Par défaut, le script restaure la sauvegarde la plus récente de backups\ dans la base de
    DATABASE_URL (variable d'environnement, sinon fichier .env), avec le pg_restore de
    PostgreSQL 18. -Database permet de viser une autre base sur le même serveur. Elle est
    créée si elle n'existe pas, car le rôle de l'application a le droit CREATEDB.

    Avec -Docker, la restauration se fait dans la base du service db de docker compose.
    L'archive est copiée dans le conteneur (docker compose cp) puis pg_restore y est lancé
    (docker compose exec). Si c'est la base du service web, on arrête ce service pendant la
    restauration et on le redémarre après. Il réapplique alors les migrations manquantes.

    Une base qui a déjà des tables n'est écrasée qu'avec -Force (pg_restore --clean).
    Tout se fait dans une transaction, donc en cas d'erreur la base ne change pas.
    Les propriétaires et les droits de l'archive sont ignorés (--no-owner --no-privileges).
    On peut donc restaurer une sauvegarde locale dans Docker, et l'inverse aussi.

.EXAMPLE
    .\scripts\restore.ps1 -Database travelhub_restore

.EXAMPLE
    .\scripts\restore.ps1 -File .\backups\travelhub_20261023-101500.dump -Force

.EXAMPLE
    .\scripts\restore.ps1 -Docker -Force
#>
param(
    [string]$File,
    [switch]$Docker,
    [ValidatePattern('^[A-Za-z_][A-Za-z0-9_]{0,62}$')]
    [string]$Database,
    [switch]$Force,
    [string]$BackupDir = (Join-Path $PSScriptRoot "..\backups"),
    [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Lance un programme externe et échoue si son code de sortie n'est pas 0. Ce qu'il écrit sur la
# sortie d'erreur n'est pas bloquant (docker compose y écrit même quand tout va bien).
function Invoke-Native {
    param([string]$FilePath, [string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $FilePath @Arguments }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw "$(Split-Path $FilePath -Leaf) a échoué (code $LASTEXITCODE)." }
}

# Commande lancée dans le conteneur db (par le socket local, sans mot de passe).
function Invoke-InDb([string[]]$Arguments) {
    Invoke-Native "docker" (@("compose", "exec", "-T", "db") + $Arguments)
}

# Connexion lue dans DATABASE_URL. Comme dans Django, la variable d'environnement passe avant .env.
function Get-DatabaseUrl {
    $url = $env:DATABASE_URL
    if (-not $url) {
        $envFile = Join-Path $projectRoot ".env"
        $line = Get-Content $envFile -ErrorAction SilentlyContinue |
            Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
        if (-not $line) { throw "DATABASE_URL introuvable (ni variable d'environnement, ni $envFile)." }
        $url = $line -replace '^DATABASE_URL=', ''
    }
    $uri = [Uri]$url.Trim()
    $user, $password = $uri.UserInfo.Split(':', 2)
    [pscustomobject]@{
        Host     = $uri.Host
        Port     = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
        User     = [Uri]::UnescapeDataString($user)
        Password = if ($password) { [Uri]::UnescapeDataString($password) } else { "" }
        Database = $uri.AbsolutePath.TrimStart('/')
    }
}

if (-not $File) {
    $latest = Get-ChildItem $BackupDir -Filter "*.dump" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { throw "Aucune sauvegarde dans $BackupDir (paramètre -File)." }
    $File = $latest.FullName
}
$File = (Resolve-Path $File).Path
Write-Host "Sauvegarde : $File"

# Options communes. --clean seulement s'il faut écraser une base qui n'est pas vide.
$restoreOptions = @("--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction")
$countTables = "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"

Push-Location $projectRoot
$previousPassword = $env:PGPASSWORD
$restartWeb = $false
try {
    if ($Docker) {
        $pgUser = (Invoke-InDb @("printenv", "POSTGRES_USER") | Out-String).Trim()
        $webDatabase = (Invoke-InDb @("printenv", "POSTGRES_DB") | Out-String).Trim()
        if (-not $Database) { $Database = $webDatabase }
        $psql = @("psql", "-U", $pgUser, "-tA")

        $exists = (Invoke-InDb ($psql + @("-d", "postgres", "-c", "SELECT 1 FROM pg_database WHERE datname = '$Database'")) | Out-String).Trim()
        if ($exists -ne "1") {
            Invoke-InDb @("createdb", "-U", $pgUser, "-O", $pgUser, "-E", "UTF8", $Database)
            Write-Host "Base '$Database' créée dans le conteneur db."
            $tables = 0
        }
        else {
            $tables = [int](Invoke-InDb ($psql + @("-d", $Database, "-c", $countTables)) | Out-String).Trim()
        }
        if ($tables -gt 0 -and -not $Force) {
            throw "La base '$Database' contient $tables tables. Relancez avec -Force pour l'écraser, ou choisissez une base vide avec -Database."
        }
        if ($tables -gt 0) { $restoreOptions += @("--clean", "--if-exists") }

        # Le service web garde des connexions ouvertes sur sa base, donc on l'arrête pendant la restauration.
        $running = Invoke-Native "docker" @("compose", "ps", "--status", "running", "--services")
        if ($Database -eq $webDatabase -and $running -contains "web") {
            Invoke-Native "docker" @("compose", "stop", "web")
            $restartWeb = $true
        }

        $inContainer = "/tmp/travelhub-restore.dump"
        Invoke-Native "docker" @("compose", "cp", $File, "db:$inContainer")
        try {
            Invoke-InDb (@("pg_restore", "-U", $pgUser, "-d", $Database) + $restoreOptions + @($inContainer))
            $migrations = (Invoke-InDb ($psql + @("-d", $Database, "-c", "SELECT count(*) FROM django_migrations")) | Out-String).Trim()
        }
        finally {
            try { Invoke-InDb @("rm", "-f", $inContainer) }
            catch { Write-Warning "Fichier temporaire $inContainer non supprimé du conteneur db." }
        }
    }
    else {
        $pgRestore = Join-Path $PgBin "pg_restore.exe"
        $psql = Join-Path $PgBin "psql.exe"
        if (-not (Test-Path $pgRestore)) { throw "pg_restore introuvable dans $PgBin (paramètre -PgBin)." }
        $db = Get-DatabaseUrl
        if (-not $Database) { $Database = $db.Database }
        $env:PGPASSWORD = $db.Password
        $connection = @("-h", $db.Host, "-p", $db.Port, "-U", $db.User)

        $exists = (Invoke-Native $psql ($connection + @("-d", "postgres", "-tAc", "SELECT 1 FROM pg_database WHERE datname = '$Database'")) | Out-String).Trim()
        if ($exists -ne "1") {
            Invoke-Native (Join-Path $PgBin "createdb.exe") ($connection + @("-O", $db.User, "-E", "UTF8", $Database))
            Write-Host "Base '$Database' créée."
            $tables = 0
        }
        else {
            $tables = [int](Invoke-Native $psql ($connection + @("-d", $Database, "-tAc", $countTables)) | Out-String).Trim()
        }
        if ($tables -gt 0 -and -not $Force) {
            throw "La base '$Database' contient $tables tables. Relancez avec -Force pour l'écraser, ou choisissez une base vide avec -Database."
        }
        if ($tables -gt 0) { $restoreOptions += @("--clean", "--if-exists") }

        Invoke-Native $pgRestore ($connection + @("-d", $Database) + $restoreOptions + @($File))
        $migrations = (Invoke-Native $psql ($connection + @("-d", $Database, "-tAc", "SELECT count(*) FROM django_migrations")) | Out-String).Trim()
    }
}
finally {
    $env:PGPASSWORD = $previousPassword
    if ($restartWeb) {
        Invoke-Native "docker" @("compose", "start", "web")
        Write-Host "Service web redémarré."
    }
    Pop-Location
}

Write-Host "Restauration terminée dans '$Database' ($migrations migrations Django enregistrées)."
