import fs from 'node:fs'
import { start as startCron } from './src/utils/schedule.js'

const packageJson = JSON.parse(fs.readFileSync('./plugins/Notice-plugin/package.json', 'utf8'))
const version = packageJson.version
const prefix = '[Notice-plugin]'

function logInit(msg, color = '') {
  const colors = {
    blue: '\x1b[34m',
    lightBlue: '\x1b[94m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
  }
  
  const coloredMsg = color ? `${colors[color]}${prefix} ${msg}${colors.reset}` : `${prefix} ${msg}`
  if (typeof logger !== 'undefined' && logger.info) {
    logger.info(coloredMsg)
  } else {
    console.log(coloredMsg)
  }
}

try {
  logInit('---------^_^---------', 'blue')
  logInit(`公告插件 v${version} 初始化成功~`, 'lightBlue')
  logInit('功能: 多账号公告发布, 推送, 黑白名单, 定时任务', 'lightBlue')
  logInit('---------^_^---------', 'blue')
} catch (error) {
  console.error(`${prefix} 公告插件 v${version} 初始化失败`, error)
}

try {
  startCron()
  logInit('每日自动推送任务已启动。')
} catch (error) {
  logInit(`启动定时任务失败: ${error}`, 'red')
}

const files = fs
  .readdirSync('./plugins/Notice-plugin/src/commands')
  .filter(file => file.endsWith('.js'))

const ret = await Promise.all(files.map(file => import(`./src/commands/${file}`)))

const apps = {}
for (const module of ret) {
  for (const key in module) {
    apps[key] = module[key]
  }
}

const initMultiAccount = async () => {
  try {
    const { getAllBots } = await import('./src/services/accountService.js')
    
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    const bots = await getAllBots()
    logInit(`检测到 ${bots.length} 个登录账号`, 'lightBlue')
    
    if (bots.length > 1) {
      logInit('多账号模式已启用', 'lightBlue')
    } else if (bots.length === 0) {
      logInit('未检测到登录账号，多账号功能将不可用', 'yellow')
    }
  } catch (error) {
    logInit(`多账号检测失败: ${error}`, 'red')
  }
}

initMultiAccount()

export { apps }
