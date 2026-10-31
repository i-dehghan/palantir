param([Parameter(Mandatory=$true)][string]$BaseUrl,[Parameter(Mandatory=$true)][string]$BearerToken,[string]$Scenario='chain')
$ErrorActionPreference='Stop'
if ($Scenario -notin @('isolated','chain','star','communities','cycle','weighted_bridge')) { throw 'Unknown scenario' }
$path=Join-Path $PSScriptRoot ('fixtures/'+$Scenario+'.json')
if (!(Test-Path $path)) { throw 'Generate fixtures with python first' }
$uri=$BaseUrl.TrimEnd('/')+'/api/Audit/graph-risk/analyze'
$body=[System.IO.File]::ReadAllBytes($path)
$r=Invoke-RestMethod -Uri $uri -Method Post -Headers @{Authorization=('Bearer '+$BearerToken)} -ContentType 'application/json' -Body $body
if ($null -eq $r.baseline -or $null -eq $r.propagation) { throw 'Missing expected API results' }
Write-Host "PASS: $Scenario; baseline=$(@($r.baseline).Count); propagation=$(@($r.propagation).Count)" -ForegroundColor Green
$r | ConvertTo-Json -Depth 30
