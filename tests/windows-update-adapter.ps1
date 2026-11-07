$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('amr-adapter-'+[Guid]::NewGuid().ToString('N'))
$updateRoot=Join-Path $fixture 'update'
$source=Join-Path $fixture 'package'
New-Item -ItemType Directory -Path $source,$updateRoot -Force | Out-Null
$installer=@'
param([string]$InstallRoot,[string]$DesktopPath,[string]$StartMenuPath,[string]$ReceiptPath)
$ErrorActionPreference='Stop'
$app=Join-Path $InstallRoot '1.0.1-fixture'
New-Item -ItemType Directory -Path $app,$DesktopPath,$StartMenuPath -Force | Out-Null
Set-Content -LiteralPath (Join-Path $app 'artifact.txt') -Value 'same approved fixture'
$shell=New-Object -ComObject WScript.Shell
foreach($path in @($DesktopPath,$StartMenuPath)){
 $link=$shell.CreateShortcut((Join-Path $path 'AmirahCo CLI Pilot.lnk'))
 $link.TargetPath=Join-Path $env:SystemRoot 'System32\cmd.exe'
 $link.Arguments='/d /c echo fixture'
 $link.Save()
}
@{state='installed';application=$app} | ConvertTo-Json | Set-Content -LiteralPath $ReceiptPath
'@
Set-Content -LiteralPath (Join-Path $source 'install.ps1') -Value $installer
foreach($name in @('install.cmd','payload.zip','README.txt')){Set-Content -LiteralPath (Join-Path $source $name) -Value 'fixture'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($source,(Join-Path $updateRoot 'package.zip'))
$installRoot=Join-Path $fixture 'Programs'
$desktop=Join-Path $fixture 'Desktop'
$menu=Join-Path $fixture 'StartMenu'
New-Item -ItemType Directory -Path $installRoot,$desktop,$menu | Out-Null
$sentinel=Join-Path $fixture 'unfinished-session.txt'
Set-Content -LiteralPath $sentinel -Value 'stopped; original session; pending requirement; unfinished task'
$before=(Get-FileHash -LiteralPath $sentinel).Hash
$adapter=Join-Path $repo 'bin\windows-update-install.ps1'
$argsForAdapter=@{UpdateRoot=$updateRoot;InstallRoot=$installRoot;VersionDirectory='1.0.1-fixture';DesktopPath=$desktop;StartMenuPath=$menu}
& $adapter @argsForAdapter -Mode Stage
if(Test-Path -LiteralPath (Join-Path $desktop 'AmirahCo CLI Pilot.lnk')){throw 'Stage changed live shortcut selection.'}
& $adapter @argsForAdapter -Mode Commit
& $adapter @argsForAdapter -Mode Commit
$shell=New-Object -ComObject WScript.Shell
foreach($folder in @($desktop,$menu)){
 $link=$shell.CreateShortcut((Join-Path $folder 'AmirahCo CLI Pilot.lnk'))
 if($link.Arguments -ne '/d /c echo fixture'){throw 'Shortcut commit/readback failed.'}
}
if((Get-FileHash -LiteralPath $sentinel).Hash -ne $before){throw 'Unfinished session changed.'}
@{status='passed';fixture=$fixture;stagePreservedLiveShortcuts=$true;repeatCommitPassed=$true;unfinishedSentinelPreserved=$true;ownerDesktopModified=$false;productionPayloadTest=$false} | ConvertTo-Json
