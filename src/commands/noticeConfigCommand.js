import plugin from '../../../../lib/plugins/plugin.js'
import { getAllBots, getAccountConfig, updateAccountConfig, getPushStats } from '../services/accountService.js'
import data from '../storage/redisStore.js'
import { debug, info, warn, error } from '../utils/logger.js'

// 获取所有机器人所在的群号
async function getAllGroupIds() {
  const allGroupIds = new Set()
  
  try {
    // 获取所有机器人实例
    const bots = await getAllBots()
    
    let totalGroupsFromBots = 0
    for (const bot of bots) {
      if (bot.gl && typeof bot.gl.keys === 'function') {
        // 获取当前机器人的所有群号
        const groupIds = Array.from(bot.gl.keys())
        totalGroupsFromBots += groupIds.length
        groupIds.forEach(id => allGroupIds.add(String(id)))
      }
    }
    
    const uniqueGroupCount = allGroupIds.size
    await info(`群号获取完成 - 机器人数量: ${bots.length}, 去重后群数: ${uniqueGroupCount}`)
    return Array.from(allGroupIds)
  } catch (err) {
    await error(`获取所有群号失败: ${err.message}`)
    return []
  }
}

// 获取群详细信息
async function getGroupDetails(groupIds) {
  const groupDetails = []
  
  try {
    // 获取所有机器人实例
    const bots = await getAllBots()
    
    // 创建群号到群信息的映射
    const groupInfoMap = new Map()
    
    // 遍历所有机器人，获取群信息
    for (const bot of bots) {
      if (bot.gl && typeof bot.gl.keys === 'function') {
        const botUin = String(bot.uin)
        
        for (const [groupId, groupInfo] of bot.gl) {
          const groupIdStr = String(groupId)
          if (!groupInfoMap.has(groupIdStr)) {
            groupInfoMap.set(groupIdStr, {
              groupId: groupIdStr,
              groupName: groupInfo.group_name || '未知群名',
              botId: botUin
            })
          }
        }
      }
    }
    
    // 为每个目标群号获取详细信息
    let foundCount = 0
    let notFoundCount = 0
    
    for (const groupId of groupIds) {
      const groupInfo = groupInfoMap.get(String(groupId))
      if (groupInfo) {
        groupDetails.push(groupInfo)
        foundCount++
      } else {
        // 如果找不到群信息，只显示群号
        groupDetails.push({
          groupId: String(groupId),
          groupName: '未知群名',
          botId: '未知'
        })
        notFoundCount++
      }
    }
    
    // 按群名称排序
    groupDetails.sort((a, b) => a.groupName.localeCompare(b.groupName))
    
    await info(`群详细信息获取完成 - 目标群数: ${groupIds.length}, 成功获取: ${foundCount}, 未找到: ${notFoundCount}`)
    return groupDetails
  } catch (err) {
    await error(`获取群详细信息失败: ${err.message}`)
    return groupIds.map(id => ({
      groupId: String(id),
      groupName: '获取失败',
      botId: '未知'
    }))
  }
}

export class NoticeConfig extends plugin {
  constructor () {
    super({
      name: '公告配置管理',
      dsc: '统一管理公告推送的全局和账号级别配置',
      event: 'message',
      priority: 100,
      rule: [
        // 全局黑白名单管理
        {
          reg: '^#公告全局(白|黑)名单(添加|删除|查看)\\s*(.*)$',
          fnc: 'manageGlobalList',
          permission: 'master'
        },
        // 账号管理
        {
          reg: '^#公告账号(列表|状态|启用|禁用|配置|统计)$',
          fnc: 'manageAccount',
          permission: 'master'
        },
        {
          reg: '^#公告账号配置\\s+(\\d+)\\s+(启用|禁用|间隔|重试)\\s+(.+)$',
          fnc: 'setAccountConfig',
          permission: 'master'
        },
        // 账号级别黑白名单管理
        {
          reg: '^#公告账号(白|黑)名单\\s*(\\d*)\\s*(添加|删除|查看)\\s*(.*)$',
          fnc: 'manageAccountList',
          permission: 'master'
        }
      ]
    })
  }

