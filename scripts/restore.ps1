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

    Les paramètres sslmode et channel_binding de l'URL sont respectés (PGSSLMODE et
    PGCHANNELBINDING pendant la commande), comme dans backup.ps1. Pour une base distante, par
    exemple Neon, -File est obligatoire : le script ne prend jamais « la plus récente » au hasard
    pour la production.

    pg_restore ne parle pas directement à la base. Il écrit d'abord le SQL de l'archive dans un
    fichier temporaire, puis psql rejoue ce SQL. Entre les deux, le script retire les lignes
    « ALTER TABLE ONLY … ALTER COLUMN … SET (pg_attver=…) » que Neon ajoute pour chaque colonne.
    pg_attver est une option interne de Neon : un PostgreSQL ordinaire la refuse avec
    « unrecognized parameter "pg_attver" », et la restauration échouait dès la première table.

    Une base qui a déjà des tables n'est écrasée qu'avec -Force (pg_restore --clean).
    Tout se fait dans une transaction (psql --single-transaction, arrêt à la première erreur),
    donc en cas d'erreur la base ne change pas.
    Les propriétaires et les droits de l'archive sont ignorés (--no-owner --no-privileges).
    On peut donc restaurer une sauvegarde locale dans Docker, une sauvegarde de Neon en local,
    et l'inverse aussi.

.EXAMPLE
    .\scripts\restore.ps1 -Database travelhub_restore

.EXAMPLE
    .\scripts\restore.ps1 -File .\backups\travelhub_20261023-101500.dump -Force

.EXAMPLE
    .\scripts\restore.ps1 -Docker -Force

.EXAMPLE
    # Sauvegarde de Neon relue dans une base locale neuve, pour vérifier qu'elle est complète
    .\scripts\restore.ps1 -File .\backups\travelhub-neon_20261125-101500.dump -Database travelhub_neon
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

# La base est sur ce poste (PostgreSQL local), et pas chez un hébergeur comme Neon.
function Test-LocalHost([string]$HostName) {
    @("localhost", "127.0.0.1", "::1", "[::1]") -contains $HostName
}

