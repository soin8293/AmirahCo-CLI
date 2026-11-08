[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BaseArchive,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $OutputDirectory){$OutputDirectory=Join-Path $source 'dist\windows'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
$package=Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
$policy=Get-Content -LiteralPath (Join-Path $source 'assets\update-policy.json') -Raw | ConvertFrom-Json
$base=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime-base.json') -Raw | ConvertFrom-Json
if($package.version -notmatch '^\d+\.\d+\.\d+$' -or $policy.sequence -lt 1){throw 'Invalid release identity.'}
$version=$package.version+'-pilot.'+$policy.sequence
$stem='AmirahCoCLI-Pilot-'+$package.version+'-r'+$policy.sequence+'-Windows-x64'
if(Test-Path -LiteralPath (Join-Path $output ($stem+'.exe'))){throw 'Candidate already exists. Choose a fresh output directory.'}
if((Get-FileHash -LiteralPath $BaseArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $base.sha256){throw 'Runtime base checksum mismatch.'}
foreach($file in @('dist\cli.mjs','dist\sdk.mjs')){if(-not(Test-Path -LiteralPath (Join-Path $source $file))){throw 'Build the CLI/SDK before packaging.'}}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('amr-package-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage,$output -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$outer=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($BaseArchive))
try {
 $entry=$outer.GetEntry('payload.zip');if(-not $entry){throw 'Runtime base payload missing.'}
 [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $stage 'payload.zip'))
} finally {$outer.Dispose()}
$payload=Join-Path $stage 'payload.zip'
if((Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $base.payloadSha256){throw 'Runtime payload mismatch.'}
$zip=[IO.Compression.ZipFile]::Open($payload,[IO.Compression.ZipArchiveMode]::Update)
try {
 $manifestEntry=$zip.GetEntry('bundle-manifest.json')
 $reader=New-Object IO.StreamReader($manifestEntry.Open())
 try{$manifest=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
 $rows=@{};foreach($row in $manifest.files){$rows[$row.path]=$row}
 $files=@('dist/cli.mjs','dist/sdk.mjs','package.json','LICENSE','LICENSE-AMIRAHCO','LICENSE-SCOPE.md')
 foreach($folder in @('bin','assets','vendor')){
  $files+=Get-ChildItem -LiteralPath (Join-Path $source $folder) -File -Recurse | Where-Object {$_.FullName -notmatch '[\\/]__pycache__[\\/]|\.py[co]$|\.test\.[cm]?js$'} | ForEach-Object {$_.FullName.Substring($source.Length+1).Replace('\','/')}
 }
 foreach($file in $files){
  $path=Join-Path $source $file
  $hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  $old=$zip.GetEntry('app/'+$file);if($old){$old.Delete()}
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$path,('app/'+$file),[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  $rows[$file]=[pscustomobject]@{path=$file;sha256=$hash;bytes=(Get-Item -LiteralPath $path).Length}
 }
 $manifest.version=$version;$manifest.files=@($rows.Values | Sort-Object path)
 $body=($manifest | ConvertTo-Json -Depth 8)+[Environment]::NewLine
 $manifestEntry.Delete();$entry=$zip.CreateEntry('bundle-manifest.json')
 $writer=New-Object IO.StreamWriter($entry.Open(),(New-Object Text.UTF8Encoding($false)))
 try{$writer.Write($body)}finally{$writer.Dispose()}
 [IO.File]::WriteAllText((Join-Path $output 'bundle-manifest.json'),$body,(New-Object Text.UTF8Encoding($false)))
} finally {$zip.Dispose()}
$payloadHash=(Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant()
$installer=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'install-template.ps1') -Raw).Replace('PAYLOAD_SHA256',$payloadHash).Replace('INSTALL_VERSION',$version)
[IO.File]::WriteAllText((Join-Path $stage 'install.ps1'),$installer,(New-Object Text.UTF8Encoding($true)))
[IO.File]::WriteAllText((Join-Path $stage 'install.cmd'),"@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0install.ps1`"`r`nif errorlevel 1 pause`r`n",[Text.Encoding]::ASCII)
$setup=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Setup.cs') -Raw).Replace('PAYLOAD_SHA256',$payloadHash).Replace('1.0.0.0',($package.version+'.0'))
[IO.File]::WriteAllText((Join-Path $stage 'Setup.cs'),$setup)
$exe=Join-Path $output ($stem+'.exe')
$compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /reference:System.Windows.Forms.dll ('/out:'+$exe) ('/win32icon:'+(Join-Path $source 'assets\app-icons\amirahco-cli.ico')) ('/win32manifest:'+(Join-Path $PSScriptRoot 'setup.manifest')) ('/resource:'+$payload+',AmirahCo.payload.zip') ('/resource:'+(Join-Path $stage 'install.ps1')+',AmirahCo.install.ps1') ('/resource:'+(Join-Path $stage 'install.cmd')+',AmirahCo.install.cmd') (Join-Path $stage 'Setup.cs')
if($LASTEXITCODE -ne 0){throw 'Windows bootstrap compilation failed.'}
$archive=Join-Path $output ($stem+'.zip')
$zip=[IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach($name in @('payload.zip','install.ps1','install.cmd')){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $stage $name),$name,[IO.Compression.CompressionLevel]::NoCompression) | Out-Null}
 $entry=$zip.CreateEntry('README.txt');$writer=New-Object IO.StreamWriter($entry.Open())
 $updateStatus=if($policy.feed -and $policy.keys.Count -gt 0){'Signed update channel configured; use /update to check.'}else{'Update channel inactive; install a reviewed successor manually.'}
 try{$writer.Write('AmirahCo CLI Windows prototype. Run install.cmd. Bring your own API key. Optional partner access is manually approved. Unsigned installer. '+$updateStatus)}finally{$writer.Dispose()}
} finally {$zip.Dispose()}
$artifacts=@($exe,$archive) | ForEach-Object {[pscustomobject]@{name=[IO.Path]::GetFileName($_);bytes=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
$artifacts | ForEach-Object {$_.sha256+'  '+$_.name} | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ASCII
@{version=$package.version;sequence=$policy.sequence;directory=$version;files=$artifacts;payloadSha256=$payloadHash;runtimeBaseSha256=$base.sha256;published=$false;feedConfigured=($null -ne $policy.feed)} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $output 'package-receipt.json') -Encoding UTF8
Write-Output ('Prepared unpublished candidate: '+$exe)
