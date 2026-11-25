<#
.SYNOPSIS
    Réveille l'API de production et vérifie sa configuration, avant la démo et avant la correction.

.DESCRIPTION
    Le script n'utilise aucun mot de passe et ne modifie rien. Il appelle seulement des adresses
    publiques avec curl.exe (fourni avec Windows 10 et 11) :
    1. /health/ de l'API, en attendant le réveil de Render (environ une minute) ;
    2. une route inconnue, qui doit répondre 404 en JSON (DEBUG absent, sinon page HTML) ;
    3. l'en-tête HSTS de l'API (HTTPS forcé) ;
    4. le CORS : l'origine Vercel est acceptée, une autre origine est refusée ;
    5. le mot de passe de démo du README, qui doit être refusé en production ;
    6. la page /login de Vercel et ses en-têtes de sécurité ;
    7. /dashboard sans cookie, qui doit rediriger vers /login.

    Une ligne OK ou ÉCHEC s'affiche par vérification. Le code de sortie est 1 si une
    vérification échoue. Il reste à ouvrir le projet Supabase et à se connecter une fois dans
    le navigateur (voir « Avant la démo et avant la correction » dans le README).

.EXAMPLE
    .\scripts\check-production.ps1
#>
param(
    [string]$ApiUrl = "https://travelhub-uqar-api.onrender.com",
    [string]$SiteUrl = "https://travelhub-uqar.vercel.app",
    [ValidateRange(10, 300)]
    [int]$WakeTimeout = 120
)

$ErrorActionPreference = "Stop"
$ApiUrl = $ApiUrl.TrimEnd("/")
$SiteUrl = $SiteUrl.TrimEnd("/")
# Mot de passe publié dans le README : il ne doit ouvrir aucun compte en production.
$readmePassword = "MotDePasseDemo-2026"
$failures = 0

# Appelle une adresse avec curl.exe. Renvoie le statut, les en-têtes (noms en minuscules) et le corps.
function Invoke-Http {
    param([string]$Url, [string]$Method = "GET", [string[]]$Headers = @(), [string]$Body, [int]$Timeout = 30)
    $arguments = @("-s", "-i", "--max-time", $Timeout, "-X", $Method)
    foreach ($header in $Headers) { $arguments += @("-H", $header) }
    if ($Body) {
        # curl lit le corps dans un fichier, pour éviter les guillemets de PowerShell 5.1.
        $bodyFile = New-TemporaryFile
        [IO.File]::WriteAllText($bodyFile.FullName, $Body)
        $arguments += @("-H", "Content-Type: application/json", "--data-binary", "@$($bodyFile.FullName)")
    }
    try { $output = (& curl.exe @arguments $Url) -join "`n" }
    finally { if ($Body) { Remove-Item $bodyFile -Force } }

    $head, $content = $output -split "`n`r?`n", 2
    $lines = $head -split "`r?`n"
    $status = if ($lines[0] -match '^HTTP/\S+ (\d{3})') { [int]$Matches[1] } else { 0 }
    $headerTable = @{}
    foreach ($line in $lines | Select-Object -Skip 1) {
        $name, $value = $line -split ':\s*', 2
        if ($value) { $headerTable[$name.ToLowerInvariant()] = $value.Trim() }
    }
    [pscustomobject]@{ Status = $status; Headers = $headerTable; Body = "$content" }
}

function Write-Check([string]$Name, [bool]$Ok, [string]$Detail) {
    if ($Ok) { Write-Host "OK     $Name ($Detail)" -ForegroundColor Green }
    else {
        Write-Host "ÉCHEC  $Name ($Detail)" -ForegroundColor Red
        $script:failures++
    }
}

# 1. Réveil. Render gratuit s'endort après 15 minutes sans requête.
$watch = [Diagnostics.Stopwatch]::StartNew()
$health = Invoke-Http "$ApiUrl/health/" -Timeout $WakeTimeout
while ($health.Status -ne 200 -and $watch.Elapsed.TotalSeconds -lt $WakeTimeout) {
    Start-Sleep -Seconds 5
    $health = Invoke-Http "$ApiUrl/health/" -Timeout $WakeTimeout
}
$seconds = [math]::Round($watch.Elapsed.TotalSeconds)
Write-Check "API réveillée, base et cache" ($health.Status -eq 200 -and $health.Body -match '"database": "ok"') "HTTP $($health.Status) en $seconds s"

# 2. DEBUG absent : la page d'erreur de Django en mode DEBUG serait du HTML.
$missing = Invoke-Http "$ApiUrl/route-inconnue-verification/"
Write-Check "DEBUG absent (404 en JSON)" ($missing.Status -eq 404 -and $missing.Headers["content-type"] -like "application/json*") "HTTP $($missing.Status), $($missing.Headers['content-type'])"

# 3. HTTPS forcé par Django (SECURE_HSTS_SECONDS).
Write-Check "HSTS sur l'API" ([bool]$health.Headers["strict-transport-security"]) "$($health.Headers['strict-transport-security'])"

# 4. CORS. Une origine refusée reçoit aussi 200, mais sans access-control-allow-origin.
$preflight = @("Access-Control-Request-Method: POST")
$allowed = Invoke-Http "$ApiUrl/api/auth/token/" -Method OPTIONS -Headers ($preflight + "Origin: $SiteUrl")
Write-Check "CORS accepte $SiteUrl" ($allowed.Headers["access-control-allow-origin"] -eq $SiteUrl) "access-control-allow-origin : $($allowed.Headers['access-control-allow-origin'])"
$refused = Invoke-Http "$ApiUrl/api/auth/token/" -Method OPTIONS -Headers ($preflight + "Origin: https://site-refuse.example")
Write-Check "CORS refuse une autre origine" (-not $refused.Headers.ContainsKey("access-control-allow-origin")) "HTTP $($refused.Status)"

# 5. DEMO_PASSWORD de production différent de celui du README. Une seule tentative.
$login = Invoke-Http "$ApiUrl/api/auth/token/" -Method POST -Body "{`"username`": `"alice`", `"password`": `"$readmePassword`"}"
Write-Check "Mot de passe du README refusé" ($login.Status -eq 401) "HTTP $($login.Status)"

# 6. Front-end sur Vercel, avec les en-têtes de next.config.ts.
$page = Invoke-Http "$SiteUrl/login"
Write-Check "Vercel affiche /login" ($page.Status -eq 200 -and $page.Headers["x-frame-options"] -eq "DENY") "HTTP $($page.Status), X-Frame-Options : $($page.Headers['x-frame-options'])"

# 7. proxy.ts protège les pages : sans cookie, retour à la connexion.
$dashboard = Invoke-Http "$SiteUrl/dashboard"
Write-Check "/dashboard sans cookie redirige vers /login" ($dashboard.Status -eq 307 -and $dashboard.Headers["location"] -like "*/login?next=*") "HTTP $($dashboard.Status) vers $($dashboard.Headers['location'])"

if ($failures -gt 0) {
    Write-Host "$failures vérification(s) en échec." -ForegroundColor Red
    exit 1
}
Write-Host "Tout est en ordre. Il reste à ouvrir le projet Supabase et à se connecter une fois sur $SiteUrl." -ForegroundColor Green
