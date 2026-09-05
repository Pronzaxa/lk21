$ErrorActionPreference = "Stop"

$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "app"))
$Address = [System.Net.IPAddress]::Loopback
$Port = 4173

while ($Port -lt 4193) {
  try {
    $Listener = [System.Net.Sockets.TcpListener]::new($Address, $Port)
    $Listener.Start()
    break
  } catch {
    $Port += 1
  }
}

if (-not $Listener.Server.IsBound) {
  throw "Tidak menemukan port lokal yang tersedia."
}

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".mjs" = "text/javascript; charset=utf-8"
  ".wasm" = "application/wasm"
  ".onnx" = "application/octet-stream"
  ".css" = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg" = "image/svg+xml"
  ".png" = "image/png"
  ".ico" = "image/x-icon"
  ".woff2" = "font/woff2"
}

$Url = "http://127.0.0.1:$Port/"
Write-Host ""
Write-Host "nuRESQ siap digunakan" -ForegroundColor Yellow
Write-Host $Url -ForegroundColor Cyan
Write-Host "Biarkan jendela ini terbuka. Tekan Ctrl+C untuk menutup nuRESQ."
Start-Process $Url

try {
  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = [System.IO.StreamReader]::new($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $RequestLine = $Reader.ReadLine()
      while (($HeaderLine = $Reader.ReadLine()) -ne $null -and $HeaderLine -ne "") { }

      if ([string]::IsNullOrWhiteSpace($RequestLine)) { continue }
      $Parts = $RequestLine.Split(" ")
      $RequestedPath = [System.Uri]::UnescapeDataString(($Parts[1].Split("?")[0]))
      if ($RequestedPath -eq "/") { $RequestedPath = "/index.html" }

      $RelativePath = $RequestedPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
      $FilePath = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))
      $Allowed = $FilePath.StartsWith($Root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)

      if (-not $Allowed -or -not [System.IO.File]::Exists($FilePath)) {
        $Status = "404 Not Found"
        $Body = [System.Text.Encoding]::UTF8.GetBytes("nuRESQ: berkas tidak ditemukan")
        $ContentType = "text/plain; charset=utf-8"
      } else {
        $Status = "200 OK"
        $Body = [System.IO.File]::ReadAllBytes($FilePath)
        $Extension = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
        $ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { "application/octet-stream" }
      }

      $Headers = "HTTP/1.1 $Status`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
      $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Headers)
      $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
      $Stream.Write($Body, 0, $Body.Length)
      $Stream.Flush()
    } catch {
      Write-Host "Permintaan dilewati: $($_.Exception.Message)" -ForegroundColor DarkGray
    } finally {
      $Client.Close()
    }
  }
} finally {
  $Listener.Stop()
}
