param(
 [Parameter(Mandatory=$true)][string]$UpdateRoot,
 [Parameter(Mandatory=$true)][string]$InstallRoot,
 [Parameter(Mandatory=$true)][string]$VersionDirectory,
 [ValidateSet('Stage','Commit')][string]$Mode='Stage',
 [string]$DesktopPath=[Environment]::GetFolderPath('Desktop'),
 [string]$StartMenuPath=(Join-Path ([Environment]::GetFolderPath('Programs')) 'AmirahCo CLI')
)
$ErrorActionPreference='Stop'
if($VersionDirectory -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$'){throw 'Invalid update directory.'}
$package=Join-Path $UpdateRoot 'unpacked'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $UpdateRoot 'package.zip'))
try {
 if($zip.Entries.Count -ne 4){throw 'Unexpected update package entries.'}
 $allowed=@('payload.zip','install.ps1','install.cmd','README.txt')
 foreach($entry in $zip.Entries){
  if($entry.FullName -notin $allowed -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'Unsafe update package.'}
  if($entry.Length -gt 650MB){throw 'Update package entry exceeded limit.'}
 }
 if(@($zip.Entries.FullName | Select-Object -Unique).Count -ne 4){throw 'Duplicate update package entries.'}
 New-Item -ItemType Directory -Path $package -Force | Out-Null
 foreach($entry in $zip.Entries){[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $package $entry.FullName),$true)}
} finally {$zip.Dispose()}
$desktop=Join-Path $UpdateRoot 'preview-desktop'
$menu=Join-Path $UpdateRoot 'preview-menu'
if($Mode -eq 'Commit'){
 $desktop=$DesktopPath
 $menu=$StartMenuPath
}
$receipt=Join-Path $UpdateRoot ($Mode+'.json')
& (Join-Path $package 'install.ps1') -InstallRoot $InstallRoot -DesktopPath $desktop -StartMenuPath $menu -ReceiptPath $receipt
if(-not (Test-Path -LiteralPath $receipt)){throw 'Installer did not return a receipt.'}
$result=Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
$expected=[IO.Path]::GetFullPath((Join-Path $InstallRoot $VersionDirectory))
if($result.state -ne 'installed' -or [IO.Path]::GetFullPath($result.application) -ne $expected){throw 'Installer receipt differs from approved update.'}
