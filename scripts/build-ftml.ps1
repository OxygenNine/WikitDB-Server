param(
    [string]$SourceDir = $env:FTML_SOURCE_DIR,
    [string]$Version = '31566bbfa013a8e28cf9e35ba22c4ae6a75dabfa'
)

$ErrorActionPreference = 'Stop'

if (-not $SourceDir) {
    throw 'Set FTML_SOURCE_DIR or pass -SourceDir with an FTML checkout.'
}

$source = [System.IO.Path]::GetFullPath($SourceDir)
$project = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = Join-Path $project 'public\vendor\ftml'

Push-Location $source
try {
    git switch --detach $Version
    cargo update -p time --precise 0.3.44
    wasm-pack build --target web --release --out-dir $output --out-name ftml
    Remove-Item -LiteralPath (Join-Path $output '.gitignore') -Force -ErrorAction SilentlyContinue
} finally {
    Pop-Location
}
