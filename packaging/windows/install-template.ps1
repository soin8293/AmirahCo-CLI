[CmdletBinding()]
param(
 [string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'Programs\AmirahCo CLI'),
 [string]$DesktopPath=[Environment]::GetFolderPath('Desktop'),
 [string]$StartMenuPath=(Join-Path ([Environment]::GetFolderPath('Programs')) 'AmirahCo CLI'),
 [string]$ReceiptPath
)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$version='INSTALL_VERSION'
$archive=Join-Path $PSScriptRoot 'payload.zip'
$expected='PAYLOAD_SHA256'
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Installer payload verification failed. Obtain an intact package from AmirahCo.'}
$installFull=[IO.Path]::GetFullPath($InstallRoot)
$versionPath=Join-Path $installFull $version
function Confirm-Payload([string]$AppPath,[object]$Manifest){
 foreach($file in $Manifest.files){
  $target=[IO.Path]::GetFullPath((Join-Path $AppPath $file.path))
  if(-not $target.StartsWith($AppPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Package path is outside the application folder.'}
  if(-not (Test-Path -LiteralPath $target -PathType Leaf)){throw 'An application file is missing.'}
  if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256){throw 'An application file did not match its manifest. Existing files were preserved.'}
 }
}
New-Item -ItemType Directory -Path $installFull -Force | Out-Null
$stagePath=Join-Path $installFull ('.install-'+[Guid]::NewGuid().ToString('N'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try{
 foreach($entry in $zip.Entries){
  $entryPath=[IO.Path]::GetFullPath((Join-Path $stagePath $entry.FullName))
  if(-not $entryPath.StartsWith($stagePath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe archive path.'}
  if((($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'Linked archive entries are not accepted.'}
 }
 $manifestEntry=$zip.GetEntry('bundle-manifest.json')
 if(-not $manifestEntry){throw 'Package manifest missing.'}
 $reader=New-Object IO.StreamReader($manifestEntry.Open())
 try{$manifest=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
}finally{$zip.Dispose()}
if(Test-Path -LiteralPath $versionPath){Confirm-Payload ([IO.Path]::GetFullPath($versionPath)) $manifest}
else{
 New-Item -ItemType Directory -Path $stagePath | Out-Null
 [IO.Compression.ZipFile]::ExtractToDirectory($archive,$stagePath)
 $stageApp=[IO.Path]::GetFullPath((Join-Path $stagePath 'app'))
 Confirm-Payload $stageApp $manifest
 if(-not $stageApp.StartsWith($installFull+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or -not $versionPath.StartsWith($installFull+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installation path check failed.'}
 Move-Item -LiteralPath $stageApp -Destination $versionPath
}
$launcher=Join-Path $versionPath 'bin\amirahcocli.cmd'
$icon=Join-Path $versionPath 'assets\app-icons\amirahco-cli.ico'
if(-not (Test-Path -LiteralPath $icon -PathType Leaf)){throw 'Application icon is missing. Existing shortcuts were preserved.'}
$shell=New-Object -ComObject WScript.Shell
foreach($folder in @($DesktopPath,$StartMenuPath)){
 New-Item -ItemType Directory -Path $folder -Force | Out-Null
 $shortcut=$shell.CreateShortcut((Join-Path $folder 'AmirahCo CLI Pilot.lnk'))
 $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\cmd.exe'
 $shortcut.Arguments='/d /c ""'+$launcher+'""'
 $shortcut.WorkingDirectory=$env:USERPROFILE
 $shortcut.IconLocation=$icon+',0'
 $shortcut.Description='Plan projects and work with an AI assistant in your terminal.'
 $shortcut.Save()
}
$result=[pscustomobject]@{state='installed';version=$version;application=$versionPath;desktopShortcut=(Join-Path $DesktopPath 'AmirahCo CLI Pilot.lnk');startMenuShortcut=(Join-Path $StartMenuPath 'AmirahCo CLI Pilot.lnk');shortcutIcon=$icon;existingProjectDataPreserved=$true;requiresAdministrator=$false;registryChanged=$false}
if($ReceiptPath){$result | ConvertTo-Json | Set-Content -LiteralPath $ReceiptPath}
Write-Host 'AmirahCo CLI Pilot is installed. Open its desktop shortcut to begin.'
