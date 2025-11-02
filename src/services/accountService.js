import data from '../storage/redisStore.js'
import lodash from 'lodash'
import { info, warn, error } from '../utils/logger.js'

// 常量定义
const DEFAULT_CONFIG = {
  enabled: true,
  whitelist: [],
  blacklist: [],
  pushInterval: 2000,
  retryCount: 3,
  lastPushTime: 0
}

// 配置缓存
const configCache = new Map()
const CACHE_TTL = 30000 // 30秒缓存时间

// 工具函数
async function logInfo(message) {
  await info(message)
}

async function logWarn(message) {
  await warn(message)
}

async function logError(message) {
  await error(message)
}

function safeString(value) {
  return String(value || '')
}

// 全局过滤函数
async function applyGlobalFilters(groups, uin = '') {
  // 获取全局白名单和黑名单
  const globalWhitelist = await data.updateList('whitelist', 'view', [])
  const globalBlacklist = await data.updateList('blacklist', 'view', [])
  
  if (globalWhitelist.length === 0 && globalBlacklist.length === 0) {
    return groups
  }
  
  let filteredGroups = [...groups]
  
  // 全局黑名单过滤（优先级最高）
  if (globalBlacklist.length > 0) {
    const beforeBlacklist = filteredGroups.length
    filteredGroups = filteredGroups.filter(gid => !globalBlacklist.includes(safeString(gid)))
    const afterBlacklist = filteredGroups.length
    if (beforeBlacklist !== afterBlacklist) {
      await logInfo(`账号 ${uin} 全局黑名单过滤: ${beforeBlacklist} -> ${afterBlacklist}`)
    }
  }
  
  // 全局白名单过滤
  if (globalWhitelist.length > 0) {
    const beforeWhitelist = filteredGroups.length
    filteredGroups = filteredGroups.filter(gid => globalWhitelist.includes(safeString(gid)))
    const afterWhitelist = filteredGroups.length
    if (beforeWhitelist !== afterWhitelist) {
      await logInfo(`账号 ${uin} 全局白名单过滤: ${beforeWhitelist} -> ${afterWhitelist}`)
    }
  }
  
  return filteredGroups
}

export async function getAllBots() {
  const bots = []
  
  try {
    if (global.Bot && Array.isArray(global.Bot.uin)) {
      for (const uin of global.Bot.uin) {
        if (uin === 'stdin') continue
        if (global.Bot[uin] && global.Bot[uin].uin) {
          bots.push(global.Bot[uin])
        }
      }
    } 
    else if (global.Bot && global.Bot.uin) {
      if (global.Bot.uin === 'stdin') {
        return []
      }
      if (global.Bot[global.Bot.uin]) {
        bots.push(global.Bot[global.Bot.uin])
      }
    }
    
    const uniqueBots = []
    const seenUins = new Set()
    
    for (const bot of bots) {
      if (bot && bot.uin && !seenUins.has(bot.uin)) {
        if (bot.gl && typeof bot.gl.keys === 'function') {
          seenUins.add(bot.uin)
          uniqueBots.push(bot)
        } else {
          await logWarn(`账号 ${bot.uin} 的 Bot 实例无效，跳过`)
        }
      }
    }
    
    return uniqueBots
  } catch (err) {
    await logError(`获取 Bot 实例失败: ${err.message}`)
    return []
  }
}

export async function getAccountGroups(uin) {
  try {
    const bots = await getAllBots()
    const bot = bots.find(b => safeString(b.uin) === safeString(uin))
    
    if (!bot) {
      await logWarn(`未找到账号 ${uin} 的 Bot 实例`)
      return []
    }
    
    const groups = Array.from(bot.gl?.keys() || [])
    await logInfo(`账号 ${uin} 获取到 ${groups.length} 个群`)
    
    return groups
  } catch (err) {
    await logError(`获取账号 ${uin} 群列表失败: ${err.message}`)
    return []
  }
}