  async manageGlobalList (e) {
    const match = e.msg.match(/^#公告全局(白|黑)名单(添加|删除|查看)\s*(.*)$/)
    if (!match) {
      await e.reply('格式错误。正确格式: #公告全局白名单/黑名单 添加/删除/查看 [群号/ALL]', true)
      return
    }

    const [, listType, action, groupIds] = match
    const listTypeKey = listType === '白' ? 'whitelist' : 'blacklist'
    const actionKey = action === '添加' ? 'add' : (action === '删除' ? 'del' : 'view')
    
    // 检查是否为 ALL 操作
    const isAllOperation = groupIds.trim().toUpperCase() === 'ALL'
    let groups = []
    
    if (isAllOperation) {
      // ALL 操作：获取所有群号
      groups = await getAllGroupIds()
      if (groups.length === 0) {
        await e.reply('未找到任何群聊，无法执行 ALL 操作。', true)
        return
      }
    } else {
      // 普通操作：解析群号
      groups = groupIds.match(/\d+/g) || []
      
      if (['add', 'del'].includes(actionKey) && !groups.length && e.isGroup) {
        groups = [String(e.group_id)]
      }

      if (['add', 'del'].includes(actionKey) && !groups.length) {
        return e.reply(`请提供要${actionKey === 'add' ? '添加' : '删除'}的群号，或使用 ALL 操作所有群聊。\n\n示例：\n#公告全局黑名单添加 ALL  # 将所有群聊添加到黑名单\n#公告全局白名单删除 ALL  # 清空白名单`, true)
      }
    }

    try {
      const operationType = isAllOperation ? 'ALL' : '指定群号'
      const operator = e.sender?.user_id || e.user_id || '未知'
      const operatorName = e.sender?.card || e.sender?.nickname || '未知'
      const chatType = e.isGroup ? `群聊(${e.group_id})` : '私聊'
      
      await info(`开始执行全局名单操作 - 操作者: ${operatorName}(${operator}), 名单类型: ${listTypeKey === 'whitelist' ? '白名单' : '黑名单'}, 操作: ${actionKey}, 群号数量: ${groups.length}`)
      
      const result = await data.updateList(listTypeKey, actionKey, groups)
      
      if (actionKey === 'view') {
        // 获取群详细信息并格式化显示
        const groupDetails = await getGroupDetails(result)
        const listName = listTypeKey === 'whitelist' ? '白名单' : '黑名单'
        
        if (groupDetails.length === 0) {
          await e.reply(`当前公告${listName}为空`, true)
        } else {
          // 格式化显示信息
          const title = `📋 公告全局${listName}查询结果`
          const summary = `━━━━━━━━━━━━━━━━━━━━\n📊 统计信息：共 ${groupDetails.length} 个群\n📅 查询时间：${new Date().toLocaleString('zh-CN')}\n━━━━━━━━━━━━━━━━━━━━`
          
          const groupList = groupDetails.map((group, index) => 
            `${index + 1}. ${group.groupName}（${group.groupId}）`
          ).join('\n')
          
          // 使用合并转发消息发送
          const forwardMsg = await Bot.makeForwardArray([
            title,
            summary,
            groupList
          ])
          
          await e.reply(forwardMsg)
        }
      } else if (actionKey === 'del') {
        if (isAllOperation) {
          await e.reply(`✅ 全局${listTypeKey === 'whitelist' ? '白' : '黑'}名单已清空，共删除 ${result} 个群。`, true)
        } else {
          if (result === 0) {
            await e.reply(`该群不在${listTypeKey === 'whitelist' ? '白' : '黑'}名单。`, true)
          } else {
            await e.reply(`${listTypeKey === 'whitelist' ? '白' : '黑'}名单删除成功，共删除 ${result} 个群。`, true)
          }
        }
      } else if (actionKey === 'add') {
        if (typeof result === 'object' && result.hasOwnProperty('added')) {
          let msg = `${listTypeKey === 'whitelist' ? '白' : '黑'}名单操作完成：\n`
          if (isAllOperation) {
            msg += `🎯 ALL 操作：将机器人所在的所有群聊添加到${listTypeKey === 'whitelist' ? '白' : '黑'}名单\n`
          }
          if (result.added > 0) {
            msg += `✅ 新增 ${result.added} 个群\n`
          }
          if (result.alreadyExist > 0) {
            msg += `⚠️  ${result.alreadyExist} 个群已存在\n`
          }
          if (result.alreadyExist > 0 && result.alreadyExistIds && !isAllOperation) {
            msg += `已存在的群号: ${result.alreadyExistIds.join(', ')}`
          }
          await e.reply(msg, true)
        }
      }
      
      // 记录操作结果
      let resultSummary = ''
      if (actionKey === 'view') {
        resultSummary = `查看结果: ${Array.isArray(result) ? result.length : 0} 个群`
      } else if (actionKey === 'add' && typeof result === 'object') {
        resultSummary = `添加结果: 新增 ${result.added || 0} 个, 已存在 ${result.alreadyExist || 0} 个`
      } else if (actionKey === 'del') {
        resultSummary = `删除结果: ${result} 个群`
      } else {
        resultSummary = `操作结果: ${JSON.stringify(result)}`
      }
      
      await info(`全局名单操作完成 - 名单类型: ${listTypeKey === 'whitelist' ? '白名单' : '黑名单'}, 操作: ${actionKey}, ${resultSummary}`)
    } catch (err) {
      await error(`全局名单操作失败 - 名单类型: ${listTypeKey === 'whitelist' ? '白名单' : '黑名单'}, 操作: ${actionKey}, 错误: ${err.message}`)
      await e.reply(`全局名单操作失败: ${err.message}，请查看日志。`, true)
    }
  }

  async manageAccount (e) {
    const action = e.msg.replace('#公告账号', '')
    const operator = e.sender?.user_id || e.user_id || '未知'
    const operatorName = e.sender?.card || e.sender?.nickname || '未知'
    
    await info(`账号管理操作 - 操作者: ${operatorName}(${operator}), 操作: ${action}`)
    
    switch (action) {
      case '列表':
        await this.showAccountList(e)
        break
      case '状态':
        await this.showAccountStatus(e)
        break
      case '启用':
        await this.enableAllAccounts(e)
        break
      case '禁用':
        await this.disableAllAccounts(e)
        break
      case '配置':
        await this.showAccountConfig(e)
        break
      case '统计':
        await this.showPushStats(e)
        break
      default:
        await warn(`未知的账号管理命令: ${action}`)
        await e.reply('未知的账号管理命令。', true)
    }
  }

  async showAccountList (e) {
    const bots = await getAllBots()
    if (bots.length === 0) {
      await e.reply('当前没有登录的账号。', true)
      return
    }

    let msg = `当前登录账号列表 (共 ${bots.length} 个):\n`
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i]
      const uin = String(bot.uin)
      const nickname = bot.nickname || bot.info?.nickname || '未知'
      const groups = Array.from(bot.gl?.keys() || [])
      const config = await getAccountConfig(uin)
      
      msg += `\n${i + 1}. ${nickname} (${uin})\n`
      msg += `   群数: ${groups.length}\n`
      msg += `   状态: ${config.enabled ? '启用' : '禁用'}\n`
      msg += `   推送间隔: ${config.pushInterval || 2000}ms\n`
    }

