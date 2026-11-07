using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Windows.Forms;
[assembly:AssemblyTitle("AmirahCo CLI Pilot Setup")]
[assembly:AssemblyVersion("1.0.0.0")]
class Setup {
 const string PayloadHash="PAYLOAD_SHA256";
 static void Extract(string folder) {
  if(Directory.Exists(folder)||File.Exists(folder))throw new IOException("The setup folder already exists. Choose a fresh folder.");
  Directory.CreateDirectory(folder);
  var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);
  var sid=WindowsIdentity.GetCurrent().User;
  acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
  new DirectoryInfo(folder).SetAccessControl(acl);
  foreach(string name in new[]{"payload.zip","install.ps1","install.cmd"}){
   using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("AmirahCo."+name))
   using(var output=new FileStream(Path.Combine(folder,name),FileMode.CreateNew,FileAccess.Write,FileShare.None)){
    if(input==null)throw new IOException("Setup content is missing.");input.CopyTo(output);
   }
  }
  using(var hash=SHA256.Create())using(var file=File.OpenRead(Path.Combine(folder,"payload.zip")))
   if(BitConverter.ToString(hash.ComputeHash(file)).Replace("-","").ToLowerInvariant()!=PayloadHash)throw new IOException("Setup content verification failed.");
 }
 [STAThread] static int Main(string[] args) {
  bool extractOnly=args.Length==2&&args[0]=="--extract-only";
  try {
   if(args.Length>0&&!extractOnly)return 2;
   if(!extractOnly&&MessageBox.Show("Install AmirahCo CLI Pilot for this Windows user? Existing profiles and projects will be preserved.","AmirahCo CLI Pilot",MessageBoxButtons.OKCancel,MessageBoxIcon.Information)!=DialogResult.OK)return 0;
   string folder=extractOnly?Path.GetFullPath(args[1]):Path.Combine(Path.GetTempPath(),"AmirahCoCLI-setup-"+Guid.NewGuid().ToString("N"));
   Extract(folder);if(extractOnly)return 0;
   string ps=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell\\v1.0\\powershell.exe");
   var start=new ProcessStartInfo(ps,"-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(folder,"install.ps1")+"\"");
   start.UseShellExecute=false;start.WorkingDirectory=folder;
   using(var process=Process.Start(start)){process.WaitForExit();if(process.ExitCode!=0)throw new IOException("Installation did not finish. Your existing projects and settings were preserved.");}
   MessageBox.Show("AmirahCo CLI Pilot is installed. Open its desktop shortcut to begin. Tester access requires manual approval.","AmirahCo CLI Pilot",MessageBoxButtons.OK,MessageBoxIcon.Information);return 0;
  } catch(Exception e){if(!extractOnly)MessageBox.Show(e.Message,"AmirahCo CLI Pilot",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
