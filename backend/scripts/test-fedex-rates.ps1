# Test FedEx FDS WS — sprawdza, czy pobierzDostepneUslugi zwraca już ceny
# Uruchom: powershell -File backend\scripts\test-fedex-rates.ps1 [-PostalCode 00-001]

param(
    [string]$PostalCode = "00-001",
    [string]$EnvFile = "D:\stojan-shop-new\backend\.env"
)

# Wczytaj .env (bez wyświetlania)
if (-not (Test-Path $EnvFile)) {
    Write-Host "BRAK PLIKU .env: $EnvFile" -ForegroundColor Red
    exit 1
}

$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $key = $matches[1]
        $val = $matches[2].Trim('"').Trim("'")
        $envVars[$key] = $val
    }
}

$accessCode = $envVars['FEDEX_FDS_ACCESS_CODE']
$soapUrl    = if ($envVars['FEDEX_FDS_SOAP_URL']) { $envVars['FEDEX_FDS_SOAP_URL'] } else { 'https://poland.fedex.com/fdsWs/IklServicePort' }

if ([string]::IsNullOrWhiteSpace($accessCode)) {
    Write-Host "BRAK FEDEX_FDS_ACCESS_CODE w .env" -ForegroundColor Red
    exit 1
}

Write-Host "Endpoint  : $soapUrl"
Write-Host "AccessCode: (ustawiony, $($accessCode.Length) znakow)"
Write-Host "PostalCode: $PostalCode"
Write-Host ""

$envelope = @"
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.alfaprojekt.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:pobierzDostepneUslugi>
      <accessCode>$accessCode</accessCode>
      <postalCode>$PostalCode</postalCode>
    </ws:pobierzDostepneUslugi>
  </soapenv:Body>
</soapenv:Envelope>
"@

Write-Host "=== WYSYLAM REQUEST (bez accessCode w logu) ===" -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri $soapUrl -Method Post `
        -Headers @{ "SOAPAction" = ""; "Content-Type" = "text/xml; charset=utf-8" } `
        -Body $envelope -UseBasicParsing -TimeoutSec 30

    Write-Host "HTTP Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== SUROWA ODPOWIEDZ XML ===" -ForegroundColor Cyan
    Write-Host $resp.Content
}
catch {
    Write-Host "BLAD HTTP: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "Response body:" -ForegroundColor Yellow
        Write-Host $body
    }
}
