param([Parameter(Mandatory=$true)][string]$Archive)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$outer=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
$temporary=[IO.Path]::GetTempFileName()
try {
 $names=@($outer.Entries | ForEach-Object {$_.FullName})
 if($names.Count -ne 4){throw 'Unexpected update archive layout.'}
 foreach($expected in @('README.txt','install.cmd','install.ps1','payload.zip')){
  if(-not($names -ccontains $expected)){throw 'Unexpected update archive layout.'}
 }
 if(($outer.Entries | Measure-Object -Property Length -Sum).Sum -gt 3GB){throw 'Outer extraction exceeds its limit.'}
 [IO.Compression.ZipFileExtensions]::ExtractToFile($outer.GetEntry('payload.zip'),$temporary,$true)
 $payload=[IO.Compression.ZipFile]::OpenRead($temporary)
 try {
  $seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$unpacked=0
  foreach($entry in $payload.Entries){
   if($entry.FullName -match '(^/|\\|:|(^|/)\.\.(/|$))' -or -not $seen.Add($entry.FullName)){throw 'Unsafe or duplicate payload path.'}
   $unpacked+=$entry.Length
   if($unpacked -gt 3GB){throw 'Update payload exceeds its limit.'}
  }
  $values=@{}
  foreach($item in @(@('policy','app/assets/update-policy.json'),@('package','app/package.json'))){
   $entry=$payload.GetEntry($item[1])
   if(-not $entry -or $entry.Length -gt 100000){throw 'Missing or oversized package identity.'}
   $reader=New-Object IO.StreamReader($entry.Open())
   try{$values[$item[0]]=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
  }
  foreach($entry in $outer.Entries){$unpacked+=$entry.Length}
  @{policy=$values.policy;version=$values.package.version;unpackedBytes=$unpacked} | ConvertTo-Json -Depth 10 -Compress
 }finally{$payload.Dispose()}
}finally{$outer.Dispose();[IO.File]::Delete($temporary)}
