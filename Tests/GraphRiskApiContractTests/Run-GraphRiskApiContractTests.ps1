param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$BearerToken
)
$ErrorActionPreference = 'Stop'
$uri = $BaseUrl.TrimEnd('/') + '/api/Audit/graph-risk/analyze'
$headers = @{ Authorization = 'Bearer ' + $BearerToken }
$script:passed = 0
function Invoke-Case([object]$payload) {
  $json = ConvertTo-Json -InputObject $payload -Depth 30 -Compress
  try {
    $response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -UseBasicParsing
    return @{ Status = [int]$response.StatusCode; Body = ($response.Content | ConvertFrom-Json); Raw = $json }
  } catch {
    $response = $_.Exception.Response
    if ($null -eq $response) { throw "Cannot reach API: $($_.Exception.Message)" }
    return @{ Status = [int]$response.StatusCode; Body = $null; Raw = $json }
  }
}
function Check([bool]$condition, [string]$message) {
  if (-not $condition) { throw "FAIL: $message" }
  $script:passed++
  Write-Host "PASS: $message" -ForegroundColor Green
}
function Node([string]$id, [int]$risk) { return @{ id=$id; type=0; displayLabel=$id; riskScore=$risk; properties=@{} } }
function Edge([string]$source, [string]$target, [double]$weight=1) { return @{ sourceId=$source; targetId=$target; predicate='RELATED'; weight=$weight; metadata=@{} } }
function Payload([object[]]$nodes, [object[]]$edges) {
  return @{ graph=@{ rootEntityId='A'; exploredDepth=1; nodes=@($nodes); edges=@($edges) }; maxHops=3; decay=0.5; influenceCap=25 }
}
$valid = Payload @((Node 'A' 90),(Node 'B' 10)) @((Edge 'A' 'B'))
$r = Invoke-Case $valid
if ($r.Status -eq 401 -or $r.Status -eq 403) { throw "Token lacks AuditRead permission (HTTP $($r.Status))." }
Check ($r.Status -eq 200) 'valid graph returns HTTP 200'
Check ($null -ne $r.Body.baseline -and $null -ne $r.Body.propagation) 'baseline and propagation present'
Check (@($r.Body.baseline).Count -eq 2 -and @($r.Body.propagation).Count -eq 2) 'two nodes in both outputs'
Check (-not [string]::IsNullOrWhiteSpace($r.Body.scoringVersion) -and -not [string]::IsNullOrWhiteSpace($r.Body.propagationVersion)) 'algorithm versions present'
Check (-not [string]::IsNullOrWhiteSpace($r.Body.disclaimer)) 'investigative disclaimer present'
$r2 = Invoke-Case $valid
Check ($r2.Status -eq 200 -and (ConvertTo-Json $r.Body -Depth 30 -Compress) -ceq (ConvertTo-Json $r2.Body -Depth 30 -Compress)) 'repeatability of response'
$bad = Payload @((Node 'A' 10),(Node 'A' 20)) @()
Check ((Invoke-Case $bad).Status -eq 400) 'duplicate node IDs rejected'
$bad = Payload @((Node 'A' 10)) @((Edge 'A' 'missing'))
Check ((Invoke-Case $bad).Status -eq 400) 'dangling edge rejected'
$bad = Payload @((Node 'A' 10),(Node 'B' 20)) @((Edge 'A' 'B' 0))
Check ((Invoke-Case $bad).Status -eq 400) 'zero edge weight rejected'
$bad = Payload @((Node 'A' 101)) @()
Check ((Invoke-Case $bad).Status -eq 400) 'out-of-range risk rejected'
$bad = Payload @((Node 'A' 10)) @()
$bad.maxHops = 0
Check ((Invoke-Case $bad).Status -eq 400) 'invalid max hops rejected'
$bad = Payload @((Node 'A' 10)) @()
$bad.decay = 1
Check ((Invoke-Case $bad).Status -eq 400) 'invalid decay rejected'
$bad = Payload @((Node 'A' 10)) @()
$bad.influenceCap = 101
Check ((Invoke-Case $bad).Status -eq 400) 'invalid influence cap rejected'
$bad = Payload @((Node 'A' 10)) @()
$bad.graph.nodes = @(); for ($i=0; $i -lt 501; $i++) { $bad.graph.nodes += (Node "N$i" 10) }
Check ((Invoke-Case $bad).Status -eq 400) 'node limit enforced'
Write-Host "PASS: $script:passed API contract assertions" -ForegroundColor Green
