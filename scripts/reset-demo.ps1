<#
.SYNOPSIS
    Recrée les données de démonstration en production (Neon), la veille de la démo.

.DESCRIPTION
    Le script enchaîne les étapes de « Données de démonstration en production » du README.
    1. Il lit l'URL de la base de production avec la CLI Neon, sans l'afficher.
    2. Il fait une sauvegarde avec backup.ps1 (backups\travelhub-neon_AAAAMMJJ-HHMMSS.dump).
       Si la sauvegarde échoue, il s'arrête avant de toucher à la base.
    3. Il demande deux fois le mot de passe des comptes de démo, sans l'afficher. Ce mot de
       passe doit être différent de celui du README, qui est public.
    4. Il lance seed_demo --reset, puis supprime les comptes e2e-prod-… laissés par le
       parcours Playwright de production (e2e/production.spec.ts).

    Le mot de passe passe seulement par la variable DEMO_PASSWORD, pendant la commande.
    Ensuite, il reste à supprimer les cookies dans chaque navigateur et à renvoyer l'image
    de couverture (voir le README).

.EXAMPLE
    .\scripts\reset-demo.ps1
#>
param(
    [string]$Branch = "production",
    [string]$DatabaseName = "travelhub",
    [string]$Role = "travelhub_owner"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
# Mot de passe publié dans le README : il ne doit ouvrir aucun compte en production.
$readmePassword = "MotDePasseDemo-2026"

# Lance un programme externe et échoue si son code de sortie n'est pas 0. Ce qu'il écrit sur
# la sortie d'erreur n'est pas bloquant (Django y écrit ses journaux JSON).
function Invoke-Native {
    param([string]$FilePath, [string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $FilePath @Arguments }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw "$(Split-Path $FilePath -Leaf) a échoué (code $LASTEXITCODE)." }
}

# Texte d'un SecureString. La copie en mémoire non gérée est effacée tout de suite.
function ConvertFrom-Secure([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

if (-not (Test-Path $python)) { throw "Environnement virtuel introuvable : $python" }
if (-not (Get-Command neon -ErrorAction SilentlyContinue)) {
    throw "CLI Neon introuvable. Installez-la avec npm install -g neon, puis lancez neon login."
}

Write-Host "Ce script remplace les données de démonstration de la PRODUCTION." -ForegroundColor Yellow
Write-Host "Les voyages ajoutés pendant les répétitions seront supprimés."
if ((Read-Host "Tapez RESET pour continuer") -cne "RESET") {
    Write-Host "Rien n'a été modifié."
    exit 1
}

$password = ConvertFrom-Secure (Read-Host "Mot de passe des comptes de démo" -AsSecureString)
$confirmation = ConvertFrom-Secure (Read-Host "Encore une fois" -AsSecureString)
if ($password -cne $confirmation) { throw "Les deux mots de passe sont différents. Rien n'a été modifié." }
if ($password.Length -lt 8) { throw "Le mot de passe doit avoir 8 caractères au moins. Rien n'a été modifié." }
if ($password -ceq $readmePassword) { throw "Ce mot de passe est publié dans le README. Choisissez-en un autre." }

Push-Location $projectRoot
$previousUrl = $env:DATABASE_URL
try {
    $env:DATABASE_URL = (neon connection-string $Branch --database-name $DatabaseName --role-name $Role --ssl require | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $env:DATABASE_URL) { throw "La CLI Neon n'a pas donné l'URL de la base (neon login ?)." }
    Write-Host "Base : $(([Uri]$env:DATABASE_URL).Host)"

    # 1. Sauvegarde. backup.ps1 lève une erreur si pg_dump échoue : on s'arrête alors ici.
    & (Join-Path $PSScriptRoot "backup.ps1")

    # 2. Données de démonstration, avec les dates du jour.
    $env:DEMO_PASSWORD = $password
    Invoke-Native $python @("manage.py", "seed_demo", "--reset")

    # 3. Comptes du parcours Playwright de production. CASCADE supprime aussi leurs voyages.
    Invoke-Native $python @("manage.py", "shell", "-c",
        "from django.contrib.auth import get_user_model; n, _ = get_user_model().objects.filter(username__startswith='e2e-prod-').delete(); print(f'Comptes e2e-prod supprimés (avec leurs objets) : {n}')")
}
finally {
    $env:DATABASE_URL = $previousUrl
    Remove-Item Env:DEMO_PASSWORD -ErrorAction SilentlyContinue
    $password = $null
    $confirmation = $null
    Pop-Location
}

Write-Host ""
Write-Host "Données de démonstration recréées." -ForegroundColor Green
Write-Host "Il reste à faire, dans le navigateur :"
Write-Host "  1. se déconnecter et supprimer les cookies de travelhub-uqar.vercel.app (th_access, th_refresh) ;"
Write-Host "  2. se connecter avec alice et renvoyer l'image de couverture sur « Automne à Paris »."
