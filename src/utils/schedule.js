import cron from 'node-cron'
import { pushAnnouncement } from '../services/pushService.js'
import { getAllBots } from '../services/accountService.js'
import data from '../storage/redisStore.js'
import { getConfig } from '../../config/config.js'

let cronJob = null
let config = null

function parseScheduleTime(scheduleTime) {
  if (typeof scheduleTime !== 'string') {
    return { hour: 8, minute: 0 }
  }
  
  // 解析时间点格式：HH:MM 或 H:MM
  const match = scheduleTime.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const hour = parseInt(match[1])
    const minute = parseInt(match[2])
    
    // 验证时间有效性
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute }
  }
  }
  
  // 默认返回 8:00
  return { hour: 8, minute: 0 }
}

function checkBotAvailability(bot) {
  try {
    return bot.gl && typeof bot.gl.keys === 'function' && Array.from(bot.gl.keys()).length > 0
  } catch (error) {
    logger.warn(`[Notice-plugin] 定时任务：检查账号 ${bot.uin} 状态失败: ${error}`)
    return false
  }
}

export async function start() {
  try {
    config = await getConfig()
    if (!config) {
      logger.error('[Notice-plugin] 配置未加载，定时推送任务无法启动。')
      return
    }
    
    if (!config.enableSchedule) {
      logger.info('[Notice-plugin] 定时推送任务已被配置关闭。')
      return
    }
    
    if (cronJob) {
      logger.info('[Notice-plugin] 定时任务已在运行中。')
      return
    }

    const { hour, minute } = parseScheduleTime(config.scheduleTime)
    const cronExpr = `${minute} ${hour} * * *`

    cronJob = cron.schedule(cronExpr, async () => {
      logger.info(`[Notice-plugin] 开始执行每日定时公告推送，规则: ${cronExpr}`)
      
      const bots = await getAllBots()
      if (bots.length === 0) {
        logger.info('[Notice-plugin] 定时任务：没有登录的账号，跳过推送。')
        return
      }
      
      const enabledBots = bots.filter(checkBotAvailability)
      
      if (enabledBots.length === 0) {
        logger.info('[Notice-plugin] 定时任务：没有可用的账号（账号无群组或状态异常），跳过推送。')
        return
      }
      
      const accountInfo = enabledBots.map(bot => 
        `${bot.nickname || bot.info?.nickname || '未知'}(${bot.uin})`
      ).join(', ')
      logger.info(`[Notice-plugin] 定时任务：检测到 ${enabledBots.length} 个可用账号: ${accountInfo}`)
      
      const fakeEvent = {
        bot: enabledBots[0],
        reply: (msg) => logger.info(`[Notice-plugin] Cron Job: ${msg}`),
        isGroup: false,
        isMaster: true
      }
      
      const notice = await data.getCurrentNotice()
      if (!notice) {
        logger.info('[Notice-plugin] 定时任务：当前没有公告，跳过推送。')
        return
      }
      
      if (notice.status !== '当前' || notice.push !== '未推送') {
        logger.info('[Notice-plugin] 定时任务：无未推送的当前公告，跳过推送。')
        return
      }
      
      logger.info(`[Notice-plugin] 定时任务：检测到未推送的当前公告，开始推送公告到 ${enabledBots.length} 个可用账号`)
      pushAnnouncement(fakeEvent, true)
    }, {
      timezone: 'Asia/Shanghai'
    })

    logger.info(`[Notice-plugin] 定时推送任务已启动，执行规则: ${cronExpr}`)
  } catch (error) {
    logger.error('[Notice-plugin] 启动定时任务失败:', error)
  }
}

export function stop() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    logger.info('[Notice-plugin] 定时推送任务已停止。')
  }
}
