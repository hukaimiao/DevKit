import { translate } from './i18n.js'
import ipaddr from 'ipaddr.js'
import { nextCronRuns } from './cron.js'

function cidr(text, _action, lang = 'zh') {
  const [address, bits] = ipaddr.parseCIDR(text.trim())
  const ipv4 = address.kind() === 'ipv4'
  const width = ipv4 ? 32 : 128
  const number = address.toByteArray().reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)
  const host = BigInt(width - bits)
  const first = (number >> host) << host
  const last = first + (1n << host) - 1n
  const display = value => ipaddr.fromByteArray(Array.from({ length: width / 8 }, (_, index) =>
    Number((value >> BigInt(width - 8 * (index + 1))) & 255n))).toString()
  return [
    `${translate(lang, '版本')}    IPv${ipv4 ? 4 : 6}`,
    `${translate(lang, '网段')}    ${display(first)}/${bits}`,
    `${translate(lang, '首地址')}  ${display(first)}`,
    `${translate(lang, '末地址')}  ${display(last)}`,
    `${translate(lang, '地址数')}  ${(1n << host).toString()}`,
  ].join('\n')
}

function password(text) {
  const size = Number(text.trim() || 32)
  if (!Number.isInteger(size) || size < 8 || size > 256) throw new Error('长度必须是 8–256 之间的整数。')
  // A 64-character alphabet maps evenly from random bytes.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  return Array.from(crypto.getRandomValues(new Uint8Array(size)), byte => alphabet[byte & 63]).join('')
}

function hex(text, action) {
  if (action === '转十六进制') return Array.from(new TextEncoder().encode(text), x => x.toString(16).padStart(2, '0')).join(' ')
  const clean = text.replace(/\s/g, '').replace(/^0x/i, '')
  if (!/^(?:[0-9a-f]{2})*$/i.test(clean)) throw new Error('请输入完整的十六进制字节。')
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(clean.match(/../g) ?? [], byte => parseInt(byte, 16)))
}

function splitList(text) {
  return text.split(/[,，\r\n]+/).map(line => line.trim()).filter(Boolean)
}

async function cityGroups(text) {
  const { pinyin } = await import('pinyin-pro')
  const groups = new Map()
  const overrides = new Map([['重庆', 'chongqing'], ['长沙', 'changsha'], ['长春', 'changchun'], ['长治', 'changzhi'],
    ['厦门', 'xiamen'], ['六安', 'luan'], ['蚌埠', 'bengbu'], ['乐清', 'yueqing']])
  for (const name of new Set(splitList(text))) {
    const base = name.replace(/市$/, '')
    const known = overrides.get(base)
    const full = known ? known + (name.endsWith('市') ? 'shi' : '') : pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase()
    const initial = /^[a-z]/.test(full) ? full[0].toUpperCase() : '#'
    if (!groups.has(initial)) groups.set(initial, [])
    groups.get(initial).push({ name, pinyin: full })
  }
  return JSON.stringify([...groups.keys()].sort().map(initial => ({
    initial,
    cities: groups.get(initial).sort((left, right) => left.pinyin.localeCompare(right.pinyin, 'en') || left.name.localeCompare(right.name, 'zh')),
  })), null, 2)
}

function unicode(text, action) {
  if (action === '转义') return Array.from({ length: text.length }, (_, index) => '\\u' + text.charCodeAt(index).toString(16).padStart(4, '0')).join('')
  return text.replace(/\\u(?:\{([0-9a-f]{1,6})\}|([0-9a-f]{4}))/gi, (whole, point, unit) => {
    const value = parseInt(point ?? unit, 16)
    if (value > 0x10ffff) throw new Error('Unicode 码点超出范围。')
    return point ? String.fromCodePoint(value) : String.fromCharCode(value)
  })
}

