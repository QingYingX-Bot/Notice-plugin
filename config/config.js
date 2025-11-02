import fs from 'fs/promises'
import yaml from 'js-yaml'
import path from 'path'
import lodash from 'lodash'

const configPath = path.join(process.cwd(), 'plugins/Notice-plugin/config/config.yaml')
const defaultConfigPath = path.join(process.cwd(), 'plugins/Notice-plugin/config/config_default.yaml')

function flattenToNested(config) {
  const result = {}
  for (const [key, value] of Object.entries(config)) {
    if (key.includes('.')) {
      const keys = key.split('.')
      let current = result
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }
      current[keys[keys.length - 1]] = value
    } else {
      result[key] = value
    }
  }
  return result
}

async function readConfigFile(filePath, isDefault = false) {
  try {
    const data = await fs.readFile(filePath, 'utf8')
    const rawConfig = yaml.load(data)
    return flattenToNested(rawConfig)
  } catch (e) {
    if (isDefault) {
      console.error(`默认配置文件读取失败: ${filePath}`, e.message)
    }
    else if (e.code === 'ENOENT') {
    } else {
      console.warn(`配置文件读取失败: ${filePath}`, e.message)
    }
    return {}
  }
}

export async function getDefaultConfig() {
  return await readConfigFile(defaultConfigPath, true)
}

export async function getConfig() {
  const def = await getDefaultConfig()
  
  const config = await readConfigFile(configPath, false)
  
  return lodash.merge({}, def, config)
}

export async function setConfig(newData) {
  const currentConfig = await getConfig()
  
  const merged = lodash.merge({}, currentConfig, flattenToNested(newData))
  
  try {
    const configDir = path.dirname(configPath)
    await fs.mkdir(configDir, { recursive: true })
    
    await fs.writeFile(configPath, yaml.dump(merged, { indent: 2, quotingType: '"', forceQuotes: true }), 'utf8')
    return true
  } catch (e) {
    console.error('配置文件写入失败:', e.message)
    return false
  }
} 