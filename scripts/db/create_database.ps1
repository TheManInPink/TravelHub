<#
.SYNOPSIS
    Crée ou met à jour le rôle et la base PostgreSQL de TravelHub d'après DATABASE_URL dans .env.

.DESCRIPTION
    Le mot de passe du super-utilisateur PostgreSQL est demandé une fois. Il n'est jamais enregistré.
    Le rôle reçoit CREATEDB pour que pytest puisse créer la base de test.

.EXAMPLE
    .\scripts\db\create_database.ps1
#>
param(
    [string]$PsqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    [string]$SuperUser = "postgres"
)

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\..\.env"
$line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL introuvable dans $envFile" }

$uri = [Uri]($line -replace '^DATABASE_URL=', '')
$appUser, $appPassword = $uri.UserInfo.Split(':', 2)
$appPassword = [Uri]::UnescapeDataString($appPassword)
$dbName = $uri.AbsolutePath.TrimStart('/')
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

# PGPASSWORD peut déjà être fourni par reset_postgres_password.ps1.
if (-not $env:PGPASSWORD) {
    $secure = Read-Host "Mot de passe du super-utilisateur PostgreSQL '$SuperUser'" -AsSecureString
    $env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password
}

try {
    $psqlArgs = @("-U", $SuperUser, "-h", $uri.Host, "-p", $dbPort, "-d", "postgres", "-v", "ON_ERROR_STOP=1")

    $roleSql = @"
DO `$`$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$appUser') THEN
        CREATE ROLE $appUser LOGIN CREATEDB PASSWORD '$appPassword';
    ELSE
        ALTER ROLE $appUser WITH LOGIN CREATEDB PASSWORD '$appPassword';
    END IF;
END
`$`$;
"@
    & $PsqlPath @psqlArgs -c $roleSql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Échec de la création du rôle $appUser." }
    Write-Host "Rôle '$appUser' prêt."

    $exists = & $PsqlPath @psqlArgs -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
    if ($exists -ne "1") {
        & $PsqlPath @psqlArgs -c "CREATE DATABASE $dbName OWNER $appUser ENCODING 'UTF8'" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Échec de la création de la base $dbName." }
        Write-Host "Base '$dbName' créée."
    }
    else {
        Write-Host "Base '$dbName' déjà présente."
    }
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
