// Only the app-owned Windows writer process loads this native boundary.
function createWindowsStorage(root, modulePath) {
  const fs = require('node:fs'), path = require('node:path')
  const k = require(modulePath), kernel = k.load('kernel32.dll'), security = k.load('advapi32.dll')
  const api = (lib, signature) => lib.func(signature)
  const open = api(kernel, 'intptr_t __stdcall CreateFileW(const char16_t*, uint32_t, uint32_t, void*, uint32_t, uint32_t, intptr_t)')
  const close = api(kernel, 'int __stdcall CloseHandle(intptr_t)')
  const lastError = api(kernel, 'uint32_t __stdcall GetLastError()')
  const info = api(kernel, 'int __stdcall GetFileInformationByHandle(intptr_t, _Out_ void*)')
  const flush = api(kernel, 'int __stdcall FlushFileBuffers(intptr_t)')
  const finalPath = api(kernel, 'uint32_t __stdcall GetFinalPathNameByHandleW(intptr_t, _Out_ void*, uint32_t, uint32_t)')
  const driveType = api(kernel, 'uint32_t __stdcall GetDriveTypeW(const char16_t*)')
  const volume = api(kernel, 'int __stdcall GetVolumeInformationW(const char16_t*, void*, uint32_t, void*, void*, void*, _Out_ void*, uint32_t)')
  const createDir = api(kernel, 'int __stdcall CreateDirectoryW(const char16_t*, void*)')
  const free = api(kernel, 'intptr_t __stdcall LocalFree(intptr_t)')
  const current = api(kernel, 'intptr_t __stdcall GetCurrentProcess()')
  const token = api(security, 'int __stdcall OpenProcessToken(intptr_t, uint32_t, _Out_ intptr_t*)')
  const tokenInfo = api(security, 'int __stdcall GetTokenInformation(intptr_t, uint32_t, _Out_ void*, uint32_t, _Out_ uint32_t*)')
  const sidString = api(security, 'int __stdcall ConvertSidToStringSidW(void*, _Out_ void**)')
  const toDescriptor = api(security, 'int __stdcall ConvertStringSecurityDescriptorToSecurityDescriptorW(const char16_t*, uint32_t, _Out_ void**, void*)')
  const getSecurity = api(security, 'uint32_t __stdcall GetSecurityInfo(intptr_t, uint32_t, uint32_t, void*, void*, void*, void*, _Out_ void**)')
  const toString = api(security, 'int __stdcall ConvertSecurityDescriptorToStringSecurityDescriptorW(void*, uint32_t, uint32_t, _Out_ void**, void*)')
  const SA = k.struct({length:'uint32_t', descriptor:'void*', inherit:'int32_t'})
  const guards = new Map()
  const error = (code, message) => { const e = new Error(message); e.code = code; throw e }
  const checked = (ok, action) => { if (!ok) error('WINDOWS_IO', `${action} failed (Win32 ${lastError()}); state preserved.`) }
  function userSid() {
    const h=[0], length=[0], data=Buffer.alloc(4096), text=[null]
    checked(token(current(),8,h),'Read current identity')
    try {
      checked(tokenInfo(h[0],1,data,data.length,length),'Read current SID')
      checked(sidString(k.decode(data,'void*'),text),'Resolve current SID')
      try{return k.decode.string16(text[0])}finally{free(text[0])}
    } finally {close(h[0])}
  }
  const sid=userSid(), trusted=new Set([sid,'SY','BA','S-1-5-18','S-1-5-32-544'])
  function validName(file) {
    if(!/^[a-zA-Z]:\\/.test(file)||file.slice(3).includes(':')||file.slice(3).split('\\').some(part=>/[. ]$/.test(part)))error('UNSAFE_PATH','Use a canonical local Windows path without streams or trailing aliases.')
  }
  validName(root)
  if(driveType(path.parse(root).root)!==3)error('HOST','Native project records require a local fixed disk.')
  const filesystem=Buffer.alloc(128)
  checked(volume(path.parse(root).root,null,0,null,null,null,filesystem,64),'Inspect state volume')
  if(filesystem.toString('utf16le').split('\0')[0]!=='NTFS')error('HOST','Native project records require a local NTFS volume.')
  function attributes(h, file) {
    const data=Buffer.alloc(52), resolved=Buffer.alloc(65536)
    checked(info(h,data),'Read file identity')
    if(data.readUInt32LE(0)&0x400)error('UNSAFE_PATH','Reparse/linked state paths are not supported.')
    const size=finalPath(h,resolved,32768,0)
    if(!size||size>=32768)error('IDENTITY','Cannot resolve the held state path.')
    const actual=resolved.toString('utf16le',0,size*2).replace(/^\\\\\?\\/,'')
    if(actual.toLowerCase()!==file.toLowerCase())error('IDENTITY','Held state path does not match its canonical name.')
    return data
  }
  function hold(file) {
    if(guards.has(file))return guards.get(file)
    const h=open(file,0x20000,3,null,3,0x02200000,0)
    if(Number(h)===-1)error('WINDOWS_IO',`Cannot guard state identity (Win32 ${lastError()}).`)
    try{attributes(h,file);guards.set(file,h);return h}catch(e){close(h);throw e}
  }
  function privateAcl(file, protectedRoot=false) {
    const h=hold(file), descriptor=[null], text=[null]
    const status=getSecurity(h,1,5,null,null,null,null,descriptor)
    if(status)error('PRIVATE_PATH',`Cannot inspect private state permissions (Win32 ${status}).`)
    try {
      checked(toString(descriptor[0],1,5,text,null),'Inspect private ACL')
      try {
        const sddl=k.decode.string16(text[0]), owner=/^O:([^:]+?)(?=D:|G:|S:|$)/.exec(sddl)?.[1]
        const aces=[...sddl.matchAll(/\(([^)]+)\)/g)].map(match=>match[1].split(';'))
        if(!trusted.has(owner)||!aces.length||aces.some(a=>a.length!==6||a[0]!=='A'||!trusted.has(a[5]))||!aces.some(a=>a[5]===sid&&!a[1].includes('IO')&&['FA','GA','0x1f01ff'].includes(a[2])))error('PRIVATE_PATH','Project records must be private to their owner, SYSTEM and administrators.')
        if(protectedRoot&&!/D:P/.test(sddl))error('PRIVATE_PATH','The project-state root requires a protected owner-only ACL; existing permissions were not changed.')
      } finally {free(text[0])}
    } finally {free(descriptor[0])}
  }
  function safe(file) {
    validName(file)
    const relative=path.relative(root,file)
    if(relative.startsWith('..')||path.isAbsolute(relative))error('UNSAFE_PATH','State path leaves its bound root.')
    const ancestors=[]
    for(let p=root;;p=path.dirname(p)){ancestors.unshift(p);if(path.dirname(p)===p)break}
    let item=root
    for(const part of relative.split(path.sep).filter(Boolean)){item=path.join(item,part);ancestors.push(item)}
    for(const p of ancestors) {
      if(!fs.existsSync(p))continue
      if(fs.lstatSync(p).isSymbolicLink())error('UNSAFE_PATH','Linked state paths are not supported.')
      if(fs.statSync(p).isDirectory())hold(p)
      else {const h=open(p,0,3,null,3,0x02200000,0);if(Number(h)===-1)error('WINDOWS_IO','Cannot inspect state path.');try{attributes(h,p)}finally{close(h)}}
    }
    if(fs.existsSync(root))privateAcl(root,true)
    return file
  }
  function mkdir(file) {
    safe(file)
    if(fs.existsSync(file)){privateAcl(file,file===root);return}
    const missing=[]
    for(let item=file;!fs.existsSync(item);item=path.dirname(item))missing.unshift(item)
    for(const target of missing)createPrivate(target)
    safe(file);privateAcl(file,file===root)
  }
  function createPrivate(file) {
    const descriptor=[null]
    checked(toDescriptor(`O:${sid}D:P(A;OICI;FA;;;${sid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)`,1,descriptor,null),'Prepare private ACL')
    try {
      const sa={length:k.sizeof(SA),descriptor:descriptor[0],inherit:0}
      if(!createDir(file,k.as(sa,k.pointer(SA)))&&lastError()!==183)error('WINDOWS_IO',`Cannot create private state directory (Win32 ${lastError()}).`)
    } finally {free(descriptor[0])}
    privateAcl(file,file===root)
  }
  function openDatabase(file) {
    safe(file);privateAcl(file)
    const h=hold(file), data=attributes(h,file)
    if(data.readUInt32LE(0)&0x10||data.readUInt32LE(40)!==1)error('IDENTITY','The record database must be an ordinary, unaliased private file.')
  }
  function syncDirectory(file) {
    // Unlike fs.open(directory), backup semantics obtains a flushable directory handle.
    const h=open(file,0x40000000,7,null,3,0x02200000,0)
    if(Number(h)===-1)error('WINDOWS_IO',`Cannot open publication directory for durability (Win32 ${lastError()}).`)
    try{attributes(h,file);checked(flush(h),'Flush publication directory')}finally{close(h)}
  }
  function releaseDatabase(file) {const h=guards.get(file);if(h!==undefined){close(h);guards.delete(file)}}
  function bindWorkspace(file) {
    validName(file)
    if(path.resolve(file).toLowerCase()!==file.toLowerCase()||driveType(path.parse(file).root)!==3)error('WORKSPACE','Build requires an exact absolute local Windows workspace directory.')
    if(!fs.existsSync(file)||!fs.statSync(file).isDirectory())error('WORKSPACE','The activated Windows workspace must be an existing directory.')
    const ancestors=[]
    for(let item=file;;item=path.dirname(item)){ancestors.unshift(item);if(path.dirname(item)===item)break}
    for(const item of ancestors)hold(item)
  }
  function closeAll() {for(const h of guards.values())close(h);guards.clear();process.off('exit',closeAll)}
  process.once('exit',closeAll)
  return {safe,mkdir,openDatabase,syncDirectory,releaseDatabase,bindWorkspace,close:closeAll}
}
