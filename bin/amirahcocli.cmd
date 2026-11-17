@echo off
setlocal DisableDelayedExpansion
set "_AMIRAHCO_LAUNCH_NODE=node.exe"
if exist "%~dp0node.exe" set "_AMIRAHCO_LAUNCH_NODE=%~dp0node.exe"
if exist "%~dp0windows-terminal-profile.mjs" (
  "%_AMIRAHCO_LAUNCH_NODE%" "%~dp0windows-terminal-profile.mjs" --launcher "%~f0" -- %*
  if errorlevel 10 goto native
  if errorlevel 1 exit /b 1
  exit /b 0
)
:native
if exist "%~dp0node.exe" (
  "%~dp0node.exe" "%~dp0amirahcocli" %*
) else (
  node.exe "%~dp0amirahcocli" %*
)
set "AMIRAHCO_LAUNCH_EXIT=%errorlevel%"
if "%AMIRAHCO_LAUNCH_EXIT%"=="9009" echo AmirahCo CLI needs native Windows Node.js 22 or newer on PATH. 1>&2
exit /b %AMIRAHCO_LAUNCH_EXIT%
