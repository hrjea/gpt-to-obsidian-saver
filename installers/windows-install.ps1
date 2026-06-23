param(
  [Parameter(Mandatory = $true)]
  [Alias("ExtensionId")]
  [string]$ExtensionIdValue,

  [ValidateSet("chrome")]
  [string]$Browser = "chrome"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$HostName = "com.gpt_obsidian_saver.open_direct"

if ($ExtensionIdValue -notmatch '^[a-p]{32}$') {
  throw "Invalid Chrome extension ID: $ExtensionIdValue. Expected 32 lowercase characters in the range a-p."
}

$pythonCommand = Get-Command py -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
}
if (-not $pythonCommand) {
  throw "Python 3 was not found. Install Python 3, then rerun this installer."
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$SourceDir = Join-Path $RepoRoot "native-host"
$SourcePy = Join-Path $SourceDir "native-open-obsidian.py"
$SourceCmd = Join-Path $SourceDir "native-open-obsidian.cmd"
$Template = Join-Path $SourceDir "$HostName.json.template"

if (-not (Test-Path $SourcePy) -or -not (Test-Path $SourceCmd) -or -not (Test-Path $Template)) {
  throw "Native host source files are missing from $SourceDir."
}

$LocalAppData = $env:LOCALAPPDATA
if (-not $LocalAppData) {
  $LocalAppData = Join-Path $HOME "AppData\Local"
}

$InstallDir = Join-Path $LocalAppData "GPTObsidianSaver\native-host"
$ManifestPath = Join-Path $InstallDir "$HostName.json"
$HostPath = Join-Path $InstallDir "native-open-obsidian.cmd"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Force $SourcePy (Join-Path $InstallDir "native-open-obsidian.py")
Copy-Item -Force $SourceCmd $HostPath

$HostPathJson = $HostPath | ConvertTo-Json -Compress
$HostPathEscaped = $HostPathJson.Substring(1, $HostPathJson.Length - 2)
$ManifestText = Get-Content -Raw -Encoding UTF8 $Template
$ManifestText = $ManifestText.Replace("__HOST_PATH__", $HostPathEscaped)
$ManifestText = $ManifestText.Replace("__EXTENSION_ID__", $ExtensionIdValue)
$null = $ManifestText | ConvertFrom-Json

$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[System.IO.File]::WriteAllText($ManifestPath, $ManifestText + [Environment]::NewLine, $Utf8NoBom)

$RegistryPath = "Software\Google\Chrome\NativeMessagingHosts\$HostName"
$RegistryKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($RegistryPath)
if (-not $RegistryKey) {
  throw "Could not create HKCU:\$RegistryPath."
}
$RegistryKey.SetValue("", $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String)
$RegistryKey.Close()

Write-Host "GPT -> Obsidian Saver native host installed."
Write-Host "Helper: $HostPath"
Write-Host "Native host manifest: $ManifestPath"
Write-Host "Registry key: HKCU:\$RegistryPath"
Write-Host "Extension ID: $ExtensionIdValue"
