$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRoot = Split-Path $sourceRoot -Parent
$releaseRoot = Join-Path $sourceRoot ('release-staging/' + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$excluded = @('node_modules','.ml-venv','.git','.next','.wrangler','.openai','.sites-runtime','dist','portable-dist','release-staging','data','__pycache__','.cache')
function Copy-SourceTree([string]$from,[string]$to) {
  New-Item -ItemType Directory -Path $to -Force | Out-Null
  foreach($entry in Get-ChildItem -LiteralPath $from -Force) {
    if($entry.PSIsContainer) {
      if($entry.Name -notin $excluded){ Copy-SourceTree $entry.FullName (Join-Path $to $entry.Name) }
    } elseif($entry.Name -notmatch '^(\.env($|\.(?!example$))|encoder-fp32\.onnx)' -and $entry.Name -notmatch '\.(sqlite|db|log|tsbuildinfo|zip)$') {
      Copy-Item -LiteralPath $entry.FullName -Destination (Join-Path $to $entry.Name)
    }
  }
}
Copy-SourceTree $sourceRoot (Join-Path $releaseRoot 'SOURCE-CODE')
Copy-Item -LiteralPath (Join-Path $sourceRoot 'portable-dist') -Destination (Join-Path $releaseRoot 'PORTABLE') -Recurse
Copy-Item -LiteralPath (Join-Path $sourceRoot 'HYBRID_RELEASE_NOTES.md') -Destination (Join-Path $releaseRoot 'MULAI-DI-SINI.md')
$portableTarget = Join-Path $projectRoot 'PORTABLE'
if(Test-Path -LiteralPath $portableTarget) {
  $backup = Join-Path $projectRoot ('PORTABLE-before-hybrid-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Copy-Item -LiteralPath $portableTarget -Destination $backup -Recurse
  Write-Output "Portable backup: $backup"
}
New-Item -ItemType Directory -Path $portableTarget -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'portable-dist') -Force | Copy-Item -Destination $portableTarget -Recurse -Force
$zipTarget = Join-Path $projectRoot 'nuRESQ-SmolLM2-GGUF-LocalAI-v2.zip'
if(Test-Path -LiteralPath $zipTarget){throw 'Release ZIP already exists; preserve it and choose another version.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($releaseRoot,$zipTarget,[IO.Compression.CompressionLevel]::Optimal,$false)
Write-Output "Release ZIP: $zipTarget"
