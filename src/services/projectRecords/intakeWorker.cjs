// Bundled as text, executed only in a Node worker. Never import legacy memory storage.
const threads = require('node:worker_threads')
const workerData = threads.workerData || JSON.parse(process.env.AMIRAHCO_STORAGE_WORKER_DATA)
const parentPort = threads.parentPort || {on:(event,listener)=>process.on(event,listener),postMessage:message=>process.send(message),close:()=>process.disconnect()}
const {DatabaseSync} = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const uuid = () => crypto.randomUUID()
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const kinds = ['binding','source','answer','decision','requirement','criterion','plan','change','restriction','restriction_set','approval','activation','context_packet','check','review','acceptance','incident','lesson','policy_profile','artifact_status']
const fields = ['idea','needs','success','notes','helpers','name','folder']
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error }
const schema = `
CREATE TABLE project_meta(slot INTEGER PRIMARY KEY CHECK(slot=1),project_id TEXT NOT NULL UNIQUE,schema_version INTEGER NOT NULL CHECK(schema_version=1),created_at_ms INTEGER NOT NULL,private_store_id TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE operations(project_id TEXT NOT NULL,operation_id TEXT NOT NULL,kind TEXT NOT NULL,caller_owner_ref_id TEXT NOT NULL,request_sha256 TEXT NOT NULL,expected_heads_json TEXT NOT NULL CHECK(json_valid(expected_heads_json)),phase TEXT NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN ('prepared','committed','rejected')),result_json TEXT,commit_seq INTEGER,created_at_ms INTEGER NOT NULL,PRIMARY KEY(project_id,operation_id),FOREIGN KEY(project_id) REFERENCES project_meta(project_id),FOREIGN KEY(project_id,caller_owner_ref_id) REFERENCES owner_refs(project_id,owner_ref_id) DEFERRABLE INITIALLY DEFERRED,FOREIGN KEY(project_id,commit_seq) REFERENCES commits(project_id,commit_seq) DEFERRABLE INITIALLY DEFERRED) STRICT;
CREATE TABLE commits(commit_seq INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,operation_id TEXT NOT NULL,decision_kind TEXT NOT NULL,committed_at_ms INTEGER NOT NULL,changed_heads_json TEXT NOT NULL CHECK(json_valid(changed_heads_json)),UNIQUE(project_id,commit_seq),UNIQUE(project_id,operation_id),FOREIGN KEY(project_id,operation_id) REFERENCES operations(project_id,operation_id) DEFERRABLE INITIALLY DEFERRED) STRICT;
CREATE TABLE record_versions(project_id TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),kind TEXT NOT NULL CHECK(kind IN (${kinds.map(x=>`'${x}'`).join(',')})),body_json TEXT NOT NULL CHECK(json_valid(body_json) AND json_type(body_json)='object' AND length(CAST(body_json AS BLOB))<=262144),content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),operation_id TEXT NOT NULL,created_seq INTEGER NOT NULL,PRIMARY KEY(project_id,record_id,revision),FOREIGN KEY(project_id,operation_id) REFERENCES operations(project_id,operation_id),FOREIGN KEY(project_id,created_seq) REFERENCES commits(project_id,commit_seq)) STRICT;
CREATE TABLE record_links(project_id TEXT NOT NULL,link_id TEXT NOT NULL,from_id TEXT NOT NULL,from_revision INTEGER NOT NULL,to_id TEXT NOT NULL,to_revision INTEGER NOT NULL,relation TEXT NOT NULL,selector_json TEXT NOT NULL CHECK(json_valid(selector_json)),created_seq INTEGER NOT NULL,PRIMARY KEY(project_id,link_id),UNIQUE(project_id,from_id,from_revision,to_id,to_revision,relation,selector_json),FOREIGN KEY(project_id,from_id,from_revision) REFERENCES record_versions(project_id,record_id,revision),FOREIGN KEY(project_id,to_id,to_revision) REFERENCES record_versions(project_id,record_id,revision),FOREIGN KEY(project_id,created_seq) REFERENCES commits(project_id,commit_seq)) STRICT;
CREATE TABLE head_refs(project_id TEXT NOT NULL,head_kind TEXT NOT NULL,scope_id TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,changed_seq INTEGER NOT NULL,PRIMARY KEY(project_id,head_kind,scope_id),FOREIGN KEY(project_id,record_id,revision) REFERENCES record_versions(project_id,record_id,revision),FOREIGN KEY(project_id,changed_seq) REFERENCES commits(project_id,commit_seq)) STRICT;
CREATE TABLE owner_refs(project_id TEXT NOT NULL,owner_ref_id TEXT NOT NULL,observation_key TEXT NOT NULL,owner_kind TEXT NOT NULL,owner_key TEXT NOT NULL,runtime_epoch TEXT,receipt_sha256 TEXT,observed_at_ms INTEGER NOT NULL,classification TEXT NOT NULL,created_seq INTEGER NOT NULL,PRIMARY KEY(project_id,owner_ref_id),UNIQUE(project_id,observation_key),FOREIGN KEY(project_id) REFERENCES project_meta(project_id),FOREIGN KEY(project_id,created_seq) REFERENCES commits(project_id,commit_seq) DEFERRABLE INITIALLY DEFERRED) STRICT;
CREATE TABLE owner_bindings(project_id TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,owner_ref_id TEXT NOT NULL,purpose TEXT NOT NULL,created_seq INTEGER NOT NULL,PRIMARY KEY(project_id,record_id,revision,owner_ref_id,purpose),FOREIGN KEY(project_id,record_id,revision) REFERENCES record_versions(project_id,record_id,revision),FOREIGN KEY(project_id,owner_ref_id) REFERENCES owner_refs(project_id,owner_ref_id),FOREIGN KEY(project_id,created_seq) REFERENCES commits(project_id,commit_seq)) STRICT;
CREATE TABLE artifacts(project_id TEXT NOT NULL,artifact_id TEXT NOT NULL,kind TEXT NOT NULL,relative_locator TEXT NOT NULL,byte_length INTEGER NOT NULL CHECK(byte_length>=0),sha256 TEXT NOT NULL CHECK(length(sha256)=64),classification TEXT NOT NULL,created_seq INTEGER NOT NULL,PRIMARY KEY(project_id,artifact_id),FOREIGN KEY(project_id,created_seq) REFERENCES commits(project_id,commit_seq)) STRICT;
CREATE TABLE artifact_bindings(project_id TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,artifact_id TEXT NOT NULL,purpose TEXT NOT NULL,created_seq INTEGER NOT NULL,PRIMARY KEY(project_id,record_id,revision,artifact_id,purpose),FOREIGN KEY(project_id,record_id,revision) REFERENCES record_versions(project_id,record_id,revision),FOREIGN KEY(project_id,artifact_id) REFERENCES artifacts(project_id,artifact_id),FOREIGN KEY(project_id,created_seq) REFERENCES commits(project_id,commit_seq)) STRICT;
CREATE TABLE publications(project_id TEXT NOT NULL,publication_id TEXT NOT NULL,operation_id TEXT NOT NULL,snapshot_seq INTEGER NOT NULL,purpose TEXT NOT NULL,parent_publication_id TEXT,target_json TEXT NOT NULL CHECK(json_valid(target_json)),required_heads_json TEXT NOT NULL CHECK(json_valid(required_heads_json)),payload_sha256 TEXT NOT NULL,rendered_bytes BLOB,required INTEGER NOT NULL CHECK(required IN (0,1)),PRIMARY KEY(project_id,publication_id),FOREIGN KEY(project_id,operation_id) REFERENCES operations(project_id,operation_id),FOREIGN KEY(project_id,snapshot_seq) REFERENCES commits(project_id,commit_seq),FOREIGN KEY(project_id,parent_publication_id) REFERENCES publications(project_id,publication_id)) STRICT;
CREATE TABLE publication_receipts(project_id TEXT NOT NULL,receipt_id TEXT NOT NULL,publication_id TEXT NOT NULL,attempt_id TEXT NOT NULL,phase TEXT NOT NULL CHECK(phase IN ('pending','applied','verified','unknown','conflict','superseded')),observed_sha256 TEXT,owner_ref_id TEXT,details_json TEXT NOT NULL CHECK(json_valid(details_json)),recorded_seq INTEGER NOT NULL,PRIMARY KEY(project_id,receipt_id),UNIQUE(project_id,publication_id,attempt_id,phase),FOREIGN KEY(project_id,publication_id) REFERENCES publications(project_id,publication_id),FOREIGN KEY(project_id,owner_ref_id) REFERENCES owner_refs(project_id,owner_ref_id),FOREIGN KEY(project_id,recorded_seq) REFERENCES commits(project_id,commit_seq)) STRICT;
CREATE INDEX records_kind ON record_versions(project_id,kind,created_seq);
CREATE INDEX publication_sequence ON publications(project_id,snapshot_seq);
`
let db, currentId, dbIdentity
const root = path.resolve(workerData.root)
const windows = process.platform==='win32' ? createWindowsStorage(root,workerData.koffiPath) : null
function syncDirectory(directory) {
  if(windows)return windows.syncDirectory(directory)
  const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function safe(candidate) {
  if(windows)return windows.safe(candidate)
  for(let ancestor=root;;ancestor=path.dirname(ancestor)){
    if(fs.existsSync(ancestor)&&fs.lstatSync(ancestor).isSymbolicLink())fail('UNSAFE_PATH','Linked private-state ancestors are not supported.')
    if(path.dirname(ancestor)===ancestor)break
  }
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('UNSAFE_PATH','Record path leaves the private project root.')
  let item = root
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) item = path.join(item, part)
    if (fs.existsSync(item) && fs.lstatSync(item).isSymbolicLink()) fail('UNSAFE_PATH','Linked record paths are not supported.')
  }
  return candidate
}
const directory = id => safe(path.join(root,id))
function settings(connection, readOnly=false) {
  connection.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA read_uncommitted=OFF; PRAGMA busy_timeout=2000;')
  if (!readOnly) connection.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA;')
  if (connection.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1) fail('SETTINGS','Foreign keys unavailable.')
  if (!readOnly && (connection.prepare('PRAGMA journal_mode').get().journal_mode !== 'delete' || connection.prepare('PRAGMA synchronous').get().synchronous !== 3)) fail('SETTINGS','Required durability settings unavailable.')
}
function open(id) {
  if (db && currentId===id) {
    const disk=fs.statSync(safe(path.join(directory(id),'project-records.sqlite')))
    if(disk.ino!==dbIdentity.ino||disk.dev!==dbIdentity.dev)fail('IDENTITY','The open project file was replaced. Preserve both files and reconcile before continuing.')
    return db
  }
  if (db) {db.close();if(windows)windows.releaseDatabase(path.join(directory(currentId),'project-records.sqlite'));db=undefined}
  const filename=safe(path.join(directory(id),'project-records.sqlite'))
  // Open an existing descriptor first: SQLite must never create a raced replacement.
  const fd=fs.openSync(filename,fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW||0))
  let candidate
  try {
    if (!windows&&process.platform!=='linux') fail('HOST','Unsupported native record host.')
    if(windows)windows.openDatabase(filename)
    candidate=new DatabaseSync(windows?filename:`/proc/self/fd/${fd}`,{enableDoubleQuotedStringLiterals:false,allowExtension:false})
    settings(candidate,true)
    // Resolve through fd without changing the journal's canonical name: /proc resolves to the original file.
    const actual=candidate.prepare('PRAGMA database_list').get().file
    if(windows?path.resolve(actual).toLowerCase()!==filename.toLowerCase():actual!==filename){candidate.close();fail('IDENTITY','SQLite did not retain the canonical journal location.')}
    const meta=candidate.prepare('SELECT * FROM project_meta WHERE slot=1').get()
    if (!meta || meta.project_id!==id || meta.schema_version!==1 || candidate.prepare('PRAGMA application_id').get().application_id!==0x414d5248 || candidate.prepare('PRAGMA user_version').get().user_version!==1) {candidate.close();fail('IDENTITY','Wrong project or unsupported record schema.')}
    const disk=fs.statSync(filename), held=fs.fstatSync(fd)
    if(disk.ino!==held.ino||disk.dev!==held.dev){candidate.close();fail('IDENTITY','Project file was replaced during open.')}
    if(candidate.prepare('PRAGMA journal_mode').get().journal_mode!=='delete')fail('SETTINGS','Unexpected journal mode; explicit owner inspection is required, not an automatic conversion.')
    settings(candidate);db=candidate;currentId=id;dbIdentity={ino:held.ino,dev:held.dev}
  } catch(error){try{candidate?.close()}catch{};throw error} finally {fs.closeSync(fd)}
  return db
}
function bootstrap(id) {
  let existingAncestor=root
  while(!fs.existsSync(existingAncestor))existingAncestor=path.dirname(existingAncestor)
  safe(root);if(windows)windows.mkdir(root);else fs.mkdirSync(root,{recursive:true,mode:0o700})
  if(!windows&&(fs.statSync(root).mode&0o077))fail('PRIVATE_PATH','The private project root must be accessible only to its owner.')
  const dir=directory(id);if(windows)windows.mkdir(dir);else fs.mkdirSync(dir,{mode:0o700})
  const filename=path.join(dir,'project-records.sqlite')
  const notes={schema:'amirahco.project-records.v1',project_id:id,writes:'deny direct AODB writes; use only the app-owned native intakeStore APIs',read_only_overview:'AODB overview first for manual inspection; use the owning qualified host.',write_policy:'Only AMIRAHCO native intakeStore APIs through the app-owned Node worker. No raw agent SQL, external write or implicit migration.',supported_operations:['save native intake','reopen existing','pause','explicit resume','repair exact intake projection','request/save/review/revise PRD proposal','approve exact current PRD','repair exact PRD projection','activate exact approved PRD','generate role-scoped context packet'],phase:'intake, PRD review and exact Build activation; native and Foundry execution remain separately authoritative'}
  const notesFd=fs.openSync(path.join(dir,'project-records.agent.json'),'wx',0o600)
  try{fs.writeFileSync(notesFd,JSON.stringify(notes,null,2)+'\n');fs.fsyncSync(notesFd)}finally{fs.closeSync(notesFd)}
  const fd=fs.openSync(filename,'wx',0o600);fs.closeSync(fd)
  const candidate=new DatabaseSync(filename,{enableDoubleQuotedStringLiterals:false,allowExtension:false})
  try {
    settings(candidate);candidate.exec('BEGIN IMMEDIATE;'+schema)
    candidate.prepare('INSERT INTO project_meta VALUES (1,?,1,?,?)').run(id,Date.now(),uuid())
    for(const table of ['project_meta','commits','record_versions','record_links','owner_refs','owner_bindings','artifacts','artifact_bindings','publications','publication_receipts']) {
      candidate.exec(`CREATE TRIGGER immutable_${table}_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'immutable history'); END; CREATE TRIGGER immutable_${table}_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'immutable history'); END;`)
    }
    candidate.exec("CREATE TRIGGER immutable_operation BEFORE UPDATE ON operations WHEN OLD.outcome!='prepared' BEGIN SELECT RAISE(ABORT,'terminal operation'); END; CREATE TRIGGER immutable_operation_delete BEFORE DELETE ON operations BEGIN SELECT RAISE(ABORT,'immutable operation'); END;")
    for(const table of ['record_links','owner_bindings','artifact_bindings']) candidate.exec(`CREATE TRIGGER frozen_${table} BEFORE INSERT ON ${table} WHEN NEW.created_seq!=(SELECT created_seq FROM record_versions WHERE project_id=NEW.project_id AND record_id=NEW.${table==='record_links'?'from_id':'record_id'} AND revision=NEW.${table==='record_links'?'from_revision':'revision'}) BEGIN SELECT RAISE(ABORT,'frozen origin'); END;`)
    candidate.exec('PRAGMA application_id=0x414d5248; PRAGMA user_version=1; COMMIT;')
  } catch(error) {try{candidate.exec('ROLLBACK')}catch{};throw error} finally {candidate.close()}
  for(let current=dir;;current=path.dirname(current)){
    syncDirectory(current)
    if(current===existingAncestor)break
  }
}
function state(id) {
  const c=open(id)
  const heads=c.prepare('SELECT h.*,r.kind,r.body_json FROM head_refs h JOIN record_versions r USING(project_id,record_id,revision) WHERE h.project_id=?').all(id)
  const values=Object.fromEntries(heads.filter(x=>x.head_kind==='answer').map(x=>[x.scope_id,JSON.parse(x.body_json).raw_permitted_value]))
  const stage=heads.find(x=>x.head_kind==='intake_state')
  const sequence=stage?.changed_seq||0
  const result=stage?JSON.parse(c.prepare('SELECT result_json FROM operations WHERE project_id=? AND operation_id=(SELECT operation_id FROM record_versions WHERE project_id=? AND record_id=? AND revision=?)').get(id,id,stage.record_id,stage.revision).result_json):null
  const restriction=heads.find(x=>x.head_kind==='restriction_set')
  const stopped=Boolean(restriction && c.prepare("SELECT 1 FROM record_links WHERE project_id=? AND from_id=? AND from_revision=? AND relation='operative_restriction'").get(id,restriction.record_id,restriction.revision))
  const clarification=heads.find(x=>x.head_kind==='intake_clarification')
  const sessionIds=c.prepare("SELECT DISTINCT owner_key FROM owner_refs WHERE project_id=? AND owner_kind='native_intake_input'").all(id).map(row=>row.owner_key)
  const snapshot={projectId:id,sequence,answers:values,sessionIds,...(clarification?{clarification:JSON.parse(clarification.body_json).serialized}:{}),step:result?.step??1,phase:result?.phase??'intake',stopped,projectionPending:!projectionCurrent(c,id,sequence)}
  return {...snapshot,...prdState(c,id,snapshot),...activationState(c,id)}
}
function activationState(c,id){
  const row=prdHead(c,id,'activation')
  if(!row)return {}
  const body=JSON.parse(row.body_json),packet=c.prepare("SELECT r.* FROM record_links l JOIN record_versions r ON r.project_id=l.project_id AND r.record_id=l.to_id AND r.revision=l.to_revision WHERE l.project_id=? AND l.from_id=? AND l.from_revision=? AND l.relation='uses_context'").get(id,row.record_id,row.revision)
  if(!packet)fail('ACTIVATION_STATE','Activation context packet is missing.')
  const context=JSON.parse(packet.body_json)
  return {activation:{activationId:row.record_id,revision:row.revision,commitSequence:row.created_seq,planRevision:body.plan_revision,meaningHash:body.meaning_hash,selectedTotal:body.selected_total,workspaceRoot:body.workspace_root,nativeSessionId:body.native_session_id,capabilityProfileDigest:body.capability_profile_digest,contextPacketId:packet.record_id,contextPacketRevision:packet.revision,contextDigest:context.packet_digest,status:'activated'}}
}
function projectionCurrent(c,id,sequence) {
  if(!sequence)return true
  const pub=c.prepare('SELECT * FROM publications WHERE project_id=? AND snapshot_seq=? AND purpose=?').get(id,sequence,'intake_projection')
  if(!pub)return false
  const target=safe(path.join(directory(id),`INTAKE.${sequence}.md`))
  if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==pub.payload_sha256)return false
  return Boolean(c.prepare("SELECT 1 FROM publication_receipts WHERE project_id=? AND publication_id=? AND phase='verified'").get(id,pub.publication_id))
}
function capacity(id,payload,essential) {
  const dir=directory(id), files=fs.readdirSync(dir)
  let used=0
  for(const name of files) {
    try {const file=safe(path.join(dir,name));const s=fs.lstatSync(file);if(s.isFile())used+=s.size;else if(s.isDirectory())fail('CAPACITY','Unexpected private record directory; capacity cannot be established.')}
    catch(error){
      // SQLite can remove its DELETE journal between enumeration and stat.
      // The conservative journal peak below already reserves this allocation.
      if(error.code==='ENOENT'&&name==='project-records.sqlite-journal')continue
      throw error
    }
  }
  const disk=fs.statfsSync(dir), free=Number(disk.bavail)*Number(disk.bsize)
  const size=fs.statSync(path.join(dir,'project-records.sqlite')).size
  const peak=Math.ceil(1.10*size)+4*payload+16*1024*1024
  if(!Number.isSafeInteger(free)||used+peak>1024**3-(essential?0:64*1024**2)||free<Math.max(essential?peak:512*1024**2,peak+64*1024**2))fail('CAPACITY','Not enough private storage for a safe save. Draft remains unsaved; Stop is still effective.')
}
function transaction(id,request,body) {
  const c=open(id), fingerprint=hash(canonical(request)), existing=c.prepare('SELECT * FROM operations WHERE project_id=? AND operation_id=?').get(id,request.operationId)
  if(existing){if(existing.request_sha256!==fingerprint)fail('CONFLICT','Operation identity reused with different input.');return JSON.parse(existing.result_json)}
  c.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;')
  try {
    const owner=uuid(),now=Date.now()
    const original=c.prepare('SELECT * FROM operations WHERE project_id=? AND operation_id=?').get(id,request.operationId)
    if(original){if(original.request_sha256!==fingerprint)fail('CONFLICT','Operation identity reused with different input.');c.exec('ROLLBACK');return JSON.parse(original.result_json)}
    const seq=Number(c.prepare('SELECT coalesce(max(commit_seq),0)+1 AS next FROM commits').get().next)
    if(request.type!=='publication_receipt'){
      const head=c.prepare("SELECT changed_seq FROM head_refs WHERE project_id=? AND head_kind='intake_state'").get(id)
      if((head?.changed_seq||0)!==request.expectedSequence)fail('STALE','A newer saved intake exists; reopen before changing it.')
    }
    const observation=request.origin==='application'||request.type==='prd_candidate'||['submission_intent','run_binding','artifact','check','incident','lesson'].includes(request.type)||(request.type==='review'&&request.independence==='self_check')
    c.prepare('INSERT INTO owner_refs VALUES (?,?,?,?,?,NULL,NULL,?,?,?)').run(id,owner,`native-intake:${request.sessionId}:${request.operationId}`,request.type==='publication_receipt'?'app_projection_writer':'native_intake_input',request.sessionId,now,request.type==='publication_receipt'?'deterministic_recovery':observation?'application_observation_not_owner_approval':'local_owner_input_not_native_capture',seq)
    c.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?,?,\'prepared\',NULL,NULL,?)').run(id,request.operationId,request.type,owner,fingerprint,canonical({sequence:request.expectedSequence,...(request.type.startsWith('prd_')?{plan_revision:request.expectedPlanRevision,request_id:request.requestId}:request.type==='activate'?{plan_revision:request.expectedPlanRevision}:{})}),request.type.startsWith('prd_')?'prd_review':request.type==='activate'?'activation':'intake',now)
    const context={c,seq,owner,now,record(kind,recordId,value,scope,links=[]) {
      const prior=c.prepare('SELECT max(revision) AS revision FROM record_versions WHERE project_id=? AND record_id=?').get(id,recordId).revision||0
      const rev=prior+1,bytes=canonical(value),refs=links.map(x=>({record_id:x.id,revision:x.revision,relation:x.relation,selector:{}})).sort((a,b)=>canonical(a).localeCompare(canonical(b)))
      c.prepare('INSERT INTO record_versions VALUES (?,?,?,?,?,?,?,?)').run(id,recordId,rev,kind,bytes,hash(canonical({kind,body:value,links:refs,owners:[{owner_ref_id:owner,purpose:'actual_caller'}],artifacts:[]})),request.operationId,seq)
      for(const link of links)c.prepare('INSERT INTO record_links VALUES (?,?,?,?,?,?,?,?,?)').run(id,uuid(),recordId,rev,link.id,link.revision,link.relation,'{}',seq)
      c.prepare('INSERT INTO owner_bindings VALUES (?,?,?,?,?,?)').run(id,recordId,rev,owner,'actual_caller',seq)
      if(scope)c.prepare('INSERT INTO head_refs VALUES (?,?,?,?,?,?) ON CONFLICT(project_id,head_kind,scope_id) DO UPDATE SET record_id=excluded.record_id,revision=excluded.revision,changed_seq=excluded.changed_seq').run(id,scope[0],scope[1],recordId,rev,seq)
      return {id:recordId,revision:rev}
    }}
    const result=body(context)
    const changed=c.prepare('SELECT head_kind,scope_id,record_id,revision FROM head_refs WHERE project_id=? AND changed_seq=? ORDER BY head_kind,scope_id').all(id,seq)
    c.prepare('INSERT INTO commits VALUES (?,?,?,?,?,?)').run(seq,id,request.operationId,request.type,now,canonical(changed))
    c.prepare("UPDATE operations SET outcome='committed',result_json=?,commit_seq=? WHERE project_id=? AND operation_id=?").run(canonical(result),seq,id,request.operationId)
    if(workerData.fault==='during_transaction'&&request.type==='save')process.exit(97)
    if(workerData.fault==='prd_during_transaction'&&request.type==='prd_candidate')process.exit(97)
    c.exec('COMMIT');return result
  } catch(error){try{c.exec('ROLLBACK')}catch{};throw error}
}
function save(request) {
  const id=request.projectId
  if(request.origin==='application'&&(request.create||request.type!=='save'))fail('AUTHORITY','Application state cannot create a project or change owner control.')
  if(request.create && !fs.existsSync(directory(id)))bootstrap(id)
  const original=open(id).prepare('SELECT * FROM operations WHERE project_id=? AND operation_id=?').get(id,request.operationId)
  if(original){if(original.request_sha256!==hash(canonical(request)))fail('CONFLICT','Operation identity reused with different input.');return JSON.parse(original.result_json)}
  const before=state(id)
  const currentAnswers={...before.answers,...request.answers}
  if(request.origin==='application'&&(request.type!=='save'||fields.some(key=>request.answers[key]!==undefined&&request.answers[key]!==before.answers[key])))fail('AUTHORITY','Application clarification results cannot overwrite owner answers or control.')
  const clarification=request.clarification??before.clarification
  if(request.clarification!==undefined){
    const draft=JSON.parse(request.clarification),facts=Object.fromEntries(['idea','needs','success','notes'].map(key=>[key,String(currentAnswers[key]??'')]))
    if(draft.inputHash!==hash(JSON.stringify(facts)))fail('STALE_CONTEXT','Personalized questions belong to different intake facts.')
    if(request.origin==='application'&&canonical(draft.responses)!==canonical(before.clarification?JSON.parse(before.clarification).responses:{}))fail('AUTHORITY','Application results cannot invent owner answers.')
  }
  if(before.sequence!==request.expectedSequence)fail('STALE','A newer saved revision exists. Reopen before editing it.')
  const bytes=Buffer.byteLength(canonical(request));capacity(id,bytes,request.type!=='save')
  if(workerData.fault==='sqlite_full'){
    const c=open(id),pages=c.prepare('PRAGMA page_count').get().page_count
    c.exec(`PRAGMA max_page_count=${pages}`)
  }
  return transaction(id,request,ctx=>{
    const {c,seq,record}=ctx
    if(!before.sequence)record('binding',uuid(),{state:'unbound',canonical_root:null,root_fingerprint:null,binding_version:1,platform:process.platform},['binding',id])
    for(const key of fields)if(request.answers[key]!==undefined&&request.answers[key]!==before.answers[key]){
      const source=record('source',uuid(),{origin_kind:'native_intake',authority_class:'owner_input',permitted_use:'local_intake',coverage:'inspected',permitted_text:request.answers[key],inspected_sha256:hash(request.answers[key]),gaps:[]})
      const previous=c.prepare('SELECT record_id FROM head_refs WHERE project_id=? AND head_kind=? AND scope_id=?').get(id,'answer',key)
      record('answer',previous?.record_id||uuid(),{question_intent:key,raw_permitted_value:request.answers[key],confirmation_state:'owner_submitted',unresolved_reason:null},['answer',key],[{...source,relation:'sourced_from'}])
    }
    if(request.clarification!==undefined&&request.clarification!==before.clarification){
      const prior=c.prepare("SELECT record_id FROM head_refs WHERE project_id=? AND head_kind='intake_clarification'").get(id)
      record('context_packet',prior?.record_id||uuid(),{role:'intake_clarification_draft',authority:'model_questions_are_proposals; responses_are_local_owner_input; no_PRD_approval',serialized:request.clarification},['intake_clarification',id])
    }
    let stopped=before.stopped
    if(request.type==='stop'||request.type==='resume'||request.type==='confirm'){
      const previousSet=c.prepare("SELECT record_id,revision FROM head_refs WHERE project_id=? AND head_kind='restriction_set' AND scope_id=?").get(id,id)
      const decision=record('decision',uuid(),{statement:request.type==='stop'?'Owner stopped this intake':request.type==='resume'?'Owner explicitly resumed this saved intake':'Owner continued the last saved intake; unsaved predecessor input remains unknown',decision_class:'owner_ruling',applicability:`intake:${id}`,unresolved:false,control_action:request.type==='stop'?'stop':request.type==='resume'?'resume':'reconfirm_current',...(request.type==='confirm'?{control_coverage:{history:'partial',predecessor_intake:'unknown',current_intent:'confirmed',replaces_pending_before_confirmation:false}}:{})},undefined,previousSet?[{id:previousSet.record_id,revision:previousSet.revision,relation:'targets'}]:[])
      let restrictions=[]
      if(request.type==='stop'){
        const restriction=record('restriction',uuid(),{rule:'No continuation until explicit Resume',affected_scope:`intake:${id}`,restriction_class:'run_stop',requires_reconciliation:true},undefined,[{...decision,relation:'sourced_from'}]);restrictions=[{...restriction,relation:'operative_restriction'}];stopped=true
      }else if(request.type==='resume')stopped=false
      else if(stopped)fail('STOPPED','This intake needs explicit Resume, not Continue.')
      record('restriction_set',uuid(),{completeness:'complete',unresolved_scope:[]},['restriction_set',id],restrictions)
    }
    const stage=record('decision',uuid(),{statement:`Native intake step ${request.step}; phase ${request.phase}`,decision_class:'fact',applicability:`intake:${id}`,unresolved:false},['intake_state',id])
    const view=['# Saved project intake','',`Project: ${id}`,`Snapshot: ${seq}`,`Phase: ${request.phase}`,`Next question: ${request.step}`,`Control: ${stopped?'STOPPED — explicit Resume required':'intake only; no Build authorized'}`,'',...fields.map(key=>`## ${key}\n\n${currentAnswers[key]??'(not answered)'}\n`),...(clarification?['## Personalized clarification draft','',clarification,'']:[]),'This is saved intake, not an approved PRD. No project folder or team was started; optional clarification is not build approval.',''].join('\n')
    const payload=Buffer.from(view),pub=uuid()
    c.prepare('INSERT INTO publications VALUES (?,?,?,?,?,NULL,?,?,?,?,1)').run(id,pub,request.operationId,seq,'intake_projection',canonical({file:`INTAKE.${seq}.md`}),canonical({intake_state:stage}),hash(payload),payload)
    return {projectId:id,sequence:seq,step:request.step,phase:request.phase,stopped,publicationId:pub}
  })
}
function repair(id) {
  const snapshot=state(id);if(!snapshot.sequence||!snapshot.projectionPending)return snapshot
  const c=open(id),pub=c.prepare('SELECT * FROM publications WHERE project_id=? AND snapshot_seq=? AND purpose=?').get(id,snapshot.sequence,'intake_projection')
  if(!pub)fail('RECOVERY','Saved intake has no exact projection. Hold for record inspection.')
  const payload=Buffer.from(pub.rendered_bytes),target=safe(path.join(directory(id),`INTAKE.${pub.snapshot_seq}.md`))
  if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==pub.payload_sha256){
    fail('PROJECTION_CONFLICT','Saved intake projection was changed outside the writer. Original file preserved.')
  }
  const attemptId=pub.publication_id
  const receipt=(phase)=>{
    if(c.prepare('SELECT 1 FROM publication_receipts WHERE project_id=? AND publication_id=? AND attempt_id=? AND phase=?').get(id,pub.publication_id,attemptId,phase))return
    const request={projectId:id,operationId:hash(`${pub.publication_id}:${phase}`).slice(0,32),sessionId:'deterministic-projection-recovery',type:'publication_receipt',expectedSequence:snapshot.sequence}
    transaction(id,request,ctx=>{ctx.c.prepare('INSERT INTO publication_receipts VALUES (?,?,?,?,?,?,NULL,?,?)').run(id,uuid(),pub.publication_id,attemptId,phase,phase==='verified'?pub.payload_sha256:null,'{}',ctx.seq);return {publicationId:pub.publication_id,phase}})
  }
  receipt('pending')
  if(workerData.fault==='before_projection')fail('TEST_FAULT','Injected projection interruption')
  if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==pub.payload_sha256){
    const temp=safe(path.join(directory(id),`.intake-${pub.publication_id}.tmp`))
    if(fs.existsSync(temp)){if(hash(fs.readFileSync(temp))!==pub.payload_sha256)fail('PROJECTION_CONFLICT','Unknown staging bytes preserved.')}else{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,payload);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
    // Immutable per-snapshot destination: a stale publisher cannot replace a newer view.
    // link is atomic and refuses to clobber a concurrently created/manual file.
    try{fs.linkSync(temp,target)}catch(error){if(error.code!=='EEXIST'||hash(fs.readFileSync(target))!==pub.payload_sha256)throw error}
    syncDirectory(directory(id))
  }
  if(workerData.fault==='after_projection')fail('TEST_FAULT','Injected receipt interruption')
  if(hash(fs.readFileSync(target))!==pub.payload_sha256)fail('PROJECTION_CONFLICT','Projection readback mismatch.')
  receipt('verified');return {...snapshot,projectionPending:false}
}

