import lodash from 'lodash'
import { info, warn, error } from '../utils/logger.js'

const KEY_PREFIX = 'notice:'

const K = {
  CURRENT: `${KEY_PREFIX}current`, // 字符串: 当前公告ID
  HISTORY: `${KEY_PREFIX}history`, // 列表: 所有历史公告ID
  ANNOUNCEMENT: id => `${KEY_PREFIX}ann:${id}`, // 哈希: 单个公告的详情
  WHITELIST: `${KEY_PREFIX}whitelist`, // 集合: 白名单群号
  BLACKLIST: `${KEY_PREFIX}blacklist`, // 集合: 黑名单群号
  PROGRESS: pushId => `${KEY_PREFIX}progress:${pushId}`, // 哈希: 推送进度
  ACCOUNT_CONFIG: uin => `${KEY_PREFIX}account:${uin}:config`, // 哈希: 账号配置
  ACCOUNT_GROUPS: uin => `${KEY_PREFIX}account:${uin}:groups`, // 集合: 账号群列表缓存
  PUSH_STATS: date => `${KEY_PREFIX}stats:push:${date}` // 哈希: 推送统计
}

async function getCurrentNotice () {
  const currentId = await redis.get(K.CURRENT)
  if (!currentId) return null
  
  const notice = await redis.hGetAll(K.ANNOUNCEMENT(currentId))
  if (lodash.isEmpty(notice) || ['recalled', '已撤回'].includes(notice.status)) return null
  
  if (!notice.content || !notice.creator || !notice.timestamp) {
    await warn('公告数据不完整', { noticeId: currentId })
    return null
  }
  return { id: currentId, ...notice }
}

function genNoticeId() {
  const num = Math.floor(Math.random() * 90000) + 10000 // 10000~99999
  const letters = Array(3).fill().map(() => String.fromCharCode(Math.floor(Math.random() * 26) + 65)).join('')
  return `${num}${letters}`
}

async function createNotice ({ content, creator }) {
  const currentNotice = await getCurrentNotice()
  if (currentNotice && currentNotice.id) {
    await redis.lPush(K.HISTORY, currentNotice.id)
    await redis.hSet(K.ANNOUNCEMENT(currentNotice.id), 'status', '已归档')
    
    await redis.lTrim(K.HISTORY, 0, 49)
  }

  const newNotice = {
    content,
    creator,
    timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    status: '当前',
    push: '未推送',
    created: Date.now()
  }

  const id = genNoticeId()
  await redis.hSet(K.ANNOUNCEMENT(id), newNotice)
  await redis.set(K.CURRENT, id)
  
  await redis.expire(K.ANNOUNCEMENT(id), 30 * 24 * 3600)
  
  return { id, ...newNotice }
}

async function editNotice ({ content }) {
  const currentId = await redis.get(K.CURRENT)
  if (!currentId) return false
  await redis.hSet(K.ANNOUNCEMENT(currentId), 'content', content)
  return true
}

async function recallNotice () {
  const currentId = await redis.get(K.CURRENT)
  if (!currentId) return false
  await redis.hSet(K.ANNOUNCEMENT(currentId), 'status', '已撤回')
  await redis.lPush(K.HISTORY, currentId)
  await redis.del(K.CURRENT)
  return true
}

async function getHistory (page = 1, size = 10) {
  const ids = await redis.lRange(K.HISTORY, (page - 1) * size, (page - 1) * size + size - 1)
  if (!ids?.length) return []
  
  const results = await redis.multi(ids.map(id => ['hMGet', K.ANNOUNCEMENT(id), 'content', 'creator', 'timestamp', 'status'])).exec()
  return results.map((res, i) => ({ 
    id: ids[i], 
    content: res.content || '',
    creator: res.creator || '',
    timestamp: res.timestamp || '',
    status: res.status || ''
  }))
}

async function updateList (listType, action, groupIds) {
  try {
    const key = listType === 'whitelist' ? K.WHITELIST : K.BLACKLIST
    const listName = listType === 'whitelist' ? '白名单' : '黑名单'
    
    let ids = Array.isArray(groupIds) ? groupIds.filter(Boolean) : [groupIds].filter(Boolean)
    if (!Array.isArray(ids)) ids = [];
    ids = ids.map(String).filter(Boolean)
    
    if (action === 'view') {
      await info(`${listName}操作`, { action, redisKey: key })
    } else {
      await info(`${listName}操作`, { action, groupIds: ids, redisKey: key })
      
      if (ids.length === 0) {
        await warn(`${listName}操作: 没有有效的群号`)
        return 0;
      }
    }

    switch (action) {
      case 'add':
        const existingIds = await redis.sMembers(key)
        const newIds = ids.filter(id => !existingIds.includes(id))
        const alreadyExistIds = ids.filter(id => existingIds.includes(id))
        
        await info(`${listName}添加检查`, { newCount: newIds.length, existingCount: alreadyExistIds.length })
        
        let result
        if (newIds.length > 0) {
          result = await redis.sAdd(key, newIds)
          await info(`${listName}添加结果`, { added: result })
        } else {
          result = 0
          await info(`${listName}添加结果: 所有群号已存在`)
        }
        return {
          added: result,
          alreadyExist: alreadyExistIds.length,
          total: ids.length,
          newIds,
          alreadyExistIds
        }
        
      case 'del':
        const delResult = await redis.sRem(key, ids)
        await info(`${listName}删除结果`, { deleted: delResult })
        return delResult
        
      case 'view':
        const viewResult = await redis.sMembers(key)
        await info(`${listName}查看结果`, { count: viewResult.length })
        return viewResult
        
      default:
        throw new Error('无效的名单更新操作')
    }
  } catch (err) {
    await error(`${listType}操作失败`, { error: err.message })
    throw err
  }
}

