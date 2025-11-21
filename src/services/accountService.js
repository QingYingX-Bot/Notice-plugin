import data from '../storage/redisStore.js'
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

// Bot 实例缓存
const botCache = {
  bots: null,
  timestamp: 0,
  ttl: 5000 // 5秒缓存时间
}

// 工具函数
function safeString(value) {
  return String(value || '')
}

function getBotNickname(bot) {
  return bot?.nickname || bot?.info?.nickname || '未知'
}

function getBotGroups(bot) {
  if (!bot?.gl || typeof bot.gl.keys !== 'function') {
    return []
  }
  return Array.from(bot.gl.keys())
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
  const originalCount = filteredGroups.length
  
  // 全局黑名单过滤（优先级最高）
  if (globalBlacklist.length > 0) {
    const blacklistSet = new Set(globalBlacklist.map(safeString))
    filteredGroups = filteredGroups.filter(gid => !blacklistSet.has(safeString(gid)))
  }
  
  // 全局白名单过滤
  if (globalWhitelist.length > 0) {
    const whitelistSet = new Set(globalWhitelist.map(safeString))
    filteredGroups = filteredGroups.filter(gid => whitelistSet.has(safeString(gid)))
  }
  
  const filteredCount = filteredGroups.length
  if (originalCount !== filteredCount) {
    await info(`账号 ${uin} 全局名单过滤: ${originalCount} -> ${filteredCount}`)
  }
  
  return filteredGroups
}

export async function getAllBots(forceRefresh = false) {
  // 检查缓存
  const now = Date.now()
  if (!forceRefresh && botCache.bots && (now - botCache.timestamp) < botCache.ttl) {
    return botCache.bots
  }
  
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
        botCache.bots = []
        botCache.timestamp = now
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
          await warn(`账号 ${bot.uin} 的 Bot 实例无效，跳过`)
        }
      }
    }
    
    // 更新缓存
    botCache.bots = uniqueBots
    botCache.timestamp = now
    
    return uniqueBots
  } catch (err) {
    await error(`获取 Bot 实例失败: ${err.message}`)
    return []
  }
}

// 清除 Bot 缓存
export function clearBotCache() {
  botCache.bots = null
  botCache.timestamp = 0
}

export async function getAccountGroups(uin) {
  try {
    const bots = await getAllBots()
    const bot = bots.find(b => safeString(b.uin) === safeString(uin))
    
    if (!bot) {
      await warn(`未找到账号 ${uin} 的 Bot 实例`)
      return []
    }
    
    const groups = getBotGroups(bot)
    await info(`账号 ${uin} 获取到 ${groups.length} 个群`)
    
    return groups
  } catch (err) {
    await error(`获取账号 ${uin} 群列表失败: ${err.message}`)
    return []
  }
}

export async function getAllAccountGroups() {
  const bots = await getAllBots()
  const result = {}
  
  for (const bot of bots) {
    const uin = safeString(bot.uin)
    try {
      const groups = getBotGroups(bot)
      if (groups.length > 0) {
        result[uin] = groups
        await info(`账号 ${uin} 获取到 ${groups.length} 个群`)
      }
    } catch (err) {
      await error(`获取账号 ${uin} 群列表失败: ${err.message}`)
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
    await error(`获取账号 ${uinStr} 配置失败: ${error}`)
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
    
    await info(`账号 ${uinStr} 配置更新成功`)
    return true
  } catch (err) {
    await error(`更新账号 ${uinStr} 配置失败: ${err.message}`)
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
  
  // 使用 Set 提高过滤性能
  if (config.whitelist && config.whitelist.length > 0) {
    const whitelistSet = new Set(config.whitelist.map(safeString))
    filteredGroups = filteredGroups.filter(gid => whitelistSet.has(safeString(gid)))
  }
  
  if (config.blacklist && config.blacklist.length > 0) {
    const blacklistSet = new Set(config.blacklist.map(safeString))
    filteredGroups = filteredGroups.filter(gid => !blacklistSet.has(safeString(gid)))
  }
  
  return filteredGroups
}

export async function getAllPushableGroups() {
  const allGroups = await getAllAccountGroups()
  const result = {}
  
  // 获取全局名单信息用于日志
  const globalWhitelist = await data.updateList('whitelist', 'view', [])
  const globalBlacklist = await data.updateList('blacklist', 'view', [])
  await info(`全局名单过滤: 白名单 ${globalWhitelist.length} 个, 黑名单 ${globalBlacklist.length} 个`)
  
  for (const [uin, groups] of Object.entries(allGroups)) {
    if (!(await isAccountEnabled(uin))) {
      await info(`账号 ${uin} 已禁用推送，跳过`)
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
    const groups = getBotGroups(bot)
    
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
      nickname: getBotNickname(bot)
    })
  }
  
  return stats
} 