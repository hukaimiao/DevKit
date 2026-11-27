import { lifeTools } from './life-tools.js'
import { developerTools } from './developer-tools.js'
import { proTools } from './pro-tools.js'
import { translate } from './i18n.js'
import { codeTools } from './code-tools.js'
import { dataTools } from './data-tools.js'
import { systemTools } from './system-tools.js'
import { extraTools } from './extra-tools.js'

const utf8 = new TextEncoder()

function base64(text, action) {
  if (action === '解码') {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(text), char => char.charCodeAt(0)))
  }
  return btoa(Array.from(utf8.encode(text), byte => String.fromCharCode(byte)).join(''))
}

export function timestamp(text, action, lang = 'zh') {
  if (!text.trim()) throw new Error('请输入时间戳或日期。')
  const value = text.trim()
  const numeric = /^-?\d+(\.\d+)?$/.test(value)
  const amount = Number(value)
  const date = new Date(numeric ? (Math.abs(amount) < 1e11 ? amount * 1000 : amount) : value)
  if (Number.isNaN(date.getTime())) throw new Error('无法解析日期，请使用 Unix 时间戳或 ISO 8601 日期。')
  if (lang === 'en') {
    if (action === '转时间戳') return `Seconds       ${Math.floor(date.getTime() / 1000)}\nMilliseconds  ${date.getTime()}`
    return `Local  ${date.toLocaleString('en', { hour12: false })}\nUTC    ${date.toISOString()}`
  }
  if (action === '转时间戳') return `秒   ${Math.floor(date.getTime() / 1000)}\n毫秒 ${date.getTime()}`
  return `本地  ${date.toLocaleString('zh-CN', { hour12: false })}\nUTC   ${date.toISOString()}`
}

export function color(text, action) {
  const input = text.trim()
  const hex = input.match(/^#?([\da-f]{3}|[\da-f]{6})$/i)
  const rgb = input.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
  let channels
  if (hex) {
    const expanded = hex[1].length === 3 ? [...hex[1]].map(char => char.repeat(2)).join('') : hex[1]
    channels = expanded.match(/../g).map(pair => parseInt(pair, 16))
  } else if (rgb && rgb.slice(1).every(value => Number(value) <= 255)) {
    channels = rgb.slice(1).map(Number)
  } else {
    throw new Error('请输入 #RGB、#RRGGBB 或 rgb(r, g, b)。')
  }
  return action === '转 RGB' ? `rgb(${channels.join(', ')})` :
    '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase()
}

async function hash(text, action) {
  const digest = await crypto.subtle.digest(action, utf8.encode(text))
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

export function testRegex(text, pattern, flags, lang = 'zh') {
  const regex = new RegExp(pattern, flags)
  const matches = regex.global ? Array.from(text.matchAll(regex)) : [regex.exec(text)].filter(Boolean)
  return matches.length ? matches.map(match => `[${match.index}] ${JSON.stringify(match[0])}`).join('\n') : translate(lang, '无匹配')
}

export const tools = [
  { id: 'json', name: 'JSON 格式化', label: 'JSON', group: '格式与编码', icon: 'Braces', hue: 'mint',
    description: '格式化、压缩与校验 JSON 数据', sample: '{"project":"DevKit","features":["format","encode","inspect"],"local":true}',
    actions: ['格式化', '压缩', '校验'], run: (text, action, lang = 'zh') => {
      const data = JSON.parse(text)
      if (action === '校验') return translate(lang, '有效的 JSON')
      return JSON.stringify(data, null, action === '格式化' ? 2 : undefined)
    } },
  { id: 'base64', name: 'Base64 编解码', label: 'BASE64', group: '格式与编码', icon: 'Binary', hue: 'blue',
    description: '在 UTF-8 文本与 Base64 之间转换', sample: 'Hello, DevKit! 你好，开发者。', actions: ['编码', '解码'], run: base64 },
  { id: 'url', name: 'URL 编解码', label: 'URL', group: '格式与编码', icon: 'Link2', hue: 'violet',
    description: '编码或解码 URL 参数与特殊字符', sample: '关键词=开发者工具 & page=1', actions: ['编码', '解码'],
    run: (text, action) => action === '编码' ? encodeURIComponent(text) : decodeURIComponent(text) },
  { id: 'timestamp', name: '时间戳转换', label: 'UNIX TIME', group: '生成与校验', icon: 'Clock3', hue: 'amber',
    description: '转换 Unix 时间戳、本地时间和 UTC', sample: '1704067200', actions: ['转日期', '转时间戳'], run: timestamp },
  { id: 'uuid', name: 'UUID 生成器', label: 'UUID V4', group: '生成与校验', icon: 'Fingerprint', hue: 'pink',
    description: '使用浏览器加密 API 批量生成 UUID v4', sample: '5', placeholder: '输入数量，1–100', actions: ['生成 UUID'],
    run: text => {
      const count = Number(text.trim() || '1')
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('数量必须是 1–100 之间的整数。')
      return Array.from({ length: count }, () => crypto.randomUUID()).join('\n')
    } },
  { id: 'hash', name: '哈希计算', label: 'SHA', group: '生成与校验', icon: 'Hash', hue: 'mint',
    description: '生成 SHA-256、SHA-384 或 SHA-512 摘要', sample: 'Hello, DevKit!', actions: ['SHA-256', 'SHA-384', 'SHA-512'], run: hash },
  { id: 'regex', name: '正则测试', label: 'REGEX', group: '文本与颜色', icon: 'Regex', hue: 'violet',
    description: '测试 JavaScript 正则并查看匹配位置', sample: 'GET /api/users/42\nPOST /api/users/108', pattern: '/users/(\\d+)', run: testRegex, actions: ['测试匹配'] },
  { id: 'color', name: '颜色转换', label: 'HEX / RGB', group: '文本与颜色', icon: 'Palette', hue: 'amber',
    description: '在 HEX 和 RGB 色值之间转换', sample: '#5CF2B1', actions: ['转 RGB', '转 HEX'], run: color },
  { id: 'text', name: '文本处理', label: 'TEXT', group: '文本与颜色', icon: 'CaseSensitive', hue: 'blue',
    description: '批量去重、排序或转换文本大小写', sample: 'DevKit\nVue\nVite\nVue',
    actions: ['按行去重', '按行排序', '大写', '小写'], run: (text, action) => {
      const lines = text.split(/\r?\n/)
      if (action === '按行去重') return [...new Set(lines)].join('\n')
      if (action === '按行排序') return lines.sort().join('\n')
      return action === '大写' ? text.toUpperCase() : text.toLowerCase()
    } },
  ...extraTools,
  ...codeTools,
  ...systemTools,
  ...dataTools,
  ...proTools,
  ...developerTools,
  ...lifeTools,
]
