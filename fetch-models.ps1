param(
    [string]$ConfigPath = "opencode.json",
    [string]$ApiUrl = "https://api.cheaperinference.com/v1/models",
    [string]$ApiKey = "ci_live_dcf26823af76d611e5cf36a960cc392c6c8b8ba943c4229b"
)

$ErrorActionPreference = "Stop"

Write-Host "Fetching models from $ApiUrl ..." -ForegroundColor Cyan
$headers = @{ "Authorization" = "Bearer $ApiKey" }
$response = Invoke-RestMethod -Uri $ApiUrl -Headers $headers -Method Get
$models = $response.data

Write-Host "Found $($models.Count) models." -ForegroundColor Green

$existingJson = if (Test-Path $ConfigPath) {
    Get-Content $ConfigPath -Raw
} else {
    '{ "$schema": "https://opencode.ai/config.json", "provider": {} }'
}

$config = $existingJson | ConvertFrom-Json

if (-not $config.provider) {
    $config | Add-Member -NotePropertyName "provider" -NotePropertyValue ([PSCustomObject]@{}) -Force
}

if (-not $config.provider.'cheap') {
    $config.provider | Add-Member -NotePropertyName "cheap" -NotePropertyValue ([PSCustomObject]@{}) -Force
}

$cheap = $config.provider.'cheap'

if (-not $cheap.options) {
    $cheap | Add-Member -NotePropertyName "options" -NotePropertyValue ([PSCustomObject]@{}) -Force
}

$cheap.options | Add-Member -NotePropertyName "apiKey" -NotePropertyValue $ApiKey -Force
$cheap.options | Add-Member -NotePropertyName "baseURL" -NotePropertyValue "https://api.cheaperinference.com/v1" -Force

$modelsHash = [ordered]@{}
foreach ($m in $models) {
    $modelId = $m.id
    $mc = [ordered]@{ id = $modelId }

    if ($m.capabilities) {
        $caps = $m.capabilities
        if ($null -ne $caps.reasoning) { $mc.reasoning = [bool]$caps.reasoning }
        $inputMods = @()
        if ($caps.vision) { $inputMods += "image" }
        $inputMods += "text"
        $mc.modalities = @{ input = $inputMods; output = @("text") }
    }

    if ($m.pricing) {
        $p = $m.pricing
        $cost = @{}
        if ($p.input_per_million) { $cost.input = [double]$p.input_per_million }
        if ($p.output_per_million) { $cost.output = [double]$p.output_per_million }
        if ($p.cache_read_input_per_million) { $cost.cache_read = [double]$p.cache_read_input_per_million }
        if ($p.cache_write_input_per_million) { $cost.cache_write = [double]$p.cache_write_input_per_million }
        if ($cost.ContainsKey("input") -and $cost.ContainsKey("output")) { $mc.cost = $cost }
    }

    $lim = @{}
    if ($m.context_length) { $lim.context = [long]$m.context_length }
    if ($m.max_output_tokens) { $lim.output = [long]$m.max_output_tokens }
    if ($lim.Count -gt 0) { $mc.limit = $lim }

    $modelsHash[$modelId] = $mc
}

$cheap | Add-Member -NotePropertyName "models" -NotePropertyValue $modelsHash -Force

$json = $config | ConvertTo-Json -Depth 20
$json = $json -replace '\\u002f', '/'
$json = $json -replace '
', "`n"

[System.IO.File]::WriteAllText((Resolve-Path $ConfigPath).Path, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host "Successfully updated $ConfigPath with $($modelsHash.Count) models." -ForegroundColor Green
Write-Host "Restart opencode to apply changes." -ForegroundColor Yellow
