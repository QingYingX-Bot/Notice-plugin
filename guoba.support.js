import path from 'path'
import { getConfig, setConfig } from './config/config.js'

// 支持锅巴
export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'Notice-plugin',
      title: '公告插件',
      description: '提供公告发布、推送、黑白名单、定时任务等功能',
      author: '@QingYing',
      authorLink: 'https://gitee.com/tttfff',
      link: 'https://gitee.com/tttfff/notice-plugin',
      isV3: true,
      isV2: false,
      showInMenu: 'auto',
      icon: 'icon-park:announcement',
      iconColor: '#d19f56',
      iconPath: path.join(process.cwd(), 'plugins/Notice-plugin/resources/icon.png')
    },
    configInfo: {
      schemas: [
        {
          label: '基础配置',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'enableSchedule',
          label: '启用定时推送',
          bottomHelpMessage: '是否开启定时推送任务，每天在指定时间段自动推送公告',
          component: 'Switch'
        },
        {
          field: 'scheduleTime',
          label: '定时推送时间段',
          bottomHelpMessage: '定时推送任务的时间段，格式如：8:00-8:30',
          component: 'Input',
          required: true,
          componentProps: {
            placeholder: '请输入时间段，例：8:00-8:30'
          }
        },
        {
          field: 'logger',
          label: '日志级别',
          bottomHelpMessage: '日志输出级别，从详细到简洁：debug > info > warn > error',
          component: 'Select',
          required: true,
          componentProps: {
            options: [
              { label: '调试级别 (debug)', value: 'debug' },
              { label: '信息级别 (info)', value: 'info' },
              { label: '警告级别 (warn)', value: 'warn' },
              { label: '错误级别 (error)', value: 'error' }
            ],
            placeholder: '请选择日志级别'
          }
        },
        {
          label: '多账号配置',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'multiAccount.enabled',
          label: '启用多账号支持',
          bottomHelpMessage: '是否启用多账号场景支持，自动检测并支持多账号',
          component: 'Switch'
        },
        {
          field: 'multiAccount.defaultPushInterval',
          label: '默认推送间隔',
          bottomHelpMessage: '默认推送间隔时间，单位：毫秒',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 500,
            max: 10000,
            step: 100,
            placeholder: '请输入推送间隔（毫秒）'
          }
        },
        {
          field: 'multiAccount.defaultRetryCount',
          label: '默认重试次数',
          bottomHelpMessage: '推送失败时的默认重试次数',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 0,
            max: 10,
            step: 1,
            placeholder: '请输入重试次数'
          }
        },
        {
          field: 'multiAccount.autoEnableNewAccounts',
          label: '自动启用新账号',
          bottomHelpMessage: '是否自动启用新检测到的账号',
          component: 'Switch'
        },
        {
          label: '推送设置',
          component: 'SOFT_GROUP_BEGIN'
        },
        {
          field: 'pushSettings.maxConcurrentAccounts',
          label: '最大并发账号数',
          bottomHelpMessage: '同时推送的最大账号数量，避免系统负载过高',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 1,
            max: 20,
            step: 1,
            placeholder: '请输入最大并发数'
          }
        },
        {
          field: 'pushSettings.progressReportInterval',
          label: '进度报告间隔',
          bottomHelpMessage: '推送进度报告的间隔，单位：推送次数',
          component: 'InputNumber',
          required: true,
          componentProps: {
            min: 1,
            max: 100,
            step: 1,
            placeholder: '请输入进度报告间隔'
          }
        },
        {
          field: 'pushSettings.enableDetailedLogs',
          label: '启用详细日志',
          bottomHelpMessage: '是否启用详细的推送日志，用于调试和问题排查',
          component: 'Switch'
        }
      ],
      async getConfigData() {
        try {
          return await getConfig()
        } catch (error) {
          console.error('Notice-plugin 读取配置失败:', error)
          return {
            enableSchedule: true,
            scheduleTime: "8:00-8:30",
            logger: "info",
            multiAccount: {
              enabled: true,
              defaultPushInterval: 2000,
              defaultRetryCount: 3,
              autoEnableNewAccounts: true
            },
            pushSettings: {
              maxConcurrentAccounts: 5,
              progressReportInterval: 10,
              enableDetailedLogs: true
            }
          }
        }
      },
      async setConfigData(data, { Result }) {
        try {
          await setConfig(data)
          return Result.ok({}, '保存成功~')
        } catch (error) {
          console.error('Notice-plugin 保存配置失败:', error)
          return Result.error('保存失败: ' + error.message)
        }
      }
    }
  }
} 