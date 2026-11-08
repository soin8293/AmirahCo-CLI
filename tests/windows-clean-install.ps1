[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ReleaseDirectory,
 [Parameter(Mandatory=$true)][string]$FixtureRoot
)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
if(Test-Path -LiteralPath $FixtureRoot){throw 'Use a new fixture folder; existing work is never removed.'}
if(-not $FixtureRoot.Contains(' ')){throw 'The fixture path must contain spaces.'}
$release=[IO.Path]::GetFullPath($ReleaseDirectory)
$fixture=[IO.Path]::GetFullPath($FixtureRoot)
New-Item -ItemType Directory -Path $fixture | Out-Null
$checks=New-Object 'System.Collections.Generic.List[string]'
function Check([bool]$Condition,[string]$Name){if(-not $Condition){throw $Name};$checks.Add($Name)}
function Invoke-CommandLine([string]$Command,[string]$Arguments){
 $start=New-Object Diagnostics.ProcessStartInfo
 $start.FileName=$Command;$start.Arguments=$Arguments
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $process=[Diagnostics.Process]::Start($start)
 $output=$process.StandardOutput.ReadToEnd();$errorOutput=$process.StandardError.ReadToEnd()
 $process.WaitForExit()
 if($process.ExitCode -ne 0){throw ('Command failed: '+$output+$errorOutput)}
 return $output
}
try {
 $packages=@{}
 foreach($line in Get-Content -LiteralPath (Join-Path $release 'SHA256SUMS.txt')){
  if($line -match '^([a-fA-F0-9]{64})\s+\*?(.+)$'){
   $file=Join-Path $release $Matches[2]
   Check ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -eq $Matches[1]) ('Package checksum: '+$Matches[2])
   $packages[[IO.Path]::GetExtension($file)]=$file
  }
 }
 Check ($packages.ContainsKey('.exe') -and $packages.ContainsKey('.zip')) 'Both release formats verified'
 $extract=Join-Path $fixture 'Extracted Installer Files'
 $setup=Start-Process -FilePath $packages['.exe'] -ArgumentList ('--extract-only "'+$extract+'"') -WindowStyle Hidden -Wait -PassThru
 Check ($setup.ExitCode -eq 0) 'Published EXE extracts into a spaced path'
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead($packages['.zip'])
 try {
  foreach($name in @('payload.zip','install.ps1','install.cmd')){
   $entry=$zip.GetEntry($name)
   Check ($null -ne $entry) ('ZIP includes '+$name)
   $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
   try{$digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
   Check ($digest -eq (Get-FileHash -LiteralPath (Join-Path $extract $name)).Hash) ('EXE and ZIP match: '+$name)
  }
 } finally {$zip.Dispose()}
 $install=Join-Path $fixture 'Installed Programs\AmirahCo CLI'
 $desktop=Join-Path $fixture 'Desktop Shortcuts'
 $menu=Join-Path $fixture 'Start Menu\AmirahCo CLI'
 $work=Join-Path $fixture 'My Coding Project'
 $profile=Join-Path $fixture 'Clean User Profile'
 New-Item -ItemType Directory -Path $work,$profile | Out-Null
 $sentinel=Join-Path $work 'unfinished work.txt'
 [IO.File]::WriteAllText($sentinel,'Synthetic unfinished work; preserve exactly.')
 $before=(Get-FileHash -LiteralPath $sentinel).Hash
 $env:OPENCLAUDE_CONFIG_DIR=$profile
 $env:XDG_STATE_HOME=Join-Path $fixture 'Saved Project State'
 $env:LOCALAPPDATA=Join-Path $fixture 'Local App Data'
 $env:APPDATA=Join-Path $fixture 'Roaming App Data'
 $cmd=Join-Path $env:SystemRoot 'System32\cmd.exe'
 foreach($pass in @('clean','install-over')){
  $receipt=Join-Path $fixture ($pass+'-install.json')
  & (Join-Path $extract 'install.ps1') -InstallRoot $install -DesktopPath $desktop -StartMenuPath $menu -ReceiptPath $receipt
  $installed=Get-Content -Raw -LiteralPath $receipt | ConvertFrom-Json
  Check ($installed.state -eq 'installed') ($pass+' install completed')
  $launcher=Join-Path $installed.application 'bin\amirahcocli.cmd'
  Push-Location $work
  try {
   $version=Invoke-CommandLine $cmd ('/d /s /c ""'+$launcher+'" --version"')
   Check ($version -match '1.0.1 \(AmirahCo CLI\)') ($pass+' CMD launcher runs from spaced working directory')
   $help=Invoke-CommandLine $cmd ('/d /s /c ""'+$launcher+'" --help"')
   Check ($help -match '--provider-env-file') ($pass+' native help loads')
   $shell=New-Object -ComObject WScript.Shell
   foreach($linkPath in @($installed.desktopShortcut,$installed.startMenuShortcut)){
    $link=$shell.CreateShortcut($linkPath)
    Check ($link.Arguments -eq ('/d /c ""'+$launcher+'""')) ($pass+' shortcut quoting: '+(Split-Path $linkPath -Parent))
    Check ($link.IconLocation -eq ($installed.shortcutIcon+',0')) ($pass+' emerald icon binding: '+(Split-Path $linkPath -Parent))
    $arguments=$link.Arguments.Substring(0,$link.Arguments.Length-1)+' --version"'
    $output=Invoke-CommandLine $link.TargetPath $arguments
    Check ($output -match 'AmirahCo CLI') ($pass+' actual shortcut command executes: '+(Split-Path $linkPath -Parent))
   }
  } finally {Pop-Location}
  Check ((Get-FileHash -LiteralPath $sentinel).Hash -eq $before) ($pass+' unfinished work preserved')
 }
 $result=@{status='passed';checks=$checks;providerRequests=0;ownerShortcutsChanged=$false;physicalFreshDeviceAcceptance=$false;interactiveUiAcceptance=$false}
} catch {
 $result=@{status='failed';checks=$checks;error=$_.Exception.Message}
 $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $fixture 'receiving.json')
 throw
}
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $fixture 'receiving.json')
Write-Output ('Clean Windows receiving passed: '+$checks.Count+' checks. Receipt: '+(Join-Path $fixture 'receiving.json'))