if (-not $Docker -and -not $File) {
    $target = Get-DatabaseUrl
    if (-not (Test-LocalHost $target.Host)) {
        throw "La base visée est sur $($target.Host). Pour une base distante, donnez la sauvegarde avec -File."
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

# Options de pg_restore pour écrire le SQL. --clean seulement s'il faut écraser une base qui
# n'est pas vide : le SQL supprime alors d'abord les objets existants.
$sqlOptions = @("--no-owner", "--no-privileges")
# psql ignore ~/.psqlrc, n'affiche pas chaque commande, s'arrête à la première erreur et met
# tout le fichier dans une seule transaction.
$psqlOptions = @("-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction")
# Sans les NOTICE des DROP … IF EXISTS de --clean.
$quietOptions = "-c client_min_messages=warning"
# Ligne écrite par pg_dump pour l'option interne pg_attver de chaque colonne sur Neon.
$neonOptionPattern = '^ALTER TABLE ONLY .+ ALTER COLUMN .+ SET \(pg_attver=[0-9]+\);$'
$countTables = "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"

# Copie le SQL de Source dans Target sans les lignes pg_attver, et renvoie leur nombre. Le
# fichier est lu ligne par ligne, en UTF-8 sans BOM, car un BOM ferait échouer psql dès la
# première ligne. Les fins de ligne restent celles d'Unix.
function Remove-NeonColumnOption([string]$Source, [string]$Target) {
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $reader = New-Object System.IO.StreamReader($Source, $utf8)
    $writer = New-Object System.IO.StreamWriter($Target, $false, $utf8)
    $writer.NewLine = "`n"
    $removed = 0
    try {
        while ($null -ne ($line = $reader.ReadLine())) {
            if ($line -match $neonOptionPattern) { $removed++ }
            else { $writer.WriteLine($line) }
        }
    }
    finally {
        $reader.Dispose()
        $writer.Dispose()
    }
    $removed
}

Push-Location $projectRoot
$previousEnvironment = @{}
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
        if ($tables -gt 0) { $sqlOptions += @("--clean", "--if-exists") }

        # Le service web garde des connexions ouvertes sur sa base, donc on l'arrête pendant la restauration.
        $running = Invoke-Native "docker" @("compose", "ps", "--status", "running", "--services")
        if ($Database -eq $webDatabase -and $running -contains "web") {
            Invoke-Native "docker" @("compose", "stop", "web")
            $restartWeb = $true
        }

        $inContainer = "/tmp/travelhub-restore.dump"
        $sqlInContainer = "/tmp/travelhub-restore.sql"
        Invoke-Native "docker" @("compose", "cp", $File, "db:$inContainer")
        try {
            Invoke-InDb (@("pg_restore", "-f", $sqlInContainer) + $sqlOptions + @($inContainer))
            Invoke-InDb @("sed", "-i", "-E", "/$neonOptionPattern/d", $sqlInContainer)
            Invoke-InDb (@("env", "PGOPTIONS=$quietOptions", "psql", "-U", $pgUser, "-d", $Database) + $psqlOptions + @("-f", $sqlInContainer)) | Out-Null
            $migrations = (Invoke-InDb ($psql + @("-d", $Database, "-c", "SELECT count(*) FROM django_migrations")) | Out-String).Trim()
        }
        finally {
            try { Invoke-InDb @("rm", "-f", $inContainer, $sqlInContainer) }
            catch { Write-Warning "Fichiers temporaires $inContainer et $sqlInContainer non supprimés du conteneur db." }
        }
    }
    else {
        $pgRestore = Join-Path $PgBin "pg_restore.exe"
        $psql = Join-Path $PgBin "psql.exe"
        if (-not (Test-Path $pgRestore)) { throw "pg_restore introuvable dans $PgBin (paramètre -PgBin)." }
        $db = Get-DatabaseUrl
        if (-not $Database) { $Database = $db.Database }
        $sslMode = if ($db.Environment.PGSSLMODE) { $db.Environment.PGSSLMODE } else { "par défaut" }
        Write-Host "Base visée : '$Database' sur $($db.Host) (sslmode : $sslMode)"
        $db.Environment["PGOPTIONS"] = $quietOptions
        $previousEnvironment = Set-Environment $db.Environment
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
        if ($tables -gt 0) { $sqlOptions += @("--clean", "--if-exists") }

        # Le SQL contient les données de la base (comptes compris) : il est supprimé à la fin.
        $temp = [IO.Path]::GetTempPath()
        $rawSql = Join-Path $temp "travelhub-restore-$([guid]::NewGuid()).sql"
        $sqlFile = Join-Path $temp "travelhub-restore-$([guid]::NewGuid()).sql"
        try {
            Invoke-Native $pgRestore (@("-f", $rawSql) + $sqlOptions + @($File))
            $removed = Remove-NeonColumnOption $rawSql $sqlFile
            if ($removed -gt 0) { Write-Host "Options pg_attver de Neon retirées : $removed." }
            # Out-Null cache les résultats des SELECT setval() du SQL. Les erreurs restent affichées.
            Invoke-Native $psql ($connection + @("-d", $Database) + $psqlOptions + @("-f", $sqlFile)) | Out-Null
        }
        finally {
            Remove-Item $rawSql, $sqlFile -Force -ErrorAction SilentlyContinue
        }
        $migrations = (Invoke-Native $psql ($connection + @("-d", $Database, "-tAc", "SELECT count(*) FROM django_migrations")) | Out-String).Trim()
    }
}
finally {
    Restore-Environment $previousEnvironment
    if ($restartWeb) {
        Invoke-Native "docker" @("compose", "start", "web")
        Write-Host "Service web redémarré."
    }
    Pop-Location
}

Write-Host "Restauration terminée dans '$Database' ($migrations migrations Django enregistrées)."
