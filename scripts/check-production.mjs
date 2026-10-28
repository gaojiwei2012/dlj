import {existsSync,readFileSync} from 'node:fs'
const required=['INIT_ADMIN_PASSWORD','INIT_INVITE_CODE','DOMAIN']
if(!existsSync('.env'))throw new Error('缺少 .env，请从 .env.example 复制并填写')
const env=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}))
for(const k of required)if(!env[k])throw new Error(`缺少 ${k}`)
if(env.INIT_ADMIN_PASSWORD.length<12||/change-this|admin123456/i.test(env.INIT_ADMIN_PASSWORD))throw new Error('管理员初始密码必须至少12位且不能使用示例密码')
if(env.INIT_INVITE_CODE==='DOULIUJI2026')throw new Error('正式环境不能使用默认邀请码')
if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(env.DOMAIN)||/\.example(?:\.com)?$/i.test(env.DOMAIN))throw new Error('DOMAIN 应填写已解析的正式域名，不含协议、端口或路径')
console.log('生产环境配置检查通过')
