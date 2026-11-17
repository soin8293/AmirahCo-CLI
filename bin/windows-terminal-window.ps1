param(
 [Parameter(Mandatory=$true)][ValidatePattern('^AmirahCo-CLI-[a-f0-9-]{36}$')][string]$WindowToken,
 [Parameter(Mandatory=$true)][string]$IconPath,
 [Parameter(Mandatory=$true)][string]$LauncherPath,
 [string]$ReceiptPath
)
$ErrorActionPreference='Stop'
if(-not(Test-Path -LiteralPath $IconPath -PathType Leaf) -or -not(Test-Path -LiteralPath $LauncherPath -PathType Leaf)){throw 'Terminal branding files are missing.'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AmirahCoWindowIcon {
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls,string title);
 public static IntPtr Find(string title) { return FindWindow(null,title); }
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll", CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr LoadImage(IntPtr instance,string path,uint type,int cx,int cy,uint flags);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool DestroyIcon(IntPtr icon);
 [DllImport("user32.dll", CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr window,uint msg,IntPtr wp,IntPtr lp,uint flags,uint timeout,out IntPtr result);
 public static IntPtr Message(IntPtr window,uint msg,int kind,IntPtr icon) {
  IntPtr result;
  if(SendMessageTimeout(window,msg,new IntPtr(kind),icon,2,2000,out result)==IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
  return result;
 }
}
'@
$window=[IntPtr]::Zero
$icons=@()
$previous=@()
try {
 # Only a newly created, uniquely titled Terminal window is eligible.
 [Console]::Title=$WindowToken
 [Console]::Write(([char]27)+"]0;"+$WindowToken+([char]7))
 for($i=0;$i -lt 40;$i++){
  $window=[AmirahCoWindowIcon]::Find($WindowToken)
  if($window -ne [IntPtr]::Zero){break}
  Start-Sleep -Milliseconds 100
 }
 if($window -eq [IntPtr]::Zero){throw 'Dedicated terminal window was not found.'}
 [uint32]$windowPid=0
 [void][AmirahCoWindowIcon]::GetWindowThreadProcessId($window,[ref]$windowPid)
 if((Get-Process -Id $windowPid).ProcessName -ne 'WindowsTerminal'){throw 'The dedicated window is not Windows Terminal.'}
 foreach($size in @(16,32)){
  $icon=[AmirahCoWindowIcon]::LoadImage([IntPtr]::Zero,$IconPath,1,$size,$size,0x10)
  if($icon -eq [IntPtr]::Zero){throw 'Could not load the AmirahCo window icon.'}
  $icons+=,$icon
 }
 foreach($kind in @(0,1)){
  $previous+=,[AmirahCoWindowIcon]::Message($window,0x80,$kind,$icons[$kind])
  if([AmirahCoWindowIcon]::Message($window,0x7f,$kind,[IntPtr]::Zero) -ne $icons[$kind]){throw 'Windows did not accept the window icon.'}
 }
 [Console]::Title='AmirahCo CLI'
 [Console]::Write(([char]27)+"]0;AmirahCo CLI"+([char]7))
 if($ReceiptPath){
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try{$iconHash=([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($IconPath)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  Add-Type -AssemblyName System.Drawing
  foreach($kind in @(0,1)){
   $actual=[System.Drawing.Icon]::FromHandle([AmirahCoWindowIcon]::Message($window,0x7f,$kind,[IntPtr]::Zero)).ToBitmap()
   try{$actual.Save($ReceiptPath+'.icon-'+$kind+'.png',[System.Drawing.Imaging.ImageFormat]::Png)}finally{$actual.Dispose()}
  }
  [pscustomobject]@{window=$window.ToInt64();processId=$windowPid;profile=$env:WT_PROFILE_ID;cwd=(Get-Location).Path;smallIconVerified=$true;largeIconVerified=$true;iconPath=$IconPath;iconSha256=$iconHash} | ConvertTo-Json | Set-Content -LiteralPath $ReceiptPath
 }
} catch {
 $brandingError=$_.Exception.Message
 $observedTitle=[Console]::Title
 [Console]::Title='AmirahCo CLI'
 [Console]::Write(([char]27)+"]0;AmirahCo CLI"+([char]7))
 [Console]::Error.WriteLine('AmirahCo CLI: window branding failed: '+$_.Exception.Message)
 if($ReceiptPath){[pscustomobject]@{state='branding-failed';error=$brandingError;observedTitle=$observedTitle;expectedTitle=$WindowToken;window=$window.ToInt64()} | ConvertTo-Json | Set-Content -LiteralPath $ReceiptPath}
}
try {
 # Keep icon handles alive for the whole native session, including heap relaunches.
 $env:_AMIRAHCO_WINDOW_BOOTSTRAPPED='1'
 & $LauncherPath
 $nativeExit=$LASTEXITCODE
} finally {
 foreach($kind in @(0,1)){
  if($kind -lt $previous.Count){
   try {
    if([AmirahCoWindowIcon]::Message($window,0x7f,$kind,[IntPtr]::Zero) -eq $icons[$kind]){[void][AmirahCoWindowIcon]::Message($window,0x80,$kind,$previous[$kind])}
   } catch {}
  }
 }
 foreach($icon in $icons){[void][AmirahCoWindowIcon]::DestroyIcon($icon)}
}
exit $nativeExit