export async function getAllAccountGroups() {
  const bots = await getAllBots()
  const result = {}
  
  for (const bot of bots) {
    const uin = safeString(bot.uin)
    try {
      const groups = Array.from(bot.gl?.keys() || [])
      if (groups.length > 0) {
        result[uin] = groups
        await logInfo(`账号 ${uin} 获取到 ${groups.length} 个群`)
      }
    } catch (err) {
      await logError(`获取账号 ${uin} 群列表失败: ${err.message}`)
    }
  }
  
  return result
}

export async function getAccountConfig(uin) {
  const uinStr = safeString(uin)
  
  // 检查缓存
  const cacheKey = `config:${uinStr}`
  const cached = configCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config
  }
  
  try {
    const config = await data.getAccountConfig(uinStr)
    const result = { ...DEFAULT_CONFIG, ...config }
    
    // 更新缓存
    configCache.set(cacheKey, {
      config: result,
      timestamp: Date.now()
    })
    
    return result
  } catch (error) {
    logError(`获取账号 ${uinStr} 配置失败: ${error}`)
    return DEFAULT_CONFIG
  }
}

export async function updateAccountConfig(uin, config) {
  const uinStr = safeString(uin)
  try {
    await data.updateAccountConfig(uinStr, config)
    
    // 清除缓存
    const cacheKey = `config:${uinStr}`
    configCache.delete(cacheKey)
    
    await logInfo(`账号 ${uinStr} 配置更新成功`)
    return true
  } catch (err) {
    await logError(`更新账号 ${uinStr} 配置失败: ${err.message}`)
    return false
  }
}

export async function isAccountEnabled(uin) {
  const config = await getAccountConfig(uin)
  return config.enabled
}

export async function filterAccountGroups(uin, groups) {
  const config = await getAccountConfig(uin)
  let filteredGroups = [...groups]
  
  if (config.whitelist && config.whitelist.length > 0) {
    filteredGroups = filteredGroups.filter(gid => 
      config.whitelist.includes(safeString(gid))
    )
  }
  
  if (config.blacklist && config.blacklist.length > 0) {
    filteredGroups = filteredGroups.filter(gid => 
      !config.blacklist.includes(safeString(gid))
    )
  }
  
  return filteredGroups
}

export async function getAllPushableGroups() {
  const allGroups = await getAllAccountGroups()
  const result = {}
  
  // 获取全局名单信息用于日志
  const globalWhitelist = await data.updateList('whitelist', 'view', [])
  const globalBlacklist = await data.updateList('blacklist', 'view', [])
  logInfo(`全局名单过滤: 白名单 ${globalWhitelist.length} 个, 黑名单 ${globalBlacklist.length} 个`)
  
  for (const [uin, groups] of Object.entries(allGroups)) {
    if (!(await isAccountEnabled(uin))) {
      logInfo(`账号 ${uin} 已禁用推送，跳过`)
      continue
    }
    
    // 应用账号级别过滤
    const accountFilteredGroups = await filterAccountGroups(uin, groups)
    
    // 应用全局过滤
    const finalGroups = await applyGlobalFilters(accountFilteredGroups, uin)
    
    if (finalGroups.length > 0) {
      result[uin] = finalGroups
    }
  }
  
  return result
}

export async function getPushStats() {
  const bots = await getAllBots()
  const stats = {
    totalAccounts: bots.length,
    enabledAccounts: 0,
    totalGroups: 0,
    pushableGroups: 0,
    accounts: []
  }
  
  for (const bot of bots) {
    const uin = safeString(bot.uin)
    const config = await getAccountConfig(uin)
    const groups = Array.from(bot.gl?.keys() || [])
    
    // 应用与 getAllPushableGroups 相同的过滤逻辑
    let pushableGroups = []
    if (config.enabled) {
      stats.enabledAccounts++
      const accountFilteredGroups = await filterAccountGroups(uin, groups)
      pushableGroups = await applyGlobalFilters(accountFilteredGroups, uin)
    }
    
    stats.totalGroups += groups.length
    stats.pushableGroups += pushableGroups.length
    
    stats.accounts.push({
      uin,
      enabled: config.enabled,
      totalGroups: groups.length,
      pushableGroups: pushableGroups.length,
      nickname: bot.nickname || bot.info?.nickname || '未知'
    })
  }
  
  return stats
} 