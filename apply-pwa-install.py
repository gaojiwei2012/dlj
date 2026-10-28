from pathlib import Path

app = Path('src/App.vue')
css = Path('src/styles.css')
source = app.read_text()
style = css.read_text()

import_anchor = "import DateTime24 from './components/DateTime24.vue'"
caption_anchor = '<p class="auth-caption">记录逗留，掌握进度。</p>'
assert source.count(import_anchor) == 1
assert source.count(caption_anchor) == 1
assert "import PwaInstall from './components/PwaInstall.vue'" not in source
source = source.replace(import_anchor, import_anchor + "\nimport PwaInstall from './components/PwaInstall.vue'")
source = source.replace(caption_anchor, caption_anchor + '<PwaInstall />')

account_start = source.index('<section v-if="tab===\'account\'"')
account_end = source.index('</section>', account_start)
account = source[account_start:account_end]
assert '<PwaInstall' not in account
source = source[:account_end] + '<PwaInstall />' + source[account_end:]

old_image = "url('/login-background.png')"
assert style.count(old_image) == 1
style = style.replace(old_image, "url('/login-background.webp')")
marker = '/* 登录页背景只在未登录界面显示，原图为用户提供的澳门风景 */'
assert style.count(marker) == 1
rules = '''.pwa-install { margin-top: 16px; text-align: center; }
.pwa-install-button { width: 100%; padding: 12px 16px; border: 1px solid #0f766e; border-radius: 12px; color: #0f766e; background: rgba(255,255,255,.9); font: inherit; font-weight: 700; }
.pwa-install-button:disabled { opacity: .65; cursor: wait; }
.pwa-install-help { margin-top: 10px; padding: 12px; border: 1px solid #d6e5e1; border-radius: 12px; background: #fff; color: #23483f; text-align: left; box-shadow: 0 8px 24px #11372b1a; }
.pwa-install-help strong { font-size: 14px; }
.pwa-install-help p { margin: 8px 0; font-size: 13px; line-height: 1.6; }
.pwa-install-help button { border: 0; padding: 6px 0; background: transparent; color: #0f766e; font: inherit; font-size: 13px; font-weight: 700; }
'''
assert '.pwa-install-button' not in style
style = style.replace(marker, rules + marker)

app.write_text(source)
css.write_text(style)
print('Updated src/App.vue and src/styles.css')
