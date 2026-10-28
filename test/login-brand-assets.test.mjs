import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
test('登录页引用上传的背景和新图标', () => {
  const app = read('../src/App.vue')
  const css = read('../src/styles.css')
  const html = read('../index.html')
  const manifest = JSON.parse(read('../public/manifest.webmanifest'))
  assert.match(app, /class="auth-page"/)
  assert.match(app, /src="\/icon-192\.png"/)
  assert.match(css, /url\('\/login-background\.png'\)/)
  assert.match(html, /href="\/favicon-32\.png"/)
  assert.match(html, /href="\/apple-touch-icon\.png"/)
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512'])
  for (const name of ['login-background.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    assert.ok(statSync(new URL('../public/' + name, import.meta.url)).size > 0)
  }
})
