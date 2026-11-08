param([Parameter(Mandatory=$true)][string]$ProtectedKey)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
Add-Type -AssemblyName System.Security
$bytes=[IO.File]::ReadAllBytes([IO.Path]::GetFullPath($ProtectedKey))
$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))}finally{[Array]::Clear($plain,0,$plain.Length)}
