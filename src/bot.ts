import { log, ScanStatus, WechatyBuilder } from 'wechaty'
import { config } from './config'
import { puppet } from './services/puppet'
import { handleMessage, LOGPRE } from './handlers/message'

// 二维码渲染按需加载，避免无扫码场景下的无谓依赖
import * as qrTerminal from 'qrcode-terminal'

export function createBot() {
  const bot = WechatyBuilder.build({
    name: config.name,
    puppet,
  })

  bot
    .on('scan', (qrcode, status) => {
      if (status === ScanStatus.Waiting && qrcode) {
        const qrcodeImageUrl = [
          'https://wechaty.js.org/qrcode/',
          encodeURIComponent(qrcode),
        ].join('')

        log.info(LOGPRE, `onScan: ${ScanStatus[status]}(${status})`)

        console.log('\n==================================================================')
        console.log('\n* Two ways to sign on with qr code')
        console.log('\n1. Scan following QR code:\n')

        qrTerminal.generate(qrcode, { small: true })

        console.log(`\n2. Or open the link in your browser: ${qrcodeImageUrl}`)
        console.log('\n==================================================================\n')
      } else {
        log.info(LOGPRE, `onScan: ${ScanStatus[status]}(${status})`)
      }
    })

    .on('login', (user) => {
      log.info(LOGPRE, `${user} login`)
    })

    .on('logout', (user, reason) => {
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