// PRD operations extend the same schema/writer. Model text never supplies SQL,
// record IDs, paths, control actions, approvals or activation records.
function intakeDigest(snapshot){return hash(canonical({answers:snapshot.answers,clarification:snapshot.clarification||null}))}
function prdHead(c,id,kind){
  return c.prepare('SELECT r.*,h.changed_seq FROM head_refs h JOIN record_versions r USING(project_id,record_id,revision) WHERE h.project_id=? AND h.head_kind=? AND h.scope_id=?').get(id,kind,id)
}
function prdChangeRefs(c,id,row,seen=new Set()){
  if(!row)return []
  const key=row.record_id+':'+row.revision
  if(seen.has(key)||seen.size>=32)fail('PRD_SOURCE_LIMIT','PRD source history needs consolidation; no owner changes were omitted.')
  seen.add(key)
  const body=JSON.parse(row.body_json);let refs
  if(body.change_requests)refs=body.change_requests
  else{
    const links=c.prepare('SELECT r.*,l.relation FROM record_links l JOIN record_versions r ON r.project_id=l.project_id AND r.record_id=l.to_id AND r.revision=l.to_revision WHERE l.project_id=? AND l.from_id=? AND l.from_revision=?').all(id,row.record_id,row.revision)
    const base=links.find(r=>r.kind==='plan'&&r.relation==='base')
    refs=prdChangeRefs(c,id,base,seen).map(({id,revision})=>({id,revision}))
    refs.push(...links.filter(r=>r.kind==='decision'&&r.relation==='sourced_from'&&JSON.parse(r.body_json).changeRequest).map(r=>({id:r.record_id,revision:r.revision})))
  }
  const unique=[...new Map(refs.map(ref=>[ref.id+':'+ref.revision,ref])).values()]
  const changes=unique.map(ref=>{const source=c.prepare("SELECT body_json FROM record_versions WHERE project_id=? AND record_id=? AND revision=? AND kind='decision'").get(id,ref.id,ref.revision);if(!source)fail('PRD_SOURCE','Applied owner change source is missing.');const value=JSON.parse(source.body_json);if(value.decision_class!=='owner_ruling'||typeof value.changeRequest!=='string'||!value.changeRequest)fail('PRD_SOURCE','Applied owner change source is invalid.');return {id:ref.id,revision:ref.revision,text:value.changeRequest}})
  if(changes.length>32||Buffer.byteLength(changes.map(r=>r.text).join('\n'),'utf8')>16384)fail('PRD_SOURCE_LIMIT','PRD source history exceeds 32 changes / 16 KiB; no changes were omitted.')
  return changes
}
function prdState(c,id,snapshot){
  const row=prdHead(c,id,'candidate_plan'),requestRow=prdHead(c,id,'prd_request')
  const request=requestRow?JSON.parse(requestRow.body_json):undefined
  if(!row)return request?{prdRequest:request}:{}
  const body=JSON.parse(row.body_json),pub=c.prepare("SELECT * FROM publications WHERE project_id=? AND snapshot_seq=? AND purpose='prd_projection'").get(id,row.created_seq)
  const matches=file=>{const target=safe(path.join(directory(id),file));return fs.existsSync(target)&&hash(fs.readFileSync(target))===pub.payload_sha256}
  const projectionPending=!pub||!matches(`PRD.${row.created_seq}.md`)||!matches('PRD.md')||!c.prepare("SELECT 1 FROM publication_receipts WHERE project_id=? AND publication_id=? AND phase='verified'").get(id,pub.publication_id)
  const approval=prdHead(c,id,'approval'),stale=body.source_digest!==intakeDigest(snapshot)
  const pendingRequest=request?.status==='requested'
  const approved=Boolean(!stale&&!pendingRequest&&approval&&JSON.parse(approval.body_json).decision==='grant'&&c.prepare("SELECT 1 FROM record_links WHERE project_id=? AND from_id=? AND from_revision=? AND to_id=? AND to_revision=? AND relation='approves'").get(id,approval.record_id,approval.revision,row.record_id,row.revision))
  const records=Object.entries(body.keys).map(([key,ref])=>{const record=c.prepare('SELECT kind,body_json FROM record_versions WHERE project_id=? AND record_id=? AND revision=?').get(id,ref.id,ref.revision);return {key,...ref,kind:record.kind,body:JSON.parse(record.body_json),links:c.prepare('SELECT relation,to_id,to_revision FROM record_links WHERE project_id=? AND from_id=? AND from_revision=?').all(id,ref.id,ref.revision)}})
  return {prd:{revision:row.revision,commitSequence:row.created_seq,sourceDigest:body.source_digest,meaningHash:body.scope_fingerprint,content:body.content,ownerChanges:prdChangeRefs(c,id,row).map(r=>r.text),approved,stale,projectionPending,file:path.join(directory(id),'PRD.md'),records,activationCount:c.prepare("SELECT count(*) AS count FROM record_versions WHERE project_id=? AND kind='activation'").get(id).count},...(request?{prdRequest:request}:{})}
}
function validatePrd(draft,before,change){
  const object=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))fail('PRD_VALIDATION','Unexpected or missing PRD fields.')}
  const text=value=>{if(typeof value!=='string'||!value.trim()||value.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(value))fail('PRD_VALIDATION','Invalid PRD text.')}
  const list=(value,max,check)=>{if(!Array.isArray(value)||value.length>max)fail('PRD_VALIDATION','PRD list limit exceeded.');for(const item of value)check(item)}
  object(draft,['title','summary','requirements','assumptions','openQuestions']);text(draft.title);text(draft.summary)
  list(draft.assumptions,12,text);list(draft.openQuestions,12,text)
  let personalized=false
  if(before.clarification){const data=JSON.parse(before.clarification),facts=Object.fromEntries(['idea','needs','success','notes'].map(key=>[key,String(before.answers[key]??'')]));personalized=data.inputHash===hash(JSON.stringify(facts))&&Object.values(data.responses).some(value=>typeof value==='string'&&value.trim())}
  const sources=new Set(['idea','needs','success','notes'].filter(key=>before.answers[key]?.trim()));if(personalized)sources.add('personalized');if(change)sources.add('change')
  const keys=new Set()
  list(draft.requirements,12,requirement=>{
    object(requirement,['key','outcome','scope','priority','exclusions','openQuestions','sourceFields','criteria'])
    if(!/^R[1-9]\d{0,2}$/.test(requirement.key)||keys.has(requirement.key))fail('PRD_VALIDATION','Invalid or duplicate requirement key.');keys.add(requirement.key)
    text(requirement.outcome);if(!['required','optional'].includes(requirement.scope)||!['high','medium','low'].includes(requirement.priority))fail('PRD_VALIDATION','Invalid requirement scope or priority.')
    list(requirement.exclusions,12,text);list(requirement.openQuestions,12,text)
    list(requirement.sourceFields,6,key=>{if(!sources.has(key))fail('PRD_SOURCE','Requirement references absent owner input.')});if(!requirement.sourceFields.length)fail('PRD_SOURCE','Each requirement needs an actual owner source.')
    const criteria=new Set();list(requirement.criteria,4,criterion=>{
      object(criterion,['key','description','method','blocking']);text(criterion.description)
      if(!/^C[1-9]\d{0,2}$/.test(criterion.key)||criteria.has(criterion.key)||!['tool_check','owner_review','policy_check'].includes(criterion.method)||typeof criterion.blocking!=='boolean')fail('PRD_VALIDATION','Invalid or duplicate criterion.');criteria.add(criterion.key)
    });if(!requirement.criteria.length)fail('PRD_VALIDATION','Each requirement needs acceptance criteria.')
  })
  if(!draft.requirements.length||Buffer.byteLength(canonical(draft))>65536)fail('PRD_VALIDATION','PRD draft is empty or exceeds 64 KiB.')
}
const prdText=value=>String(value).replace(/[\\`*_[\]<>#|]/g,'\\$&').replace(/[\r\n]+/g,' ')
function renderPrd(id,revision,draft,digest,meaning,before,change,ownerChanges=[]){
  return ['# PRD — '+prdText(draft.title),'',`Project: ${id}`,`Revision: ${revision}`,`Reviewed meaning: ${meaning}`,`Saved-input digest: ${digest}`,'','Approval and Build authorization are recorded separately by the app. This file grants no permission to start work. Referenced files and URLs were not opened by this tool-free drafting step.','','## Purpose',prdText(draft.summary),'',...draft.requirements.flatMap(r=>[
    `## ${r.key} — ${prdText(r.outcome)}`,`Scope: ${r.scope}; priority: ${r.priority}`,`Owner source fields: ${r.sourceFields.join(', ')}`,
    ...r.exclusions.map(x=>'- Excluded: '+prdText(x)),...r.openQuestions.map(x=>'- Unresolved: '+prdText(x)),
    ...r.criteria.map(x=>`- ${r.key}-${x.key}: ${prdText(x.description)} [${x.method}; ${x.blocking?'blocking':'nonblocking'}; not yet performed]`),'',
  ]),'## Proposed assumptions',...(draft.assumptions.length?draft.assumptions.map(x=>'- '+prdText(x)):['None.']),'','## Material open questions',...(draft.openQuestions.length?draft.openQuestions.map(x=>'- '+prdText(x)):['None recorded.']),'','## Applied owner change history',...ownerChanges.flatMap((value,index)=>[`### Change ${index+1}`,...value.split(/\r?\n/).map(line=>'    '+line),'']),'','## Saved owner input',...Object.entries(before.answers).flatMap(([key,value])=>[`### ${key}`,...String(value).split(/\r?\n/).map(line=>'    '+line),'']),...(before.clarification?['### Personalized questions and owner responses','    '+before.clarification,'']:[]),...(change?['### Owner revision request',...change.split(/\r?\n/).map(line=>'    '+line),'']:[]),''].join('\n')
}
function writePrd(request){
  const id=request.projectId,c=open(id)
  const original=c.prepare('SELECT * FROM operations WHERE project_id=? AND operation_id=?').get(id,request.operationId)
  if(original){if(original.request_sha256!==hash(canonical(request)))fail('CONFLICT','Operation identity reused with different input.');return JSON.parse(original.result_json)}
  const before=state(id)
  if(!before.sequence||before.projectionPending)fail('PRD_INTAKE','Save and repair the intake before creating or approving its PRD.')
  if(before.stopped)fail('STOPPED','Explicitly resume the saved intake first. PRD approval cannot resume it.')
  if(!before.answers.idea?.trim()||!before.answers.needs?.trim()||!before.answers.success?.trim())fail('PRD_INTAKE','Complete the idea, requirements and success answers first.')
  capacity(id,Buffer.byteLength(canonical(request)),false)
  if(workerData.fault==='prd_sqlite_full')c.exec(`PRAGMA max_page_count=${c.prepare('PRAGMA page_count').get().page_count}`)
  return transaction(id,request,ctx=>{
    const {c,record,seq}=ctx,current=prdHead(c,id,'candidate_plan'),prior=current?JSON.parse(current.body_json):undefined
    if((current?.revision||0)!==request.expectedPlanRevision)fail('STALE_PRD','A newer PRD revision exists. Reopen it before changing or approving it.')
    const requestRow=prdHead(c,id,'prd_request'),intent=requestRow?JSON.parse(requestRow.body_json):undefined,digest=intakeDigest(before)
    if(request.type==='prd_request'){
      const change=request.changeRequest||''
      if(Buffer.byteLength(change,'utf8')>4096)fail('PRD_VALIDATION','Keep the revision request within 4 KiB.')
      const links=[]
      if(current)links.push({id:current.record_id,revision:current.revision,relation:'targets'})
      if(change){const source=record('source',uuid(),{origin_kind:'native_prd_revision',authority_class:'owner_input',permitted_use:'local_prd_planning',coverage:'inspected',permitted_text:change,inspected_sha256:hash(change),gaps:[]});const received=record('change',uuid(),{disposition:'received',clause_delta:change,material_gaps:[]},undefined,[{...source,relation:'sourced_from'},...links]);links.push({...received,relation:'sourced_from'})}
      record('decision',requestRow?.record_id||uuid(),{statement:'Owner requested a PRD proposal, not Build',decision_class:'owner_ruling',applicability:`prd:${id}`,unresolved:true,requestId:request.requestId,status:'requested',changeRequest:change,sourceDigest:digest},['prd_request',id],links)
      return {projectId:id,requestId:request.requestId,sequence:seq}
    }
    if(!intent||intent.requestId!==request.requestId||intent.sourceDigest!==digest)fail('STALE_PRD','The proposal request was superseded or its saved inputs changed.')
    if(request.type==='prd_approve'){
      if(!current||before.prd.stale||prdState(c,id,before).prd.projectionPending||intent.status!=='done')fail('PRD_REVIEW','Review the current, fully saved PRD; a newer change or publication is pending.')
      if(request.reviewedMeaningHash!==prior.scope_fingerprint)fail('STALE_PRD','Approval does not match the exact reviewed meaning.')
      if(prior.content.openQuestions.length||prior.content.requirements.some(r=>r.openQuestions.length))fail('PRD_GAPS','Resolve material open questions before approval.')
      const review=record('review',uuid(),{review_kind:'owner',verdict:'pass',candidate_manifest_sha256:prior.scope_fingerprint,coverage_limits:'Owner reviewed proposed scope and assumptions; implementation and checks not performed.'},undefined,[{id:current.record_id,revision:current.revision,relation:'reviews'}])
      record('approval',uuid(),{decision:'grant',reviewed_meaning_sha256:prior.scope_fingerprint,review_mode:'owner'},['approval',id],[{id:current.record_id,revision:current.revision,relation:'approves'},{...review,relation:'sourced_from'}])
      return {projectId:id,planRevision:current.revision,buildAuthorized:false}
    }
    if(request.type!=='prd_candidate'||intent.status!=='requested')fail('PRD_REQUEST','A completed draft request cannot be reused for a different candidate.')
    const changes=prdChangeRefs(c,id,current)
    if(intent.changeRequest)changes.push({id:requestRow.record_id,revision:requestRow.revision,text:intent.changeRequest})
    if(changes.length>32||Buffer.byteLength(changes.map(r=>r.text).join('\n'),'utf8')>16384)fail('PRD_SOURCE_LIMIT','PRD source history exceeds 32 changes / 16 KiB; nothing was omitted.')
    validatePrd(request.draft,before,changes.length)
    const draft=request.draft,sourceHeads=c.prepare("SELECT * FROM head_refs WHERE project_id=? AND head_kind IN ('answer','intake_clarification')").all(id)
    const sourceLinks=sourceHeads.map(h=>({id:h.record_id,revision:h.revision,relation:'sourced_from'}))
    const keys={},all=[]
    for(const r of draft.requirements){
      const previous=prior?.keys?.[r.key],rid=previous?.id||uuid(),rev=previous?previous.revision+1:1
      const criteria=r.criteria.map(cr=>{const old=prior?.keys?.[`${r.key}-${cr.key}`],cid=old?.id||uuid();return record('criterion',cid,{description:cr.description,method:cr.method,blocking:cr.blocking},undefined,[{id:rid,revision:rev,relation:'criterion_for'}])})
      const sourceRefs=sourceHeads.filter(h=>r.sourceFields.includes(h.scope_id)||(r.sourceFields.includes('personalized')&&h.head_kind==='intake_clarification')).map(h=>({id:h.record_id,revision:h.revision,relation:'sourced_from'}))
      if(r.sourceFields.includes('change'))sourceRefs.push(...changes.map(ref=>({id:ref.id,revision:ref.revision,relation:'sourced_from'})))
      const requirement=record('requirement',rid,{outcome:r.outcome,scope:r.scope,priority:r.priority,exclusions:r.exclusions,open_questions:r.openQuestions},undefined,[...sourceRefs,...criteria.map(cr=>({...cr,relation:'has_criterion'}))])
      keys[r.key]=requirement;r.criteria.forEach((cr,i)=>{keys[`${r.key}-${cr.key}`]=criteria[i]});all.push(requirement,...criteria)
    }
    const meaning=hash(canonical(draft)),plan=record('plan',current?.record_id||uuid(),{title:draft.title,scope_fingerprint:meaning,unresolved_material_gaps:[...draft.openQuestions,...draft.requirements.flatMap(r=>r.openQuestions)],source_digest:digest,content:draft,keys,change_requests:changes.map(({id,revision})=>({id,revision}))},['candidate_plan',id],[...all.map(ref=>({...ref,relation:'contains'})),...sourceLinks,...changes.filter(ref=>ref.id!==requestRow.record_id||ref.revision!==requestRow.revision).map(ref=>({id:ref.id,revision:ref.revision,relation:'sourced_from'})),{id:requestRow.record_id,revision:requestRow.revision,relation:'sourced_from'},...(current?[{id:current.record_id,revision:current.revision,relation:'base'}]:[])])
    record('decision',requestRow.record_id,{...intent,unresolved:false,status:'done'},['prd_request',id],[{...plan,relation:'proposes'}])
    const payload=Buffer.from(renderPrd(id,plan.revision,draft,digest,meaning,before,intent.changeRequest,changes.map(r=>r.text)))
    c.prepare('INSERT INTO publications VALUES (?,?,?,?,?,NULL,?,?,?,?,1)').run(id,uuid(),request.operationId,seq,'prd_projection',canonical({file:`PRD.${seq}.md`,current:'PRD.md'}),canonical({candidate_plan:plan}),hash(payload),payload)
    return {projectId:id,planRevision:plan.revision,sequence:seq}
  })
}
function activate(request){
  const id=request.projectId,c=open(id)
  const original=c.prepare('SELECT * FROM operations WHERE project_id=? AND operation_id=?').get(id,request.operationId)
  if(original){if(original.request_sha256!==hash(canonical(request)))fail('CONFLICT','Operation identity reused with different input.');return JSON.parse(original.result_json)}
  const before=state(id),plan=prdHead(c,id,'candidate_plan'),approval=prdHead(c,id,'approval')
  if(!before.sequence||before.projectionPending||before.prd?.projectionPending)fail('ACTIVATION_INPUT','Repair saved intake and PRD publications before Build.')
  if(before.stopped)fail('STOPPED','Explicitly resume the saved project before Build.')
  if(!plan||!approval||!before.prd?.approved||before.prd.stale)fail('PRD_REVIEW','Approve the exact current PRD before Build.')
  if(plan.revision!==request.expectedPlanRevision||before.prd.meaningHash!==request.reviewedMeaningHash)fail('STALE_PRD','Build does not match the exact approved PRD. Reopen and review it.')
  if(Number(before.answers.helpers||1)!==request.selectedTotal)fail('ROSTER','Selected agent total changed. Return to intake and create a new PRD revision.')
  if(typeof request.workspaceRoot!=='string'||request.workspaceRoot.includes('\0'))fail('WORKSPACE','Build requires an exact absolute workspace binding.')
  if(windows)windows.bindWorkspace(request.workspaceRoot)
  else if(!path.posix.isAbsolute(request.workspaceRoot))fail('WORKSPACE','Build requires an exact absolute Linux/WSL workspace binding.')
  capacity(id,Buffer.byteLength(canonical(request)),false)
  return transaction(id,request,({c,record,seq})=>{
    const existing=prdHead(c,id,'activation')
    if(existing)fail('ALREADY_ACTIVE','This approved PRD already has an activation. Reopen its existing run instead of creating another.')
    const packetBody={schema:'amirahco.context-packet.v1',project_id:id,role:'lead',purpose:'activation',plan:{record_id:plan.record_id,revision:plan.revision,meaning_hash:request.reviewedMeaningHash},controls:{stopped:false,selected_total:request.selectedTotal},workspace:{root:request.workspaceRoot,trust:'bound_by_native_build_action'},capability_profile_digest:request.capabilityProfileDigest,owner_facts:before.answers,personalized:before.clarification?JSON.parse(before.clarification):null,omissions:['Mentioned files and URLs were not opened by intake or PRD drafting.','Context grants no tool, spending, publication or external-effect permission.'],packet_digest:''}
    packetBody.packet_digest=hash(canonical({...packetBody,packet_digest:undefined}))
    const packet=record('context_packet',uuid(),packetBody,['context_packet','lead'],[{id:plan.record_id,revision:plan.revision,relation:'derived_from'}])
    const profile=record('policy_profile',uuid(),{digest:request.capabilityProfileDigest,selected_total:request.selectedTotal,skill_boundary:'native_skill_tool',automatic_matching:'advisory'},['policy_profile','activation'])
    const binding=record('binding',uuid(),{binding_kind:'trusted_workspace',workspace_root:request.workspaceRoot,native_session_id:request.nativeSessionId},['binding','workspace'])
    const activation=record('activation',uuid(),{status:'activated',plan_revision:plan.revision,meaning_hash:request.reviewedMeaningHash,selected_total:request.selectedTotal,workspace_root:request.workspaceRoot,native_session_id:request.nativeSessionId,capability_profile_digest:request.capabilityProfileDigest},['activation',id],[{id:plan.record_id,revision:plan.revision,relation:'activates'},{id:approval.record_id,revision:approval.revision,relation:'authorized_by'},{...packet,relation:'uses_context'},{...profile,relation:'uses_profile'},{...binding,relation:'uses_binding'}])
    return {projectId:id,activationId:activation.id,activationRevision:activation.revision,contextPacketId:packet.id,contextPacketRevision:packet.revision,contextDigest:packetBody.packet_digest,sequence:seq}
  })
}
function writeProjectRecord(request){
  const id=request.projectId,c=open(id),before=state(id)
  const original=c.prepare('SELECT * FROM operations WHERE project_id=? AND operation_id=?').get(id,request.operationId)
  if(original){if(original.request_sha256!==hash(canonical(request)))fail('CONFLICT','Operation identity reused with different input.');return JSON.parse(original.result_json)}
  if(!before.activation)fail('ACTIVATION_INPUT','Build activation is required before project result records.')
  if(before.stopped&&request.type!=='incident')fail('STOPPED','Project work records are fenced while Stop is active.')
  capacity(id,Buffer.byteLength(canonical(request)),request.type==='incident')
  return transaction(id,request,({c,record,seq})=>{
    const links=request.links||[]
    for(const link of links)if(!c.prepare('SELECT 1 FROM record_versions WHERE project_id=? AND record_id=? AND revision=?').get(id,link.id,link.revision))fail('RECORD_REF','A referenced project record does not exist.')
    let saved
    if(request.type==='submission_intent'){
      const current=state(id)
      if(current.stopped||!current.prd?.approved||current.prd.stale||current.prd.projectionPending||current.projectionPending||request.activationId!==current.activation?.activationId||current.prd.revision!==current.activation.planRevision||current.prd.meaningHash!==current.activation.meaningHash)fail('STALE_CONTEXT','Submission intent requires the current approved, published and unstopped activation.')
      saved=record('context_packet',request.recordId,{schema:'amirahco.result-submission.v1',role:'result_submission_intent',activation_id:request.activationId,submission_id:request.submissionId,serialized:request.serialized,payload_sha256:hash(request.serialized),authority:'application_observation_not_owner_approval',omissions:[]},['context_packet',`submission:${request.submissionId}`],links)
    }else if(request.type==='run_binding'){
      if(request.activationId!==before.activation.activationId||request.contextDigest!==before.activation.contextDigest||request.profileDigest!==before.activation.capabilityProfileDigest)fail('STALE_CONTEXT','Run binding does not match the current activation context/profile.')
      saved=record('binding',request.recordId,{binding_kind:'foundry_run',run_id:request.runId,native_session_id:request.nativeSessionId,context_digest:request.contextDigest,profile_digest:request.profileDigest},['binding','run'],links)
    }else if(request.type==='artifact'){
      if(c.prepare('SELECT 1 FROM artifacts WHERE project_id=? AND artifact_id=?').get(id,request.artifactId))fail('ARTIFACT_CONFLICT','Artifact identity already exists; record a new immutable identity for changed bytes.')
      c.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)').run(id,request.artifactId,request.kind,request.relativeLocator,request.byteLength,request.sha256,request.classification,seq)
      saved=record('artifact_status',request.recordId,{artifact_id:request.artifactId,status:'observed',sha256:request.sha256,byte_length:request.byteLength,relative_locator:request.relativeLocator},['artifact_status',request.artifactId],links)
      c.prepare('INSERT INTO artifact_bindings VALUES (?,?,?,?,?,?)').run(id,saved.id,saved.revision,request.artifactId,'observed_artifact',seq)
    }else if(request.type==='check'){
      if(!c.prepare('SELECT 1 FROM record_versions WHERE project_id=? AND record_id=? AND revision=? AND kind=\'criterion\'').get(id,request.criterionId,request.criterionRevision))fail('CRITERION_REF','Check criterion is absent or stale.')
      for(const artifactId of request.artifactIds)if(!c.prepare('SELECT 1 FROM artifacts WHERE project_id=? AND artifact_id=?').get(id,artifactId))fail('ARTIFACT_REF','Check artifact is missing.')
      saved=record('check',request.recordId,{criterion_id:request.criterionId,criterion_revision:request.criterionRevision,artifact_ids:request.artifactIds,checker:request.checker,method:request.method,input_hashes:request.inputHashes,outcome:request.outcome,evidence_refs:request.evidenceRefs,performed:true},['check',request.recordId],links)
    }else if(request.type==='review'){
      for(const checkId of request.checkIds)if(!c.prepare("SELECT 1 FROM record_versions WHERE project_id=? AND record_id=? AND kind='check'").get(id,checkId))fail('CHECK_REF','Review check is missing.')
      for(const artifactId of request.artifactIds)if(!c.prepare('SELECT 1 FROM artifacts WHERE project_id=? AND artifact_id=?').get(id,artifactId))fail('ARTIFACT_REF','Review artifact is missing.')
      saved=record('review',request.recordId,{reviewer:request.reviewer,criteria_revision:request.criteriaRevision,artifact_ids:request.artifactIds,check_ids:request.checkIds,input_hashes:request.inputHashes,verdict:request.verdict,findings:request.findings,independence:request.independence},['review','current'],links)
    }else if(request.type==='acceptance'){
      if(!c.prepare("SELECT 1 FROM record_versions WHERE project_id=? AND record_id=? AND revision=? AND kind='review'").get(id,request.reviewId,request.reviewRevision))fail('REVIEW_REF','Acceptance review is missing or stale.')
      saved=record('acceptance',request.recordId,{actor:request.actor,decision:request.decision,scope:request.scope},['acceptance','current'],[{id:request.reviewId,revision:request.reviewRevision,relation:'accepts_review'},...links])
    }else if(request.type==='requirement_change'){
      saved=record('change',request.recordId,{change_id:request.changeId,statement:request.statement,base_plan_revision:request.basePlanRevision,order:request.order,affected_refs:request.affectedRefs,status:request.status},['change',request.changeId],links)
    }else if(request.type==='incident'){
      saved=record('incident',request.recordId,{failure_class:request.failureClass,observed_evidence:request.observedEvidence,impact:request.impact,prevention_evidence:request.preventionEvidence},['incident',request.recordId],links)
    }else if(request.type==='lesson'){
      if(!c.prepare("SELECT 1 FROM record_versions WHERE project_id=? AND record_id=? AND revision=? AND kind='incident'").get(id,request.incidentId,request.incidentRevision))fail('INCIDENT_REF','Lesson source incident is missing or stale.')
      saved=record('lesson',request.recordId,{prevention:request.prevention,status:request.status},['lesson',request.recordId],[{id:request.incidentId,revision:request.incidentRevision,relation:'learned_from'},...links])
    }else fail('METHOD','Unsupported project record operation.')
    return {projectId:id,recordId:saved.id,recordRevision:saved.revision,sequence:seq,type:request.type}
  })
}
function completion(id){
  const c=open(id),snapshot=state(id),blockers=[]
  if(!snapshot.activation)blockers.push('missing current activation')
  if(snapshot.stopped)blockers.push('Stop is active')
  if(!snapshot.prd?.approved||snapshot.prd.stale||snapshot.prd.projectionPending||snapshot.projectionPending)blockers.push('PRD or publication is missing, stale or unverified')
  const criteria=(snapshot.prd?.records||[]).filter(row=>row.kind==='criterion'&&row.body.blocking)
  const checks=c.prepare("SELECT * FROM record_versions WHERE project_id=? AND kind='check' ORDER BY created_seq,revision").all(id).map(row=>({...row,body:JSON.parse(row.body_json)}))
  const artifactRows=c.prepare('SELECT artifact_id,relative_locator,byte_length,sha256 FROM artifacts WHERE project_id=? ORDER BY created_seq').all(id)
  const artifacts=artifactRows.map(row=>row.artifact_id)
  const satisfied=[],missing=[]
  for(const criterion of criteria){
    const current=checks.filter(check=>check.body.criterion_id===criterion.id&&check.body.criterion_revision===criterion.revision&&check.body.outcome==='pass'&&check.body.performed&&check.body.artifact_ids.every(artifact=>artifacts.includes(artifact))).at(-1)
    ;(current?satisfied:missing).push(`${criterion.id}@${criterion.revision}`)
  }
  if(missing.length)blockers.push(`blocking criteria lack current performed pass evidence: ${missing.join(', ')}`)
  const review=c.prepare("SELECT r.* FROM head_refs h JOIN record_versions r USING(project_id,record_id,revision) WHERE h.project_id=? AND h.head_kind='review' AND h.scope_id='current'").get(id),reviewBody=review&&JSON.parse(review.body_json)
  if(!review||reviewBody.verdict!=='pass')blockers.push('missing current passing review')
  const acceptance=c.prepare("SELECT r.* FROM head_refs h JOIN record_versions r USING(project_id,record_id,revision) WHERE h.project_id=? AND h.head_kind='acceptance' AND h.scope_id='current'").get(id),acceptanceBody=acceptance&&JSON.parse(acceptance.body_json)
  if(!acceptance||acceptanceBody.decision!=='accept')blockers.push('missing current owner/required acceptance')
  const openChanges=c.prepare("SELECT body_json FROM head_refs h JOIN record_versions r USING(project_id,record_id,revision) WHERE h.project_id=? AND h.head_kind='change'").all(id).map(row=>JSON.parse(row.body_json)).filter(body=>body.status==='proposed')
  if(openChanges.length)blockers.push('unresolved requirement changes remain')
  return {projectId:id,ready:blockers.length===0,blockingCriteria:criteria.map(row=>`${row.id}@${row.revision}`),satisfiedCriteria:satisfied,blockers,artifactIds:artifacts,artifacts:artifactRows,checkIds:checks.map(row=>row.record_id),...(review?{reviewId:review.record_id}:{}),...(acceptance?{acceptanceId:acceptance.record_id}:{})}
}
function repairPrd(id){
  const snapshot=state(id),c=open(id),plan=prdHead(c,id,'candidate_plan')
  if(!plan||snapshot.prd.stale||!snapshot.prd.projectionPending)return snapshot
  const pub=c.prepare("SELECT * FROM publications WHERE project_id=? AND snapshot_seq=? AND purpose='prd_projection'").get(id,plan.created_seq)
  if(!pub)fail('RECOVERY','Current PRD has no saved publication intent.')
  const payload=Buffer.from(pub.rendered_bytes),temp=safe(path.join(directory(id),`.prd-${pub.publication_id}.tmp`)),immutable=safe(path.join(directory(id),`PRD.${pub.snapshot_seq}.md`)),alias=safe(path.join(directory(id),'PRD.md'))
  if(fs.existsSync(immutable)&&hash(fs.readFileSync(immutable))!==pub.payload_sha256)fail('PROJECTION_CONFLICT','The PRD revision was edited outside the writer. It has been preserved.')
  const attempt=uuid()
  const receipt=(phase,apply)=>transaction(id,{projectId:id,operationId:uuid(),sessionId:'deterministic-prd-projection',type:'publication_receipt',expectedSequence:snapshot.sequence},ctx=>{
    if(apply){const current=prdHead(c,id,'candidate_plan');if(current.record_id!==plan.record_id||current.revision!==plan.revision)fail('STALE_PRD','A newer PRD owns the current projection.');apply()}
    ctx.c.prepare('INSERT INTO publication_receipts VALUES (?,?,?,?,?,?,NULL,?,?)').run(id,uuid(),pub.publication_id,attempt,phase,phase==='verified'?pub.payload_sha256:null,'{}',ctx.seq);return {publicationId:pub.publication_id,phase}
  })
  receipt('pending')
  if(workerData.fault==='prd_before_projection')fail('TEST_FAULT','Injected PRD projection interruption')
  if(fs.existsSync(temp)){if(hash(fs.readFileSync(temp))!==pub.payload_sha256)fail('PROJECTION_CONFLICT','Unknown PRD staging bytes preserved.')}else{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,payload);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
  if(!fs.existsSync(immutable)){try{fs.linkSync(temp,immutable)}catch(error){if(error.code!=='EEXIST'||hash(fs.readFileSync(immutable))!==pub.payload_sha256)throw error}}
  // SQLite's write lock serializes current-head validation and alias replacement.
  // A stale publisher cannot overwrite a newer current view.
  receipt('verified',()=>{
    if(fs.existsSync(alias)){
      const actual=hash(fs.readFileSync(alias))
      if(actual!==pub.payload_sha256&&!c.prepare("SELECT 1 FROM publications WHERE project_id=? AND purpose='prd_projection' AND payload_sha256=?").get(id,actual))fail('PROJECTION_CONFLICT','PRD.md was edited outside the writer. The file has been preserved. Move the manual copy aside, then repair the saved document.')
    }
    if(!fs.existsSync(alias)||hash(fs.readFileSync(alias))!==pub.payload_sha256){
      const staging=safe(path.join(directory(id),`.prd-current-${attempt}.tmp`)),fd=fs.openSync(staging,'wx',0o600);try{fs.writeFileSync(fd,payload);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(staging,alias)
    }
    syncDirectory(directory(id))
    if(hash(fs.readFileSync(alias))!==pub.payload_sha256||hash(fs.readFileSync(immutable))!==pub.payload_sha256)fail('PROJECTION_CONFLICT','PRD projection readback mismatch.')
    if(workerData.fault==='prd_after_projection')fail('TEST_FAULT','Injected PRD receipt interruption')
  })
  return state(id)
}
function repairAll(id){repair(id);return repairPrd(id)}
parentPort.on('message',message=>{
  try {
    const {method,args}=message
    let result
    if(method==='save'){
      if(workerData.fault==='before_commit')fail('TEST_FAULT','Injected noncommit')
      const outcome=save(args)
      if(workerData.fault==='after_commit_exit')process.exit(98)
      if(workerData.fault==='after_commit')fail('TEST_FAULT','Injected lost reply')
      try{result={...repairAll(args.projectId),operation:outcome}}catch(error){result={...state(args.projectId),operation:outcome,recoveryError:error.code||'IO'}}
    }else if(method==='prd'){
      const outcome=writePrd(args)
      if(workerData.fault==='prd_after_commit_exit')process.exit(98)
      try{result={...repairAll(args.projectId),operation:outcome}}catch(error){result={...state(args.projectId),operation:outcome,recoveryError:error.code||'IO'}}
    }else if(method==='activate'){
      const outcome=activate(args)
      if(workerData.fault==='activation_after_commit_exit')process.exit(98)
      result={...state(args.projectId),operation:outcome}
    }else if(method==='record'){
      const outcome=writeProjectRecord(args)
      if(workerData.fault==='submission_after_intent_exit'&&args.type==='submission_intent')process.exit(98)
      result={...state(args.projectId),operation:outcome}
    }else if(method==='completion')result=completion(args.projectId)
    else if(method==='read')result=state(args.projectId)
    else if(method==='repair')result=repairAll(args.projectId)
    else if(method==='list'){
      result=[]
      if(fs.existsSync(root))for(const entry of fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory()&&/^[0-9a-f-]{36}$/.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name)).slice(args.offset,args.offset+200)){
        try{result.push(state(entry.name))}catch(error){result.push({projectId:entry.name,unavailable:true,error:error.code||'READ'})}
      }
    }else if(method==='close'){if(db)db.close();parentPort.close();return}
    else fail('METHOD','Unsupported record operation.')
    parentPort.postMessage({id:message.id,result})
  }catch(error){parentPort.postMessage({id:message.id,error:{code:error.code||'STORAGE',message:error.code?error.message:'Record operation failed. Preserve state and retry the original operation or reopen.'}})}
})
