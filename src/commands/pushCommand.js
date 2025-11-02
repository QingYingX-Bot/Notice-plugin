import plugin from '../../../../lib/plugins/plugin.js'
import { pushAnnouncement } from '../services/pushService.js'

export class NoticePush extends plugin {
  constructor () {
    super({
      name: '公告推送',
      dsc: '手动推送当前公告',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#推送公告$',
          fnc: 'pushNotice',
          permission: 'master'
        }
      ]
    })
  }

  async pushNotice (e) {
    await pushAnnouncement(e)
    return true
  }
} 