const network = '网络与时间'
const generator = '日常生成器'
const encoding = '格式与编码'
export const systemTools = [
  { id: 'ip', name: 'IP 地址解析', label: 'IPv4 / IPv6', group: network, icon: 'Hash', hue: 'blue',
    description: '查看 IP 版本、规范形式和地址类型', sample: '::ffff:192.0.2.128', actions: ['解析 IP'],
    run: (text, _action, lang = 'zh') => {
      const address = ipaddr.parse(text.trim())
      return `${translate(lang, '版本')}      ${address.kind()}\n${translate(lang, '规范形式')}  ${address.toString()}\n${translate(lang, '展开形式')}  ${address.toNormalizedString()}\n${translate(lang, '地址类型')}  ${address.range()}`
    } },
  { id: 'cidr', name: 'CIDR 网段计算', label: 'CIDR', group: network, icon: 'Binary', hue: 'mint',
    description: '查看 IPv4 / IPv6 网段边界与地址总数', sample: '192.168.1.42/24', actions: ['计算网段'], run: cidr },
  { id: 'cron', name: 'Cron 执行预览', label: 'CRON', group: network, icon: 'Clock3', hue: 'violet',
    description: '选择时间生成 Cron，反解析已有表达式，并按时区预览执行计划', sample: '*/15 9-17 * * 1-5', actions: ['预览排期'],
    run: text => nextCronRuns(text, 'UTC').map(date => date.toISOString()).join('\n') },
  { id: 'timezone', name: '全球时区对照', label: 'TIME ZONES', group: network, icon: 'Clock3', hue: 'amber',
    description: '将带时区的 ISO 时间转换到多个常见时区', sample: '2026-11-26T12:00:00+08:00', actions: ['转换时区'],
    run: (text, _action, lang = 'zh') => {
      const value = text.trim()
      const date = new Date(value)
      if (!/T.+(?:Z|[+-]\d\d:\d\d)$/i.test(value) || Number.isNaN(date.getTime())) throw new Error('请输入带 Z 或 UTC 偏移的 ISO 8601 时间。')
      return ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles']
        .map(timeZone => `${timeZone.padEnd(21)} ${new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'long', timeZone }).format(date)}`).join('\n')
    } },
  { id: 'url-inspect', name: 'URL 结构解析', label: 'URL PARTS', group: network, icon: 'Link2', hue: 'violet',
    description: '拆分协议、域名、端口、路径、查询参数与片段', sample: 'https://example.com:8443/api/users?limit=10#results', actions: ['拆分 URL'],
    run: text => {
      const { protocol, hostname, port, pathname, search, hash, origin } = new URL(text.trim())
      return JSON.stringify({ protocol, hostname, port, pathname, search, hash, origin }, null, 2)
    } },
  { id: 'password', name: '随机密码生成', label: 'PASSWORD', group: generator, icon: 'KeyRound', hue: 'pink',
    description: '使用浏览器加密随机数生成 URL 安全的密码', sample: '32', placeholder: '输入长度，8–256', actions: ['生成密码'], run: password },
  { id: 'qr', name: '二维码生成', label: 'QR CODE', group: generator, icon: 'QrCode', hue: 'mint',
    description: '将文本或网址转成二维码，支持下载 PNG', sample: 'https://example.com', actions: ['生成二维码'], image: true,
    run: async text => {
      if (!text.trim()) throw new Error('请输入二维码内容。')
      return (await import('qrcode')).default.toDataURL(text, { width: 512, margin: 3, errorCorrectionLevel: 'M' })
    } },
  { id: 'city-pinyin', name: '城市拼音分组', label: 'CITY A–Z', group: generator, icon: 'MapPin', hue: 'blue',
    description: '城市名转无声调全拼，按首字母输出 JSON', sample: '北京\n上海\n重庆市\n长沙,厦门,六安\n深圳',
    actions: ['按首字母分组'], run: cityGroups },
  { id: 'hex', name: '文本 ↔ 十六进制', label: 'UTF-8 HEX', group: encoding, icon: 'Binary', hue: 'pink',
    description: '在 UTF-8 文本与十六进制字节之间双向转换', sample: '你好，DevKit 🌐', actions: ['转十六进制', '转文本'], run: hex },
  { id: 'unicode', name: 'Unicode 转义', label: 'UNICODE', group: encoding, icon: 'CaseSensitive', hue: 'amber',
    description: '生成 UTF-16 转义序列，或解码 Unicode 转义', sample: '开发者 🌐', actions: ['转义', '反转义'], run: unicode },
]
