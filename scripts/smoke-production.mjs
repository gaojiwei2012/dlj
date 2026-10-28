const base = process.argv[2]
if (!base) throw new Error('用法：node scripts/smoke-production.mjs https://你的域名')
const origin = new URL(base)
if (origin.pathname !== '/' || origin.search || origin.hash) throw new Error('请提供域名根地址')
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('正式地址必须使用 HTTPS')
async function check(path, verify) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`${path} 返回 HTTP ${response.status}`)
  await verify(response)
  console.log(`通过 ${path}`)
}
await check('/health', async response => {
  if ((await response.json()).status !== 'ok') throw new Error('健康检查内容不正确')
})
await check('/', async response => {
  if (!(await response.text()).includes('逗留记')) throw new Error('首页内容不正确')
})
await check('/manifest.webmanifest', async response => {
  if ((await response.json()).name !== '逗留记') throw new Error('PWA 配置不正确')
})
console.log('公开入口检查通过；登录和业务流程仍需人工验收')
