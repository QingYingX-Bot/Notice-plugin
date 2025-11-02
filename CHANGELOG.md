# 📋 更新日志

## [1.0.5] - 2025-08-04
- 修复BUG

## [1.0.4] - 2025-07-15

### ✨ 更新内容
- **修复黑名单不生效的BUG**
- **更新日志部分**
- **增加快速添加/删除所有群到黑白名单的功能**
- **更新 README.md**

## [1.0.3] - 2025-07-06

### ✨ 更新内容
- **配置系统重构**：全局配置统一迁移为 YAML 格式，所有配置读写均通过 config.js 管理
- **适配锅巴插件**：适配 [锅巴插件(Guoba-Plguin)](https://github.com/guoba-yunzai/guoba-plugin)
- **删除旧配置文件**：移除 config_default.json，统一使用 config.yaml或config_default.yaml

### 🗂️ 文件变更
- 新增文件、文件夹
  - guoba.support.js
  - config/config.js、config/config_default.yaml
- 删除：config/config_default.json


## [1.0.2] - 2025-07-06

### ✨ 新增功能
- **多账号支持**：自动检测并支持多账号场景，排除标准输入账号
- **全局黑白名单管理**：支持全局级别的白名单和黑名单管理
- **账号级别配置**：为每个账号独立设置推送间隔、重试次数等参数
- **账号级别黑白名单**：支持为每个账号单独设置白名单和黑名单
- **详细推送统计**：提供推送进度反馈和详细的统计数据
- **权限区分帮助**：主人和普通用户区分帮助信息

### 🔧 优化改进
- **命令结构优化**：合并了重复的配置管理功能，统一为 `noticeConfigCommand.js`

### 🗂️ 文件变更
- **新增文件**：
  - `src/commands/noticeConfigCommand.js` - 统一的配置管理命令
- **删除文件**：
  - `src/commands/listCommand.js` - 合并到 noticeConfigCommand.js
  - `src/commands/accountCommand.js` - 合并到 noticeConfigCommand.js
- **修改文件**：
  - `src/services/accountService.js` - 优化多账号检测逻辑
  - `src/storage/redisStore.js` - 改进名单管理功能
  - `index.js` - 更新插件入口逻辑

## [1.0.0 ~ 1.0.1] - 2025-06

### ✨ 初始版本功能
- **基础公告管理**：发布、编辑、撤回、查看公告
- **历史记录功能**：支持查看历史公告记录
- **手动推送功能**：支持手动推送当前公告
- **定时推送任务**：支持每日定时推送公告
- **Redis 数据存储**：基于 Redis 的数据存储
- **基础帮助系统**：提供命令帮助和使用说明

---