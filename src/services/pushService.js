import data from '../storage/redisStore.js'
import { getAllBots, getAllPushableGroups, getAccountConfig, getPushStats } from './accountService.js'
import { info, warn, error } from '../utils/logger.js'

// 生成随机延迟（秒转毫秒）
function randomDelay(seconds) {
  const min = seconds * 0.8
  const max = seconds * 1.2
  const delaySeconds = Math.random() * (max - min) + min
  return Math.floor(delaySeconds * 1000) // 转换为毫秒
}

// 创建安全的发送函数，使用预加载的 bots 映射
function createSafeSend(botsMap) {
  return async function safeSend(groupId, uin, msg) {
    try {
      const bot = botsMap.get(String(uin))
      
      if (!bot) {
        await warn('未找到账号的 Bot 实例', { uin })
        return false
      }
      
      const group = bot.pickGroup(groupId)
      if (!group) {
        await warn('账号无法找到群，可能已退群', { uin, groupId })
        return false
      }
      
      await group.sendMsg(msg)
      return true
    } catch (err) {
      await error('账号向群发送消息失败', { uin, groupId, error: err.message })
      return false
    }
  }
}

export async function pushAnnouncement (e, isCronJob = false) {
  const notice = await data.getCurrentNotice()
  if (!notice) {
    if (!isCronJob) {
      e.reply('当前没有设置任何公告，无法推送。', true)
    } else {
      await info('定时任务：无当前公告，跳过推送')
    }
    return
  }

  // 预加载所有 bots，创建映射以提高查找效率
  const bots = await getAllBots()
  const botsMap = new Map(bots.map(bot => [String(bot.uin), bot]))
  const safeSend = createSafeSend(botsMap)

  const pushableGroups = await getAllPushableGroups()
  
  if (!pushableGroups || Object.keys(pushableGroups).length === 0) {
    if (!isCronJob) e.reply('没有符合条件的群可以推送。', true)
    return
  }

  const totalGroups = Object.values(pushableGroups).reduce((sum, groups) => sum + groups.length, 0)
  
  if (totalGroups === 0) {
    if (!isCronJob) e.reply('没有符合条件的群可以推送。', true)
    return
  }

  const pushId = await data.initPushProgress(totalGroups)
  const accountCount = Object.keys(pushableGroups).length
  
  if (!isCronJob) {
    e.reply(`公告推送任务开始，共 ${accountCount} 个账号，${totalGroups} 个群。`, true)
  }
  await info('推送任务开始', { pushId, accountCount, totalGroups })

  let successCount = 0
  const failedGroups = []
  const accountStats = {}
  let sentCount = 0

  const messageToSend = `【公告通知】\n--------------------\n${notice.content}\n--------------------\n${notice.timestamp}`

  // 计算进度报告间隔
  const progressInterval = Math.max(10, Math.ceil(totalGroups / 5))

  for (const [uin, groups] of Object.entries(pushableGroups)) {
    const accountConfig = await getAccountConfig(uin)
    const bot = botsMap.get(uin)
    const nickname = bot?.nickname || bot?.info?.nickname || '未知'
    
    accountStats[uin] = { success: 0, failed: 0, total: groups.length, nickname }
    
    await info('开始推送账号', { uin, nickname, groupCount: groups.length })
      
    for (const groupId of groups) {
      if (await safeSend(groupId, uin, messageToSend)) {
        successCount++
        accountStats[uin].success++
      } else {
        accountStats[uin].failed++
        failedGroups.push(`${uin}:${groupId}`)
      }
      
      sentCount = await data.updatePushProgress(pushId)

      // 进度报告
      if (!isCronJob && sentCount % progressInterval === 0 && sentCount < totalGroups) {
        e.reply(`推送进度: ${sentCount}/${totalGroups} (成功: ${successCount})`, true)
      }

      // 推送间隔延迟（将毫秒转换为秒）
      const intervalMs = accountConfig.pushInterval || 2000
      if (sentCount < totalGroups) { // 最后一个不需要延迟
        const delayMs = randomDelay(intervalMs / 1000) // 传入秒数
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  await data.finishPushProgress(pushId)
  
  // 构建结果消息
  let resultMsg = `公告推送任务完成。\n总计: ${totalGroups} 个群\n成功: ${successCount}\n失败: ${totalGroups - successCount}`
  
  resultMsg += '\n\n按账号统计:'
  for (const [uin, stats] of Object.entries(accountStats)) {
    resultMsg += `\n${stats.nickname}(${uin}): ${stats.success}/${stats.total}`
  }
  
  if (failedGroups.length > 0) {
    const showLimit = 10
    const showList = failedGroups.slice(0, showLimit).join(', ')
    resultMsg += `\n\n失败群号: ${showList}`
    if (failedGroups.length > showLimit) {
      resultMsg += `\n其余 ${failedGroups.length - showLimit} 个群略。`
    }
  }
  
  if (!isCronJob) e.reply(resultMsg, true)
  await info('推送任务完成', { 
    pushId, 
    totalGroups, 
    successCount, 
    failedCount: totalGroups - successCount,
    failedGroups: failedGroups.length > 0 ? failedGroups : undefined
  })

  const pushStats = await getPushStats()
  pushStats.successCount = successCount
  pushStats.failedCount = totalGroups - successCount
  await data.recordPushStats(pushStats)

  if (notice?.id) {
    await data.setNoticePushed(notice.id)
  }
}
