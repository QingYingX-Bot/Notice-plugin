import data from '../storage/redisStore.js'
import lodash from 'lodash'
import { getAllBots, getAllPushableGroups, getAccountConfig, getPushStats } from './accountService.js'
import { info, warn, error } from '../utils/logger.js'

async function safeSend (groupId, uin, msg) {
  try {
    const bots = await getAllBots()
    const bot = bots.find(b => String(b.uin) === String(uin))
    
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
  if (!isCronJob) {
    const accountCount = Object.keys(pushableGroups).length
    e.reply(`公告推送任务开始，共 ${accountCount} 个账号，${totalGroups} 个群。`, true)
  }
  await info('推送任务开始', { pushId, accountCount: Object.keys(pushableGroups).length, totalGroups })

  let successCount = 0
  const failedGroups = []
  const accountStats = {}

  const messageToSend = `【公告通知】\n--------------------\n${notice.content}\n--------------------\n${notice.timestamp}`

  for (const [uin, groups] of Object.entries(pushableGroups)) {
    const accountConfig = await getAccountConfig(uin)
    accountStats[uin] = { success: 0, failed: 0, total: groups.length }
    
    await info('开始推送账号', { uin, groupCount: groups.length })
    
    for (let i = 0; i < groups.length; i++) {
      const groupId = groups[i]
      
      if (await safeSend(groupId, uin, messageToSend)) {
        successCount++
        accountStats[uin].success++
      } else {
        accountStats[uin].failed++
        failedGroups.push(`${uin}:${groupId}`)
      }
      
      const sentCount = await data.updatePushProgress(pushId)

      if (!isCronJob && (sentCount % Math.ceil(totalGroups / 5) === 0 || sentCount % 10 === 0) && sentCount < totalGroups) {
        e.reply(`推送进度: ${sentCount}/${totalGroups} (成功: ${successCount})`, true)
      }

      const interval = accountConfig.pushInterval || 2000
      await new Promise(resolve => setTimeout(resolve, lodash.random(interval * 0.8, interval * 1.2)))
    }
  }

  await data.finishPushProgress(pushId)
  
  let resultMsg = `公告推送任务完成。\n总计: ${totalGroups} 个群\n成功: ${successCount}\n失败: ${totalGroups - successCount}`
  
  resultMsg += '\n\n按账号统计:'
  for (const [uin, stats] of Object.entries(accountStats)) {
    const bot = (await getAllBots()).find(b => String(b.uin) === uin)
    const nickname = bot?.nickname || bot?.info?.nickname || '未知'
    resultMsg += `\n${nickname}(${uin}): ${stats.success}/${stats.total}`
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
