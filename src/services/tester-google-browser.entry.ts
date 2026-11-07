// Reuses the official SDK/memory-only Google flow from AmirahCo's real-identity.js.
import { initializeApp } from '@firebase/app'
import { initializeAuth,inMemoryPersistence,GoogleAuthProvider,browserPopupRedirectResolver,
  signInWithPopup,signInWithRedirect,getRedirectResult,signOut } from '@firebase/auth'
import { testerFirebaseConfigSchema } from './testerFirebaseConfig.js'

async function main(){
  if(location.hostname!=='localhost'||location.protocol!=='http:')throw new Error('Open the sign-in link from AmirahCo CLI.')
  const state=document.querySelector<HTMLMetaElement>('meta[name="amirahco-state"]')?.content
  if(!state)throw new Error('Open a fresh sign-in link from AmirahCo CLI.')
  const response=await fetch('/config',{cache:'no-store'})
  if(!response.ok)throw new Error('Sign-in setup is unavailable. Return to the CLI and try again.')
  const config=testerFirebaseConfigSchema.parse(await response.json())
  const auth=initializeAuth(initializeApp(config,'amirahco-tester-google'),{persistence:inMemoryPersistence,popupRedirectResolver:browserPopupRedirectResolver})
  const google=new GoogleAuthProvider();google.setCustomParameters({prompt:'select_account'})
  const status=document.querySelector<HTMLElement>('#status'),button=document.querySelector<HTMLButtonElement>('#google'),redirect=document.querySelector<HTMLButtonElement>('#redirect')
  if(!status||!button||!redirect)throw new Error('Sign-in page is unavailable.')
  const finish=async(result:Awaited<ReturnType<typeof signInWithPopup>>|null)=>{
    if(!result)return
    try{
      const token=await result.user.getIdToken(true)
      const completed=await fetch('/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,token}),redirect:'error'})
      if(!completed.ok)throw new Error('Return to the CLI and start sign-in again.')
      status.textContent='Google sign-in received. Return to AmirahCo CLI to finish setup.'
      button.hidden=true;redirect.hidden=true
    }finally{await signOut(auth)}
  }
  const failed=()=>{status.textContent='Google sign-in could not finish. Try again, or choose Continue in this tab.';button.disabled=false;redirect.hidden=false}
  button.onclick=()=>{button.disabled=true;status.textContent='Complete Google sign-in in the new window.';void signInWithPopup(auth,google).then(finish).catch(failed)}
  redirect.onclick=()=>{void signInWithRedirect(auth,google).catch(failed)}
  button.disabled=false
  await getRedirectResult(auth).then(finish).catch(failed)
}
void main().catch(()=>{const status=document.querySelector('#status');if(status)status.textContent='Sign-in is unavailable. Return to AmirahCo CLI and try again.'})
