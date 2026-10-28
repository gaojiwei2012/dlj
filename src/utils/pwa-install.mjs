// Load with the app bundle so the install event is retained before sign-in finishes.
let pendingPrompt=null
const listeners=new Set()
if(typeof window!=='undefined'){
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault()
    pendingPrompt=event
    listeners.forEach(listener=>listener())
  })
  window.addEventListener('appinstalled',()=>{
    pendingPrompt=null
    listeners.forEach(listener=>listener())
  })
}
export function takeInstallPrompt(){const event=pendingPrompt;pendingPrompt=null;return event}
export function subscribeInstall(listener){listeners.add(listener);return ()=>listeners.delete(listener)}
