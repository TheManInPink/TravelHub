<#
.SYNOPSIS
    Sauvegarde la base de TravelHub (pg_dump -Fc) dans un fichier horodaté. Garde les 7 plus récents.

.DESCRIPTION
    Par défaut, le script sauvegarde la base de DATABASE_URL (variable d'environnement, sinon
    fichier .env) avec le pg_dump de PostgreSQL 18. Le mot de passe est passé dans PGPASSWORD
    pendant la commande. Il n'apparaît jamais sur la ligne de commande ni dans un fichier.

    Avec -Docker, c'est la base du service db de docker compose qui est sauvegardée. pg_dump
    tourne dans le conteneur (docker compose exec) et l'archive est ensuite copiée sur l'hôte
    (docker compose cp).

    Chaque archive est relue avec pg_restore --list avant d'être gardée. Les fichiers s'appellent
    backups\<base>_AAAAMMJJ-HHMMSS.dump en local et backups\<base>-docker_AAAAMMJJ-HHMMSS.dump
    avec Docker. La rétention est appliquée à chaque série séparément.

.EXAMPLE
    .\scripts\backup.ps1

.EXAMPLE
    .\scripts\backup.ps1 -Docker -Keep 14
#>
param(
    [switch]$Docker,
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\backups"),
    [ValidateRange(1, 1000)]
    [int]$Keep = 7,
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

New-Item -ItemType Directory -Force $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Push-Location $projectRoot
$previousPassword = $env:PGPASSWORD
try {
    if ($Docker) {
        $database = (Invoke-Native "docker" @("compose", "exec", "-T", "db", "printenv", "POSTGRES_DB") | Out-String).Trim()
        $prefix = "$database-docker"
        $file = Join-Path $OutputDir "${prefix}_$stamp.dump"
        $inContainer = "/tmp/travelhub-backup.dump"
        try {
            # Variables du conteneur. On se connecte par le socket local, sans mot de passe.
            Invoke-Native "docker" @("compose", "exec", "-T", "db", "sh", "-c",
                "pg_dump -Fc -U `$POSTGRES_USER -d `$POSTGRES_DB -f $inContainer && pg_restore --list $inContainer > /dev/null")
            Invoke-Native "docker" @("compose", "cp", "db:$inContainer", $file)
        }
        finally {
            try { Invoke-Native "docker" @("compose", "exec", "-T", "db", "rm", "-f", $inContainer) }
            catch { Write-Warning "Fichier temporaire $inContainer non supprimé du conteneur db." }
        }
    }
    else {
        $pgDump = Join-Path $PgBin "pg_dump.exe"
        if (-not (Test-Path $pgDump)) { throw "pg_dump introuvable dans $PgBin (paramètre -PgBin)." }
        $db = Get-DatabaseUrl
        $prefix = $db.Database
        $file = Join-Path $OutputDir "${prefix}_$stamp.dump"
        $env:PGPASSWORD = $db.Password
        Invoke-Native $pgDump @("-Fc", "-h", $db.Host, "-p", $db.Port, "-U", $db.User, "-d", $db.Database, "-f", $file)
        Invoke-Native (Join-Path $PgBin "pg_restore.exe") @("--list", $file) | Out-Null
    }
}
catch {
    # Une archive incomplète ne doit pas compter comme sauvegarde, ni en remplacer une bonne.
    if ($file -and (Test-Path $file)) { Remove-Item $file -Force }
    throw
}
finally {
    $env:PGPASSWORD = $previousPassword
    Pop-Location
}

$size = [math]::Round((Get-Item $file).Length / 1KB, 1)
Write-Host "Sauvegarde créée : $file ($size Ko)"

# Rétention. Les noms contiennent l'horodatage, donc l'ordre alphabétique est chronologique.
$expired = Get-ChildItem $OutputDir -Filter "${prefix}_*.dump" |
    Sort-Object Name -Descending | Select-Object -Skip $Keep
foreach ($old in $expired) {
    Remove-Item $old.FullName -Force
    Write-Host "Ancienne sauvegarde supprimée : $($old.Name)"
}
