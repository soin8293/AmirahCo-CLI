export type UpdateCheck =
  | {kind:'available'; digest:string; manifest:{version:string; sequence:number; notes:string}; message:string}
  | {kind:'ready' | 'current' | 'unconfigured' | 'deferred'; message:string}
export function createWindowsUpdater(): {
  configured:boolean
  check(force?:boolean):Promise<UpdateCheck>
  approve(digest:string):Promise<{kind:'ready';message:string}>
  reconcile():Promise<{kind:'idle'} | {kind:'held' | 'installed';message:string}>
  selectedApp():string | null
  lease():()=>void
  enter():Promise<{kind:string;message?:string;releaseLease:()=>void;selected:string | null}>
}
export function runWindowsUpdateCommand():Promise<void>
