#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Réinitialise le mot de passe oublié du super-utilisateur PostgreSQL, puis crée la base TravelHub.

.DESCRIPTION
    1. Sauvegarde pg_hba.conf.
    2. Passe temporairement les connexions locales en « trust » et redémarre le service.
    3. Définit le nouveau mot de passe du super-utilisateur.
    4. Restaure TOUJOURS pg_hba.conf d'origine et redémarre le service, même en cas d'erreur.
    5. Lance create_database.ps1 avec le nouveau mot de passe, ce qui vérifie aussi qu'il fonctionne.

    À exécuter dans un PowerShell ouvert « en tant qu'administrateur ».

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\db\reset_postgres_password.ps1
#>
param(
    [string]$PgRoot = "C:\Program Files\PostgreSQL\18",
    [string]$ServiceName = "postgresql-x64-18",
    [string]$SuperUser = "postgres"
)

$ErrorActionPreference = "Stop"

$hbaFile = Join-Path $PgRoot "data\pg_hba.conf"
$psql = Join-Path $PgRoot "bin\psql.exe"
$backup = "$hbaFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

function Read-NewPassword {
    while ($true) {
        $first = Read-Host "Nouveau mot de passe pour '$SuperUser' (12 caractères minimum)" -AsSecureString
        $second = Read-Host "Confirmez le mot de passe" -AsSecureString
        $a = [System.Net.NetworkCredential]::new("", $first).Password
        $b = [System.Net.NetworkCredential]::new("", $second).Password
        if ($a -ne $b) { Write-Warning "Les deux saisies diffèrent."; continue }
        if ($a.Length -lt 12) { Write-Warning "Mot de passe trop court."; continue }
        return $a
    }
}

function Restart-PostgreSQL {
    Restart-Service -Name $ServiceName -Force
    (Get-Service -Name $ServiceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
    Start-Sleep -Seconds 2
}

$newPassword = Read-NewPassword

Copy-Item $hbaFile $backup
Write-Host "Sauvegarde de pg_hba.conf : $backup"

try {
    # Seules les règles locales (socket, 127.0.0.1, ::1) passent en trust, et seulement le temps de l'opération.
    $content = [IO.File]::ReadAllText($hbaFile)
    $trusted = [regex]::Replace($content, '(?m)^([ \t]*(?:local|host)[ \t].*?)\b(?:scram-sha-256|md5)(?=[ \t]*\r?$)', '${1}trust')
    [IO.File]::WriteAllText($hbaFile, $trusted, [Text.UTF8Encoding]::new($false))
    Restart-PostgreSQL
    Write-Host "Mode trust temporaire actif."

    $escaped = $newPassword.Replace("'", "''")
    & $psql -U $SuperUser -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE $SuperUser WITH PASSWORD '$escaped';" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Impossible de modifier le mot de passe de $SuperUser." }
    Write-Host "Mot de passe de '$SuperUser' modifié."
}
finally {
    Copy-Item $backup $hbaFile -Force
    Restart-PostgreSQL
    Write-Host "pg_hba.conf d'origine restauré (scram-sha-256)."
}

# Vérifie le nouveau mot de passe en conditions normales et crée le rôle + la base de TravelHub.
$env:PGPASSWORD = $newPassword
& (Join-Path $PSScriptRoot "create_database.ps1") -PsqlPath $psql -SuperUser $SuperUser
