@echo off
setlocal DisableDelayedExpansion
if exist "%~dp0node.exe" (
  "%~dp0node.exe" "%~dp0amirahcocli" %*
) else (
  node.exe "%~dp0amirahcocli" %*
)
set "AMIRAHCO_LAUNCH_EXIT=%errorlevel%"
if "%AMIRAHCO_LAUNCH_EXIT%"=="9009" echo AmirahCo CLI needs native Windows Node.js 22 or newer on PATH. 1>&2
exit /b %AMIRAHCO_LAUNCH_EXIT%
