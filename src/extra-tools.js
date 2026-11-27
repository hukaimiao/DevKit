import { translate } from './i18n.js'
function decodeJwtPart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('JWT 片段包含无效字符。')
  const bytes = Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JWT 片段应为 JSON 对象。')
  return value
}

function inspectJwt(text) {
  const parts = text.trim().replace(/^Bearer\s+/i, '').split('.')
  if (parts.length !== 3) throw new Error('请输入三段式 JWT。')
  const header = decodeJwtPart(parts[0])
  const payload = decodeJwtPart(parts[1])
  return JSON.stringify({ header, payload, signatureVerified: false }, null, 2)
}

function queryString(text, action) {
  if (action === '转查询字符串') {
    const object = JSON.parse(text)
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('请输入 JSON 对象。')
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(object)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== null && typeof item === 'object') throw new Error('参数值支持基本类型或基本类型数组。')
        params.append(key, item === null ? '' : String(item))
      }
    }
    return params.toString()
  }
  const value = text.trim()
  const query = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? new URL(value).search : value.split('#')[0]
  const values = new Map()
  for (const [key, value] of new URLSearchParams(query)) {
    if (!values.has(key)) values.set(key, [])
    values.get(key).push(value)
  }
  return JSON.stringify(Object.fromEntries([...values].map(([key, items]) => [key, items.length === 1 ? items[0] : items])), null, 2)
}

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const entityValues = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }

function htmlEntities(text, action) {
  if (action === '转义') return text.replace(/[&<>"']/g, char => entities[char])
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, token) => {
    if (token[0] !== '#') return entityValues[token] ?? whole
    const isHex = token[1].toLowerCase() === 'x'
    const code = Number.parseInt(token.slice(isHex ? 2 : 1), isHex ? 16 : 10)
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '\ufffd'
  })
}

function numberBases(text) {
  const value = text.trim()
  if (!/^[+-]?(?:\d+|0x[\da-f]+|0b[01]+|0o[0-7]+)$/i.test(value)) {
    throw new Error('请输入整数，其他进制请使用 0b、0o 或 0x 前缀。')
  }
  const amount = BigInt(value.replace(/^[+-]/, '')) * (value.startsWith('-') ? -1n : 1n)
  return [2, 8, 10, 16].map(base => `${base.toString().padStart(2)}  ${amount.toString(base)}`).join('\n')
}

function analyzeText(text, _action, lang = 'zh') {
  const chars = [...text]
  return [
    ['字符数（Unicode 码点）', chars.length],
    ['UTF-8 字节数', new TextEncoder().encode(text).length],
    ['行数', text ? text.split(/\r\n|\r|\n/).length : 0],
    ['空白分隔词数', text.trim() ? text.trim().split(/\s+/u).length : 0],
    ['汉字数', chars.filter(char => /\p{Script=Han}/u.test(char)).length],
  ].map(([label, count]) => `${translate(lang, label)}  ${count}`).join('\n')
}

function jsonToCsv(text) {
  const rows = JSON.parse(text)
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('请输入至少包含一条记录的 JSON 对象数组。')
  }
  const columns = [...new Set(rows.flatMap(Object.keys))]
  if (!columns.length) throw new Error('至少需要一个字段。')
  const escape = value => {
    const data = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /[",\r\n]/.test(data) ? '"' + data.replaceAll('"', '""') + '"' : data
  }
  return [columns, ...rows.map(row => columns.map(key => Object.hasOwn(row, key) ? row[key] : null))]
    .map(row => row.map(escape).join(',')).join('\r\n')
}

export const extraTools = [
  { id: 'jwt', name: 'JWT 解析', label: 'JWT', group: '接口调试', icon: 'KeyRound', hue: 'violet',
    description: '查看 JWT 标头和载荷，解析过程不校验签名',
    sample: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkZXZraXQiLCJyb2xlIjoiZGV2ZWxvcGVyIn0.',
    actions: ['解析 JWT'], run: inspectJwt },
  { id: 'query', name: 'URL 参数转换', label: 'QUERY', group: '接口调试', icon: 'ListFilter', hue: 'blue',
    description: '双向转换查询字符串和 JSON，保留重复参数',
    sample: 'https://example.com/search?q=Vue+3&tag=web&tag=tools', actions: ['解析参数', '转查询字符串'], run: queryString },
  { id: 'html', name: 'HTML 实体转换', label: 'HTML', group: '格式与编码', icon: 'Code2', hue: 'pink',
    description: '转义 HTML 特殊字符，解码常见和数字实体',
    sample: '<a title="DevKit">JSON & URL</a>', actions: ['转义', '反转义'], run: htmlEntities },
  { id: 'csv', name: 'JSON 转 CSV', label: 'CSV', group: '格式与编码', icon: 'Sheet', hue: 'mint',
    description: '将 JSON 对象数组转换为 CSV，自动提取表头',
    sample: '[{"id":1,"name":"上海"},{"id":2,"name":"杭州","active":true}]', actions: ['转 CSV'], run: jsonToCsv },
  { id: 'radix', name: '整数进制转换', label: 'BASE 2–16', group: '生成与校验', icon: 'Calculator', hue: 'amber',
    description: '精确转换二、八、十、十六进制，支持大整数',
    sample: '0x123456789ABCDEF', actions: ['转换进制'], run: numberBases },
  { id: 'stats', name: '文本统计', label: 'STATS', group: '文本与颜色', icon: 'BarChart3', hue: 'blue',
    description: '统计字符、UTF-8 字节、行数、词数和汉字数',
    sample: 'Hello, DevKit!\n你好，开发者。', actions: ['统计文本'], run: analyzeText },
]