async function initPushProgress (total) {
  const pushId = genNoticeId()
  await redis.hSet(K.PROGRESS(pushId), {
    total,
    sent: 0,
    status: 'pending',
    created: Date.now()
  })
  await redis.expire(K.PROGRESS(pushId), 3600)
  return pushId
}

async function updatePushProgress (pushId) {
  return redis.hIncrBy(K.PROGRESS(pushId), 'sent', 1)
}

async function finishPushProgress (pushId) {
  await redis.hSet(K.PROGRESS(pushId), 'status', 'finished')
}

async function getPushProgress (pushId) {
  return redis.hGetAll(K.PROGRESS(pushId))
}

async function cleanupExpiredData () {
  try {
    const historyIds = await redis.lRange(K.HISTORY, 0, -1)
    if (historyIds.length > 50) {
      const toDelete = historyIds.slice(50)
      await redis.multi([
        ['lTrim', K.HISTORY, 0, 49],
        ...toDelete.map(id => ['del', K.ANNOUNCEMENT(id)])
      ]).exec()
    }
  } catch (err) {
    await error('清理过期数据失败', { error: err.message })
  }
}

async function setNoticePushed (id) {
  return redis.hSet(K.ANNOUNCEMENT(id), 'push', '已推送')
}

async function getAccountConfig (uin) {
  try {
  const config = await redis.hGetAll(K.ACCOUNT_CONFIG(uin))
  if (lodash.isEmpty(config)) return {}
  
  const result = {}
  for (const [key, value] of Object.entries(config)) {
      try {
    if (key === 'whitelist' || key === 'blacklist') {
      result[key] = value ? JSON.parse(value) : []
        } else if (key === 'enabled') {
          result[key] = value === 'true' || value === true
        } else if (key === 'retryCount') {
          result[key] = parseInt(value) || 0
    } else if (key === 'pushInterval' || key === 'lastPushTime') {
      result[key] = parseInt(value) || 0
    } else {
      result[key] = value
        }
      } catch (parseErr) {
        await warn(`解析账号配置字段失败: ${key} = ${value}`, { error: parseErr.message })
        result[key] = value // 保留原始值
    }
  }
  
  return result
  } catch (err) {
    await error(`获取账号配置失败: ${uin}`, { error: err.message })
    return {}
  }
}

async function updateAccountConfig (uin, config) {
  try {
    const configToSave = {}
    for (const [key, value] of Object.entries(config)) {
      if (Array.isArray(value)) {
        configToSave[key] = JSON.stringify(value)
      } else {
        configToSave[key] = String(value)
      }
    }
    
    await redis.hSet(K.ACCOUNT_CONFIG(uin), configToSave)
    await redis.expire(K.ACCOUNT_CONFIG(uin), 30 * 24 * 3600)
    return true
  } catch (err) {
    await error('更新账号配置失败', { error: err.message })
    return false
  }
}

async function cacheAccountGroups (uin, groups) {
  try {
    const key = K.ACCOUNT_GROUPS(uin)
    await redis.del(key)
    if (groups.length > 0) {
      await redis.sAdd(key, groups.map(String))
      await redis.expire(key, 3600)
    }
  } catch (err) {
    await error('缓存账号群列表失败', { error: err.message })
  }
}

async function getCachedAccountGroups (uin) {
  try {
    const groups = await redis.sMembers(K.ACCOUNT_GROUPS(uin))
    return groups.map(String)
  } catch (err) {
    await error('获取缓存群列表失败', { error: err.message })
    return []
  }
}

async function recordPushStats (stats) {
  try {
    const date = new Date().toISOString().split('T')[0]
    const key = K.PUSH_STATS(date)
    await redis.hSet(key, {
      totalAccounts: stats.totalAccounts || 0,
      enabledAccounts: stats.enabledAccounts || 0,
      totalGroups: stats.totalGroups || 0,
      pushableGroups: stats.pushableGroups || 0,
      successCount: stats.successCount || 0,
      failedCount: stats.failedCount || 0,
      timestamp: Date.now()
    })
    await redis.expire(key, 7 * 24 * 3600)
  } catch (err) {
    await error('记录推送统计失败', { error: err.message })
  }
}

export default {
  getCurrentNotice,
  createNotice,
  editNotice,
  recallNotice,
  getHistory,
  updateList,
  initPushProgress,
  updatePushProgress,
  finishPushProgress,
  getPushProgress,
  cleanupExpiredData,
  getAccountConfig,
  updateAccountConfig,
  cacheAccountGroups,
  getCachedAccountGroups,
  recordPushStats,
  WHITELIST_KEY: K.WHITELIST,
  BLACKLIST_KEY: K.BLACKLIST,
  setNoticePushed
}
