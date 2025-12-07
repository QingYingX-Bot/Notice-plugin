# 📢 Notice-plugin

[![star](https://gitee.com/qingyingxbot/Notice-plugin/badge/star.svg?theme=gray)](https://gitee.com/qingyingxbot/Notice-plugin/stargazers)
[![version](https://img.shields.io/badge/version-1.0.6-white)](https://gitee.com/qingyingxbot/Notice-plugin/releases)
[![license](https://img.shields.io/badge/license-MIT-white)](https://gitee.com/qingyingxbot/Notice-plugin/blob/master/LICENSE)

---

**✨ Yunzai-Bot 高级公告插件，支持全局多账号公告推送、黑白名单、定时任务等丰富功能！**

> 插件 by QingYing & AI

---

## 📦 简介
Notice-plugin 是一个为 Yunzai-Bot 开发的公告插件，支持主人便捷地发布、管理和推送全局公告，支持黑白名单、定时推送、历史记录等功能，适合各类群管理场景。

---

## ✨ 功能特点
- 🎯 **多账号支持** 
    - 自动检测并支持多账号场景，排除标准输入账号
- 📊 **详细统计信息** 
    - 提供推送进度反馈和统计数据
- 🛡️ **数据持久化** 
    - 基于 Redis 的数据存储模式，支持过期清理
- 📢 **灵活功能控制** 
    - 支持全局和账号级别的黑白名单管理
    - 支持公告历史查询和撤回、编辑功能
    - 支持为每个账号独立设置推送间隔、重试次数等
    - 支持每日定时推送，可自定义时间段

---

## 🚀 安装方法
在 Yunzai-Bot 根目录下执行：

```bash
# 使用 Git 安装
$ git clone https://gitee.com/qingyingxbot/Notice-plugin.git ./plugins/Notice-plugin

# 进入插件目录
$ cd ./plugins/Notice-plugin

# 安装依赖
$ pnpm i
```

---

## 📝 命令列表

### 🔧 基础命令
| 命令 | 说明 | 权限 |
| :--- | :--- | :--- |
| `#公告` | 查看当前公告 | 所有人 |
| `#历史公告` | 查看上一条历史公告 | 所有人 |
| `#全部历史公告` | 查看全部历史公告（合并转发） | 所有人 |
| `#公告帮助` | 显示完整的命令帮助 | 所有人 |

### 📝 公告管理命令
| 命令 | 说明 | 权限 |
| :--- | :--- | :--- |
| `#发布公告 <内容>` | 发布新公告（支持换行） | 主人 |
| `#编辑公告 <新内容>` | 编辑当前公告 | 主人 |
| `#撤回公告` | 撤回当前公告 | 主人 |
| `#推送公告` | 手动推送当前公告 | 主人 |

### 📋 名单管理命令
| 命令 | 说明 | 权限 |
| :--- | :--- | :--- |
| `#公告全局白名单添加 [群号/ALL]` | 添加全局白名单（不填为当前群） | 主人 |
| `#公告全局白名单删除 [群号/ALL]` | 删除全局白名单（不填为当前群） | 主人 |
| `#公告全局白名单查看` | 查看全局白名单 | 主人 |
| `#公告全局黑名单添加 [群号/ALL]` | 添加全局黑名单（不填为当前群） | 主人 |
| `#公告全局黑名单删除 [群号/ALL]` | 删除全局黑名单（不填为当前群） | 主人 |
| `#公告全局黑名单查看` | 查看全局黑名单 | 主人 |

### 👥 账号管理命令
| 命令 | 说明 | 权限 |
| :--- | :--- | :--- |
| `#公告账号列表` | 查看所有登录账号列表 | 主人 |
| `#公告账号状态` | 查看各账号推送状态 | 主人 |
| `#公告账号启用` | 启用所有账号的推送功能 | 主人 |
| `#公告账号禁用` | 禁用所有账号的推送功能 | 主人 |
| `#公告账号配置` | 查看所有账号配置详情 | 主人 |
| `#公告账号统计` | 查看推送统计信息 | 主人 |

### ⚙️ 账号配置命令
| 命令 | 说明 | 权限 |
| :--- | :--- | :--- |
| `#公告账号配置 <账号> 启用/禁用 <值>` | 设置账号推送状态 | 主人 |
| `#公告账号配置 <账号> 间隔 <毫秒>` | 设置推送间隔 (10000-20000ms) | 主人 |
| `#公告账号配置 <账号> 重试 <次数>` | 设置重试次数 (0-10) | 主人 |
| `#公告账号白名单 [账号] 添加/删除/查看 [群号]` | 管理账号级别白名单（不填账号为当前账号） | 主人 |
| `#公告账号黑名单 [账号] 添加/删除/查看 [群号]` | 管理账号级别黑名单（不填账号为当前账号） | 主人 |

---
<details>
<summary>💡 使用示例</summary>

### 基础使用
```bash
发布公告
#发布公告 这是一条测试公告

查看公告
#公告

推送公告
#推送公告
```

### 名单管理
```bash
添加当前群到全局白名单
#公告全局白名单添加

添加指定群到全局白名单
#公告全局白名单添加 123456789

查看全局白名单
#公告全局白名单查看
```

### 多账号配置
```bash
查看账号列表
#公告账号列表

设置账号推送间隔
#公告账号配置 123456789 间隔 3000

管理账号白名单（指定账号）
#公告账号白名单 123456789 添加 987654321

管理当前账号白名单（不填账号）
#公告账号白名单 添加 987654321

管理当前账号当前群白名单（不填账号和群号）
#公告账号白名单 添加
```
</details>

---

## 🗂️ 目录结构

```text
Notice-plugin/
├── config/         # 配置文件目录
│   ├── config.yaml             # 用户自定义配置
│   ├── config_default.yaml     # 默认配置
│   └── config.js               # 配置管理模块
├── src/
│   ├── commands/    # 命令处理
│   │   ├── noticeCommand.js      # 公告管理命令
│   │   ├── noticeConfigCommand.js # 配置管理命令
│   │   └── pushCommand.js         # 推送命令
│   ├── services/    # 业务逻辑
│   │   ├── accountService.js      # 账号服务
│   │   └── pushService.js         # 推送服务
│   ├── storage/     # 数据存储
│   │   └── redisStore.js          # Redis 存储
│   └── utils/       # 工具/定时
│       └── schedule.js            # 定时任务
├── index.js         # 插件入口
├── guoba.support.js # 锅巴面板支持
├── README.md
└── package.json
```

---

## ⚙️ 配置说明

插件支持通过 `config/config.yaml` 进行自定义配置，若未提供则自动使用 `config/config_default.yaml`。

### 基础配置
- `enableSchedule`：是否开启定时推送任务（true/false）
- `scheduleTime`：定时推送任务的时间点（如 "8:00"，24小时制，若时间到了且存在未推送的公告则自动推送）
- `logger`：日志级别配置（"debug" 或 "info"）

### 多账号配置 multiAccount
- `enabled`：是否启用多账号支持（true/false）
- `defaultPushInterval`：默认推送间隔（毫秒）
- `defaultRetryCount`：默认重试次数
- `autoEnableNewAccounts`：是否自动启用新账号（true/false）

### 推送设置 pushSettings
- `maxConcurrentAccounts`：最大并发账号数
- `progressReportInterval`：进度报告间隔
- `enableDetailedLogs`：是否启用详细日志

### 日志配置说明
- `logger: "info"`：仅显示重要操作日志和错误日志（推荐生产环境）
- `logger: "debug"`：显示详细的调试信息，包括技术细节（推荐开发调试）

> 配置优先级：`config/config.yaml` > `config/config_default.yaml`。两者都不存在时，插件定时推送功能无法启动并会报错。

---

## 💬 问题反馈
- 欢迎提交 [Issue](https://gitee.com/qingyingxbot/Notice-plugin/issue) 反馈问题或建议
- 欢迎PR贡献代码，完善功能
- QQ群：822074453

---

## 📄 许可证
本项目采用 **MIT 许可证**

---
