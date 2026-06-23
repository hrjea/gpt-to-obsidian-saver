param(
  [ValidateSet("chrome")]
  [string]$Browser = "chrome"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$HostName = "com.gpt_obsidian_saver.open_direct"
$RegistryPath = "Software\Google\Chrome\NativeMessagingHosts\$HostName"

try {
  [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($RegistryPath, $false)
  Write-Host "Removed registry key: HKCU:\$RegistryPath"
} catch {
  Write-Host "Registry key was already absent: HKCU:\$RegistryPath"
}

$LocalAppData = $env:LOCALAPPDATA
if (-not $LocalAppData) {
  $LocalAppData = Join-Path $HOME "AppData\Local"
}

$HelperDir = Join-Path $LocalAppData "GPTObsidianSaver\native-host"
if (Test-Path $HelperDir) {
  Remove-Item -Recurse -Force $HelperDir
  Write-Host "Removed helper directory: $HelperDir"
} else {
  Write-Host "Helper directory was already absent: $HelperDir"
}

Write-Host "User Obsidian vaults and notes were not touched."
