# 이미지형 기출 PDF를 Windows 내장 OCR(한국어)로 읽어 텍스트로 저장(분석용, 결과는 git 제외 폴더)
# 사용: powershell -ExecutionPolicy Bypass -File scripts/ocr-pdf.ps1 -Dir exam-pdfs -Rounds 57,59
param(
  [string]$Dir = 'exam-pdfs',
  [string]$Rounds = ""
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfPageRenderOptions, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

$asTaskOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskAct = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function Wait-Op($op, [Type]$t) { $task = $asTaskOp.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
function Wait-Act($act) { $task = $asTaskAct.Invoke($null, @($act)); $task.Wait(-1) | Out-Null }

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ko'))
if (-not $engine) { throw 'Korean OCR not available' }
$outDir = Join-Path $Dir 'text'
New-Item -ItemType Directory -Force $outDir | Out-Null

foreach ($r in ($Rounds -split "[, ]+" | Where-Object { $_ })) {
  $path = (Resolve-Path (Join-Path $Dir "$r-q.pdf")).Path
  $file = Wait-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $doc = Wait-Op ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
  $sb = New-Object System.Text.StringBuilder
  for ($i = 0; $i -lt $doc.PageCount; $i++) {
    $page = $doc.GetPage($i)
    $opts = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
    $w = [Math]::Min(2400, [int]($page.Size.Width * 2.6))
    $opts.DestinationWidth = $w
    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    Wait-Act ($page.RenderToStreamAsync($stream, $opts))
    $decoder = Wait-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Wait-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Wait-Op ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $half = $bmp.PixelWidth / 2
    $lines = foreach ($ln in $res.Lines) {
      $x = ($ln.Words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
      $y = ($ln.Words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
      $col = if ($x -lt $half) { 0 } else { 1 }
      [pscustomobject]@{ col = $col; y = [int]$y; text = $ln.Text }
    }
    [void]$sb.AppendLine("=== PAGE $($i + 1) ===")
    foreach ($l in ($lines | Sort-Object col, y)) { [void]$sb.AppendLine($l.text) }
    $page.Dispose()
  }
  $outPath = Join-Path $outDir "$r-q.txt"
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) $outPath), $sb.ToString(), [System.Text.Encoding]::UTF8)
  Write-Output "$r-q OCR $($doc.PageCount) pages, $($sb.Length) chars"
}
