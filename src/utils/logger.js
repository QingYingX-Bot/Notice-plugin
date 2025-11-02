import { getConfig } from '../../config/config.js'

const LOG_PREFIX = '[Notice-plugin]'

// 日志级别定义
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

// 获取当前日志级别
let currentLogLevel = 'info'

// 初始化日志级别
async function initLogLevel() {
  try {
    const config = await getConfig()
    currentLogLevel = config.logger || 'info'
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.warn) {
      logger.warn(`${LOG_PREFIX} 获取日志配置失败，使用默认级别: info`)
    }
    currentLogLevel = 'info'
  }
}

// 检查是否应该输出日志
function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]
}

// 格式化日志消息
function formatMessage(level, message, data = null) {
  let formattedMessage = `${LOG_PREFIX} ${message}`
  
  if (data && typeof data === 'object') {
    formattedMessage += ` | 数据: ${JSON.stringify(data)}`
  }
  
  return formattedMessage
}

// 日志输出函数
export async function log(level, message, data = null) {
  if (!shouldLog(level)) {
    return
  }
  
  const formattedMessage = formatMessage(level, message, data)
  
  switch (level) {
    case 'debug':
      logger.debug(formattedMessage)
      break
    case 'info':
      logger.info(formattedMessage)
      break
    case 'warn':
      logger.warn(formattedMessage)
      break
    case 'error':
      logger.error(formattedMessage)
      break
    default:
      logger.info(formattedMessage)
  }
}

// 便捷方法
export async function debug(message, data = null) {
  await log('debug', message, data)
}

export async function info(message, data = null) {
  await log('info', message, data)
}

export async function warn(message, data = null) {
  await log('warn', message, data)
}

export async function error(message, data = null) {
  await log('error', message, data)
}

// 初始化日志级别
initLogLevel()

// 导出初始化函数，供外部调用
export { initLogLevel } 