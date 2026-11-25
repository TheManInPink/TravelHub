<#
.SYNOPSIS
    Sauvegarde la base de TravelHub (pg_dump -Fc) dans un fichier horodaté. Garde les 7 plus récents.

.DESCRIPTION
    Par défaut, le script sauvegarde la base de DATABASE_URL (variable d'environnement, sinon
    fichier .env) avec le pg_dump de PostgreSQL 18. Le mot de passe est passé dans PGPASSWORD
    pendant la commande. Il n'apparaît jamais sur la ligne de commande ni dans un fichier.

    Les paramètres de l'URL sont respectés. Avec Neon, ?sslmode=require devient PGSSLMODE=require
    et channel_binding=require devient PGCHANNELBINDING=require, pendant la commande seulement.
    pg_dump refuse alors une connexion sans chiffrement.

    Les sauvegardes de Neon forment une série à part, backups\<base>-neon_AAAAMMJJ-HHMMSS.dump.
    Sinon, une sauvegarde locale de la même base « travelhub » pourrait les supprimer en
    appliquant la rétention. -Label donne un autre nom de série.

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

.EXAMPLE
    # Base de production sur Neon, dans une fenêtre PowerShell réservée à cet usage
    $env:DATABASE_URL = neon connection-string production --database-name travelhub --role-name travelhub_owner --ssl require
    .\scripts\backup.ps1
    Remove-Item Env:DATABASE_URL
#>
param(
    [switch]$Docker,
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\backups"),
    [ValidateRange(1, 1000)]
    [int]$Keep = 7,
    # Nom de la série, ajouté après le nom de la base. « neon » par défaut pour un hôte Neon.
    [ValidatePattern('^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$')]
    [string]$Label,
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

# Paramètres de l'URL que nous savons passer aux outils de PostgreSQL, avec leur variable PG*.
$urlParameters = @{
    sslmode         = "PGSSLMODE"
    channel_binding = "PGCHANNELBINDING"
}

# Connexion lue dans DATABASE_URL. Comme dans Django, la variable d'environnement passe avant .env.
# Environment contient les variables PG* à définir pendant la commande, mot de passe compris.
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
    $environment = @{ PGPASSWORD = if ($password) { [Uri]::UnescapeDataString($password) } else { "" } }
    foreach ($pair in $uri.Query.TrimStart('?').Split('&', [StringSplitOptions]::RemoveEmptyEntries)) {
        $name, $value = $pair.Split('=', 2)
        $variable = $urlParameters[$name]
        if ($variable -and $value) { $environment[$variable] = [Uri]::UnescapeDataString($value) }
        else { Write-Warning "Paramètre « $name » de DATABASE_URL ignoré par le script." }
    }
    [pscustomobject]@{
        Host        = $uri.Host
        Port        = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
        User        = [Uri]::UnescapeDataString($user)
        Database    = $uri.AbsolutePath.TrimStart('/')
        Environment = $environment
    }
}

# Définit les variables, puis renvoie leurs anciennes valeurs pour Restore-Environment.
function Set-Environment([hashtable]$Values) {
    $previous = @{}
    foreach ($name in $Values.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name)
        [Environment]::SetEnvironmentVariable($name, $Values[$name])
    }
    $previous
}

# Une valeur $null supprime la variable, si elle n'existait pas avant le script.
function Restore-Environment([hashtable]$Previous) {
    foreach ($name in $Previous.Keys) { [Environment]::SetEnvironmentVariable($name, $Previous[$name]) }
}

New-Item -ItemType Directory -Force $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Push-Location $projectRoot
$previousEnvironment = @{}
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
        if (-not $Label -and $db.Host -like "*.neon.tech") { $Label = "neon" }
        $prefix = if ($Label) { "$($db.Database)-$Label" } else { $db.Database }
        $file = Join-Path $OutputDir "${prefix}_$stamp.dump"
        $sslMode = if ($db.Environment.PGSSLMODE) { $db.Environment.PGSSLMODE } else { "par défaut" }
        Write-Host "Base '$($db.Database)' sur $($db.Host) (sslmode : $sslMode)"
        $previousEnvironment = Set-Environment $db.Environment
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
    Restore-Environment $previousEnvironment
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