    await e.reply(msg, true)
  }

  async showAccountStatus (e) {
    const bots = await getAllBots()
    if (bots.length === 0) {
      await e.reply('当前没有登录的账号。', true)
      return
    }

    // 获取全局白名单和黑名单
    const globalWhitelist = await data.updateList('whitelist', 'view', [])
    const globalBlacklist = await data.updateList('blacklist', 'view', [])

    let msg = '账号推送状态:\n'
    msg += `\n【全局配置】\n`
    msg += `  全局白名单: ${globalWhitelist.length} 个\n`
    msg += `  全局黑名单: ${globalBlacklist.length} 个\n`
    
    for (const bot of bots) {
      const uin = String(bot.uin)
      const nickname = bot.nickname || bot.info?.nickname || '未知'
      const config = await getAccountConfig(uin)
      const groups = Array.from(bot.gl?.keys() || [])
      
      msg += `\n【${nickname} (${uin})】\n`
      msg += `  状态: ${config.enabled ? '✅ 启用' : '❌ 禁用'}\n`
      msg += `  群数: ${groups.length}\n`
      msg += `  账号白名单: ${config.whitelist?.length || 0} 个\n`
      msg += `  账号黑名单: ${config.blacklist?.length || 0} 个\n`
    }

    await e.reply(msg, true)
  }

  async enableAllAccounts (e) {
    const operator = e.sender?.user_id || e.user_id || '未知'
    const operatorName = e.sender?.card || e.sender?.nickname || '未知'
    
    await info(`批量启用账号操作 - 操作者: ${operatorName}(${operator})`)
    
    const bots = await getAllBots()
    if (bots.length === 0) {
      await warn(`批量启用账号失败 - 原因: 没有登录的账号`)
      await e.reply('当前没有登录的账号。', true)
      return
    }

    let successCount = 0
    for (const bot of bots) {
      const uin = String(bot.uin)
      const config = await getAccountConfig(uin)
      config.enabled = true
      
      if (await updateAccountConfig(uin, config)) {
        successCount++
      } else {
        await error(`账号启用失败: ${bot.nickname || '未知'}(${uin})`)
      }
    }

    await info(`批量启用账号完成 - 成功: ${successCount}/${bots.length}`)
    await e.reply(`已启用 ${successCount}/${bots.length} 个账号的推送功能。`, true)
  }

  async disableAllAccounts (e) {
    const operator = e.sender?.user_id || e.user_id || '未知'
    const operatorName = e.sender?.card || e.sender?.nickname || '未知'
    
    await info(`批量禁用账号操作 - 操作者: ${operatorName}(${operator})`)
    
    const bots = await getAllBots()
    if (bots.length === 0) {
      await warn(`批量禁用账号失败 - 原因: 没有登录的账号`)
      await e.reply('当前没有登录的账号。', true)
      return
    }

    let successCount = 0
    for (const bot of bots) {
      const uin = String(bot.uin)
      const config = await getAccountConfig(uin)
      config.enabled = false
      
      if (await updateAccountConfig(uin, config)) {
        successCount++
      } else {
        await error(`账号禁用失败: ${bot.nickname || '未知'}(${uin})`)
      }
    }

    await info(`批量禁用账号完成 - 成功: ${successCount}/${bots.length}`)
    await e.reply(`已禁用 ${successCount}/${bots.length} 个账号的推送功能。`, true)
  }

  async showAccountConfig (e) {
    const bots = await getAllBots()
    if (bots.length === 0) {
      await e.reply('当前没有登录的账号。', true)
      return
    }

    // 获取全局白名单和黑名单
    const globalWhitelist = await data.updateList('whitelist', 'view', [])
    const globalBlacklist = await data.updateList('blacklist', 'view', [])

    let msg = '账号配置详情:\n'
    msg += `\n【全局配置】\n`
    msg += `  全局白名单: ${globalWhitelist.join(', ') || '无'}\n`
    msg += `  全局黑名单: ${globalBlacklist.join(', ') || '无'}\n`
    
    for (const bot of bots) {
      const uin = String(bot.uin)
      const nickname = bot.nickname || bot.info?.nickname || '未知'
      const config = await getAccountConfig(uin)
      
      msg += `\n【${nickname} (${uin})】\n`
      msg += `  启用状态: ${config.enabled ? '是' : '否'}\n`
      msg += `  推送间隔: ${config.pushInterval || 2000}ms\n`
      msg += `  重试次数: ${config.retryCount || 3}\n`
      msg += `  账号白名单: ${config.whitelist?.join(', ') || '无'}\n`
      msg += `  账号黑名单: ${config.blacklist?.join(', ') || '无'}\n`
    }

    await e.reply(msg, true)
  }

  async showPushStats (e) {
    const stats = await getPushStats()
    
    let msg = '推送统计信息:\n'
    msg += `总账号数: ${stats.totalAccounts}\n`
    msg += `启用账号数: ${stats.enabledAccounts}\n`
    msg += `总群数: ${stats.totalGroups}\n`
    msg += `可推送群数: ${stats.pushableGroups}\n`
    
    if (stats.accounts.length > 0) {
      msg += '\n各账号详情:\n'
      for (const account of stats.accounts) {
        msg += `${account.nickname} (${account.uin}):\n`
        msg += `  状态: ${account.enabled ? '启用' : '禁用'}\n`
        msg += `  群数: ${account.totalGroups}/${account.pushableGroups}\n`
      }
    }

    await e.reply(msg, true)
  }

  async setAccountConfig (e) {
    const match = e.msg.match(/^#公告账号配置\s+(\d+)\s+(启用|禁用|间隔|重试)\s+(.+)$/)
    if (!match) {
      await warn(`账号配置命令格式错误: ${e.msg}`)
      await e.reply('格式错误。正确格式: #公告账号配置 <账号> <配置项> <值>', true)
      return
    }

    const [, uin, configType, value] = match
    const operator = e.sender?.user_id || e.user_id || '未知'
    const operatorName = e.sender?.card || e.sender?.nickname || '未知'
    
    await info(`账号配置操作 - 操作者: ${operatorName}(${operator}), 目标账号: ${uin}, 配置项: ${configType}, 值: ${value}`)
    
    const bots = await getAllBots()
    const bot = bots.find(b => String(b.uin) === uin)
    
    if (!bot) {
      await warn(`未找到账号: ${uin}`)
      await e.reply(`未找到账号 ${uin}。`, true)
      return
    }

    const config = await getAccountConfig(uin)
    const nickname = bot.nickname || bot.info?.nickname || '未知'
    
    switch (configType) {
      case '启用':
        config.enabled = value === 'true' || value === '是' || value === '启用'
        break
      case '禁用':
        config.enabled = !(value === 'true' || value === '是' || value === '启用')
        break
      case '间隔':
        const interval = parseInt(value)
        if (isNaN(interval) || interval < 500 || interval > 10000) {
          await e.reply('推送间隔必须在 500-10000ms 之间。', true)
          return
        }
        config.pushInterval = interval
        break
      case '重试':
        const retry = parseInt(value)
        if (isNaN(retry) || retry < 0 || retry > 10) {
          await e.reply('重试次数必须在 0-10 之间。', true)
          return
        }
        config.retryCount = retry
        break
      default:
        await e.reply('不支持的配置项。支持: 启用/禁用/间隔/重试', true)
        return
    }

    if (await updateAccountConfig(uin, config)) {
      await info(`账号配置更新成功 - 账号: ${nickname}(${uin}), 配置项: ${configType}, 新值: ${value}`)
      await e.reply(`${nickname} (${uin}) 配置更新成功。`, true)
    } else {
      await error(`账号配置更新失败 - 账号: ${nickname}(${uin}), 配置项: ${configType}, 值: ${value}`)
      await e.reply('配置更新失败。', true)
    }
  }

  async manageAccountList (e) {
    const match = e.msg.match(/^#公告账号(白|黑)名单\s*(\d*)\s*(添加|删除|查看)\s*(.*)$/)
    if (!match) {
      await warn(`账号名单命令格式错误: ${e.msg}`)
      await e.reply('格式错误。正确格式: #公告账号白名单/黑名单 [账号] 添加/删除/查看 [群号]', true)
      return
    }

    const [, listType, uin, action, groupIds] = match
    const operator = e.sender?.user_id || e.user_id || '未知'
    const operatorName = e.sender?.card || e.sender?.nickname || '未知'
    const listName = listType === '白' ? '白名单' : '黑名单'
    
    await info(`账号名单操作 - 操作者: ${operatorName}(${operator}), 名单类型: ${listName}, 目标账号: ${uin || '当前账号'}, 操作: ${action}`)
    
    const bots = await getAllBots()
    
    let targetUin = uin
    let bot = null
    
    if (!targetUin && e.isGroup) {
      for (const b of bots) {
        if (b.gl && b.gl.has(String(e.group_id))) {
          targetUin = String(b.uin)
          bot = b
          break
        }
      }
    } else if (targetUin) {
      bot = bots.find(b => String(b.uin) === targetUin)
    }
    
    if (!bot) {
      if (!targetUin) {
        await e.reply('无法识别当前账号，请手动指定账号号。', true)
      } else {
        await e.reply(`未找到账号 ${targetUin}。`, true)
      }
      return
    }

    const config = await getAccountConfig(targetUin)
    const nickname = bot.nickname || bot.info?.nickname || '未知'
    const listKey = listType === '白' ? 'whitelist' : 'blacklist'
    
    let groups = groupIds.match(/\d+/g) || []
    if (['添加', '删除'].includes(action) && !groups.length && e.isGroup) {
      groups = [String(e.group_id)]
    }
    
    switch (action) {
      case '查看':
        const list = config[listKey] || []
        await info(`账号名单查看完成 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}, 群数: ${list.length}`)
        await e.reply(`${nickname} (${targetUin}) 的${listName}:\n${list.join('\n') || '无'}`, true)
        break
        
      case '添加':
        if (!groups.length) {
          await warn(`账号名单添加失败 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}, 原因: 未提供群号`)
          await e.reply(`请提供要添加的群号。`, true)
          return
        }
        
        const originalCount = (config[listKey] || []).length
        config[listKey] = [...(config[listKey] || []), ...groups]
        config[listKey] = [...new Set(config[listKey])]
        const newCount = config[listKey].length
        const addedCount = newCount - originalCount
        
        if (await updateAccountConfig(targetUin, config)) {
          await info(`账号名单添加成功 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}, 新增: ${addedCount}, 总数: ${newCount}`)
          await e.reply(`${nickname} (${targetUin}) ${listName}添加成功，共 ${groups.length} 个群。`, true)
        } else {
          await error(`账号名单添加失败 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}`)
          await e.reply('操作失败。', true)
        }
        break
        
      case '删除':
        if (!groups.length) {
          await warn(`账号名单删除失败 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}, 原因: 未提供群号`)
          await e.reply(`请提供要删除的群号。`, true)
          return
        }
        
        const beforeCount = (config[listKey] || []).length
        config[listKey] = (config[listKey] || []).filter(g => !groups.includes(g))
        const afterCount = config[listKey].length
        const deletedCount = beforeCount - afterCount
        
        if (await updateAccountConfig(targetUin, config)) {
          await info(`账号名单删除成功 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}, 删除: ${deletedCount}, 剩余: ${afterCount}`)
          await e.reply(`${nickname} (${targetUin}) ${listName}删除成功，共 ${groups.length} 个群。`, true)
        } else {
          await error(`账号名单删除失败 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}`)
          await e.reply('操作失败。', true)
        }
        break
        
      default:
        await warn(`账号名单不支持的操作 - 账号: ${nickname}(${targetUin}), 名单类型: ${listName}, 操作: ${action}`)
        await e.reply('不支持的操作。支持: 添加/删除/查看', true)
    }
  }
} 