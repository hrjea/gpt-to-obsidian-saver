@echo off
setlocal
set "SCRIPT_DIR=%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%SCRIPT_DIR%native-open-obsidian.py" %*
  exit /b %ERRORLEVEL%
)

where python >nul 2>nul
if not errorlevel 1 (
  python "%SCRIPT_DIR%native-open-obsidian.py" %*
  exit /b %ERRORLEVEL%
)

echo Python 3 not found. Install Python 3 and rerun the installer. 1>&2
exit /b 1
