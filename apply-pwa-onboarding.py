from pathlib import Path

app=Path('src/App.vue')
css=Path('src/styles.css')
server=Path('server/index.mjs')
source=app.read_text()
style=css.read_text()
backend=server.read_text()

def replace_once(s, old, new, label):
    assert s.count(old)==1, f'{label}: expected one anchor, found {s.count(old)}'
    return s.replace(old,new)

source=replace_once(source,'const checkoutSuccess=ref(false)','const checkoutSuccess=ref(false),pwaOnboarding=ref(false)','state')
source=replace_once(source,'await loadYears();await core()}catch(e){msg(e.message)}}\nasync function changeYear',
    'await loadYears();await core();showFirstLoginPwaGuide()}catch(e){msg(e.message)}}\nasync function changeYear','login flow')
helper="""function showFirstLoginPwaGuide(){
  if(!/Android|iPad|iPhone|iPod/i.test(navigator.userAgent)||window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)return
  // Installation belongs to a device, so remember the first prompt per account on this device.
  const key='douliuji-pwa-guide-v1-'+String(user.value?.id||form.value.username)
  try{if(localStorage.getItem(key))return;localStorage.setItem(key,'seen')}catch{return}
  tab.value='home'
  pwaOnboarding.value=true
}
"""
source=replace_once(source,'async function changeYear',helper+'async function changeYear','guide function')
assert source.count('<PwaInstall />')==2, 'old button placement changed'
source=source.replace('<PwaInstall />','')
source=replace_once(source,'</button></nav>\n<div v-if="modal"',
    '</button></nav>\n<PwaInstall :open="pwaOnboarding" @close="pwaOnboarding=false" />\n<div v-if="modal"','guide placement')

start=style.index('.pwa-install {')
end=style.index('.auth-page {',start)
new_rules="""/* First successful sign-in guide: the home stays visible beneath a light veil. */
.pwa-onboarding { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 24px; background: rgba(222, 232, 228, .86); }
.pwa-onboarding-card { width: min(100%, 342px); max-height: calc(100dvh - 48px); overflow-y: auto; padding: 27px 24px 25px; border-radius: 28px; background: #fff; box-shadow: 0 15px 38px rgba(21, 60, 54, .16); text-align: center; }
.pwa-onboarding-icon { display: grid; place-items: center; width: 62px; height: 62px; margin: 0 auto 22px; border-radius: 18px; background: #e7f5f0; color: #0f766e; font-size: 36px; line-height: 1; }
.pwa-onboarding-card h2 { margin: 0; color: #173e38; font-size: 24px; }
.pwa-onboarding-card > p { margin: 17px 0 26px; color: #667d75; font-size: 15px; line-height: 1.7; }
.pwa-onboarding-action { display: block; width: 100%; min-height: 58px; border: 0; border-radius: 16px; background: #0f766e; color: #fff; font: inherit; font-size: 18px; font-weight: 700; }
.pwa-onboarding-action:disabled { opacity: .65; }
.pwa-onboarding-skip { display: block; margin: 20px auto 0; padding: 8px 20px; border: 0; background: none; color: #738780; font: inherit; font-size: 15px; }
.pwa-onboarding-help { margin: 0 0 5px; padding: 14px; border-radius: 14px; background: #edf6f2; color: #23483f; text-align: left; }
.pwa-onboarding-help p { margin: 7px 0 0; font-size: 14px; line-height: 1.6; }
"""
assert style.count('.pwa-install {')==1 and '.pwa-onboarding {' not in style
style=style[:start]+new_rules+style[end:]
style=replace_once(style,'  .auth-page {\n    background-position: center center;\n  }',
    "  .auth-page {\n    background-image: linear-gradient(90deg, rgba(245, 250, 248, .42), rgba(248, 250, 246, .10) 67%, rgba(249, 249, 245, .16)), url('/login-background-mobile.webp');\n    background-position: center center;\n  }",'mobile image')

old="res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'});res.end(readFileSync(file))"
new="res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':/\\.(webp|png|jpg|jpeg|svg|ico)$/.test(url.pathname)?'public, max-age=86400':'no-cache'});res.end(readFileSync(file))"
backend=replace_once(backend,old,new,'static cache')

# All checks are done before any file is changed.
app.write_text(source)
css.write_text(style)
server.write_text(backend)
print('Updated src/App.vue, src/styles.css, server/index.mjs')
