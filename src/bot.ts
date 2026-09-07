import { log, ScanStatus, WechatyBuilder } from 'wechaty'
import { config } from './config'
import { puppet } from './services/puppet'
import { handleMessage, LOGPRE } from './handlers/message'
import type { StatusHub } from './services/status'

// 二维码渲染按需加载，避免无扫码场景下的无谓依赖
import * as qrTerminal from 'qrcode-terminal'

export function createBot(status: StatusHub) {
  const bot = WechatyBuilder.build({
    name: config.name,
    puppet,
  })

  bot
    .on('scan', (qrcode, status_) => {
      if (status_ === ScanStatus.Waiting && qrcode) {
        const qrcodeImageUrl = [
          'https://wechaty.js.org/qrcode/',
          encodeURIComponent(qrcode),
        ].join('')

        // 同步扫码状态到 WebUI（异步生成二维码图片，失败不影响终端展示）
        void status.asyncSetScan(qrcode)

        log.info(LOGPRE, `onScan: ${ScanStatus[status_]}(${status_})`)

        console.log('\n==================================================================')
        console.log('\n* Two ways to sign on with qr code')
        console.log('\n1. Scan following QR code:\n')

        qrTerminal.generate(qrcode, { small: true })

        console.log(`\n2. Or open the link in your browser: ${qrcodeImageUrl}`)
        console.log('\n==================================================================\n')
      } else {
        log.info(LOGPRE, `onScan: ${ScanStatus[status_]}(${status_})`)
      }
    })

    .on('login', (user) => {
      status.setConnected(user.name())
      log.info(LOGPRE, `${user} login`)
    })

    .on('logout', (user, reason) => {
      status.setLoggedOut()
      log.info(LOGPRE, `${user} logout, reason: ${reason}`)
    })

    .on('message', (message) => {
      // 异步处理消息，错误上抛到 error 事件统一记录
      handleMessage(message).catch((e: unknown) => log.error(LOGPRE, `handle message fail: ${e}`))
    })

    .on('room-invite', async (roomInvitation) => {
      log.info(LOGPRE, `on room-invite: ${roomInvitation}`)
    })

    .on('room-join', (room, inviteeList, inviter, date) => {
      log.info(
        LOGPRE,
        `on room-join, room:${room}, inviteeList:${inviteeList}, inviter:${inviter}, date:${date}`
      )
    })

    .on('room-leave', (room, leaverList, remover, date) => {
      log.info(
        LOGPRE,
        `on room-leave, room:${room}, leaverList:${leaverList}, remover:${remover}, date:${date}`
      )
    })

    .on('room-topic', (room, newTopic, oldTopic, changer, date) => {
      log.info(
        LOGPRE,
        `on room-topic, room:${room}, newTopic:${newTopic}, oldTopic:${oldTopic}, changer:${changer}, date:${date}`
      )
    })

    .on('friendship', (friendship) => {
      log.info(LOGPRE, `on friendship: ${friendship}`)
    })

    .on('error', (error) => {
      log.error(LOGPRE, `on error: ${error}`)
    })

  return bot
}