import plugin from '../../../../lib/plugins/plugin.js'
import data from '../storage/redisStore.js'
import { info, error } from '../utils/logger.js'

export class NoticeManagement extends plugin {
  constructor () {
    super({
      name: '公告管理',
      dsc: '公告的发布、编辑、撤回、查看等',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#发布公告[\s\S]*',
          fnc: 'publishNotice',
          permission: 'master'
        },
        {
          reg: '^#编辑公告 (.*)$',
          fnc: 'editNotice',
          permission: 'master'
        },
        {
          reg: '^#撤回公告$',
          fnc: 'recallNotice',
          permission: 'master'
        },
        {
          reg: '^#公告$',
          fnc: 'getNotice'
        },
        {
          reg: '^#历史公告$',
          fnc: 'getLastHistory'
        },
        {
          reg: '^#全部历史公告$',
          fnc: 'getAllHistory'
        },
        {
          reg: '^#公告帮助$',
          fnc: 'noticeHelp'
        }
      ]
    })
  }

  async publishNotice (e) {
    const raw = e.raw_message || e.msg || ''
    await info('收到原始公告内容', { content: raw })
    const content = raw.replace(/^#发布公告/, '').trim()
    
    if (!content) {
      await e.reply('❌ 公告内容不能为空。', true)
      return
    }

    try {
      const notice = await data.createNotice({ content, creator: e.user_id })
      await e.reply(`✅ 公告发布成功！\n📋 ID: ${notice.id}`, true)
      await this.getNotice(e)
    } catch (err) {
      await error('发布公告失败', { error: err.message, stack: err.stack })
      await e.reply('❌ 公告发布失败，请查看日志。', true)
    }
  }

  async editNotice (e) {
    const currentNotice = await data.getCurrentNotice()
    if (!currentNotice) {
      await e.reply('❌ 当前没有可编辑的公告。', true)
      return
    }

    const content = e.msg.replace('#编辑公告', '').trim()
    if (!content) {
      await e.reply('❌ 公告内容不能为空。', true)
      return
    }

    try {
      if (await data.editNotice({ content })) {
        await e.reply('✅ 公告编辑成功！', true)
        await this.getNotice(e)
      } else {
        await e.reply('❌ 公告编辑失败，请查看日志。', true)
      }
    } catch (err) {
      await error('编辑公告失败', { error: err.message, stack: err.stack })
      await e.reply('❌ 公告编辑失败，请查看日志。', true)
    }
  }

  async recallNotice (e) {
    try {
      const result = await data.recallNotice()
      if (result) {
        await e.reply('✅ 当前公告已撤回。', true)
      } else {
        await e.reply('❌ 没有需要撤回的公告。', true)
      }
    } catch (err) {
      await error('撤回公告失败', { error: err.message, stack: err.stack })
      await e.reply('❌ 撤回公告失败，请查看日志。', true)
    }
  }

  _formatNoticeMsg(item, type = '当前') {
    let title = '📢 【当前公告】'
    if (type === '上一条历史') title = '📜 【上一条历史公告】'
    if (type === '历史') title = `📋 ID: ${item.id}`
    
    const statusEmoji = item.status === '当前' ? '✅' : item.status === '已撤回' ? '❌' : '📦'
    const pushEmoji = item.push === '已推送' ? '✅' : '⏳'
    
    return [
      `${title}\n📋 ID: ${item.id}\n${item.status ? `${statusEmoji} 状态: ${item.status}` : ''}\n${item.push ? `${pushEmoji} 推送: ${item.push}` : ''}\n👤 发布者: ${item.creator || '未知'}\n🕐 时间: ${item.timestamp}\n━━━━━━━\n`,
      item.content
    ]
  }

  async getNotice (e) {
    try {
      const notice = await data.getCurrentNotice()
      if (!notice) {
        await e.reply('❌ 当前没有公告。', true)
        return
      }
      await e.reply(this._formatNoticeMsg(notice, '当前'))
    } catch (err) {
      await error('获取公告失败', { error: err.message, stack: err.stack })
      await e.reply('❌ 获取公告失败，请查看日志。', true)
    }
  }

  async getLastHistory (e) {
    try {
      const history = await data.getHistory(1, 1)
      if (history.length === 0) {
        await e.reply('❌ 没有更多历史公告了。', true)
        return
      }
      const item = history[0]
      await e.reply(this._formatNoticeMsg(item, '上一条历史'))
    } catch (err) {
      await error('获取历史公告失败', { error: err.message, stack: err.stack })
      await e.reply('❌ 获取历史公告失败，请查看日志。', true)
    }
  }

  async getAllHistory (e) {
    let page = 1
    let hasMore = true
    let totalCount = 0
    while (hasMore) {
      const history = await data.getHistory(page, 10)
      if (history.length === 0) {
        hasMore = false
        if (totalCount === 0) {
          await e.reply('没有历史公告。', true)
        }
        continue
      }
      totalCount += history.length
      const forwardMsg = []
      for (const item of history) {
        forwardMsg.push({
          user_id: e.bot.uin,
          nickname: '历史公告',
          message: this._formatNoticeMsg(item, '历史')
        })
      }
      await e.reply(await Bot.makeForwardMsg(forwardMsg))
      page++
    }
  }

  async noticeHelp (e) {
    const isMaster = e.isMaster || false
    
    if (isMaster) {
      const masterHelpText = `📢 Notice-plugin 公告插件帮助

🔧 基础命令
• #公告 - 查看当前公告
• #历史公告 - 查看上一条历史公告  
• #全部历史公告 - 查看全部历史公告

📝 公告管理
• #发布公告 <内容> - 发布新公告
• #编辑公告 <新内容> - 编辑当前公告
• #撤回公告 - 撤回当前公告
• #推送公告 - 手动推送当前公告

📋 名单管理
• #公告全局白名单添加/删除/查看 [群号|ALL] - 管理全局白名单
• #公告全局黑名单添加/删除/查看 [群号|ALL] - 管理全局黑名单

👥 账号管理
• #公告账号列表 - 查看所有登录账号
• #公告账号状态 - 查看账号推送状态
• #公告账号启用/禁用 - 启用/禁用所有账号推送
• #公告账号配置 - 查看所有账号配置详情
• #公告账号统计 - 查看推送统计信息

⚙️ 账号配置
• #公告账号配置 <账号> 启用/禁用 <值> - 设置账号推送状态
• #公告账号配置 <账号> 间隔 <毫秒> - 设置推送间隔(10000-20000ms，实际延迟为10-20秒随机)
• #公告账号配置 <账号> 重试 <次数> - 设置重试次数(0-10)
• #公告账号白名单 [账号] 添加/删除/查看 [群号] - 管理账号白名单（不填账号为当前账号）
• #公告账号黑名单 [账号] 添加/删除/查看 [群号] - 管理账号黑名单（不填账号为当前账号）

💡 使用提示
• 全局名单影响所有账号的推送
• 账号名单仅影响指定账号的推送
• 白名单优先级高于黑名单
• 不填群号时默认为当前群
• 不填账号时默认为当前接收到命令的账号

🔗 更多信息请查看 README.md`
      
      await e.reply(masterHelpText, true)
    } else {
      const userHelpText = `📢 Notice-plugin 公告插件帮助

🔧 命令
• #公告 - 查看当前公告
• #历史公告 - 查看上一条历史公告  
• #全部历史公告 - 查看全部历史公告`
      
      await e.reply(userHelpText, true)
    }
  }
} 