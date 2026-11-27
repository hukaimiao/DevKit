import ipaddr from 'ipaddr.js'
import { translate } from './i18n.js'

const code = '代码与配置'
const api = '接口调试'
const data = '数据计算'
const cryptoGroup = '加密与校验'
const network = '网络与时间'
const encoder = new TextEncoder()
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const fail = (language, message) => { throw new Error(translate(language, message)) }

function jsonPointer(text, pointer, language) {
  let value = JSON.parse(text)
  if (!pointer) return JSON.stringify(value, null, 2)
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer)) fail(language, '请输入有效的 JSON Pointer，例如 /users/0/name。')
  for (const token of pointer.slice(1).split('/')) {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~')
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key))) fail(language, 'JSON Pointer 指向的值不存在。')
    value = value[key]
  }
  return JSON.stringify(value, null, 2)
}

function jsonDiff(text, modified) {
  const changes = []
  function visit(before, after, path) {
    if (before === after) return
    const comparable = before && after && typeof before === 'object' &&
      typeof after === 'object' && Array.isArray(before) === Array.isArray(after)
    if (!comparable) {
      changes.push({ op: 'replace', path, before, after })
      return
    }
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const child = path + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1')
      if (!Object.hasOwn(after, key)) changes.push({ op: 'remove', path: child, before: before[key] })
      else if (!Object.hasOwn(before, key)) changes.push({ op: 'add', path: child, after: after[key] })
      else visit(before[key], after[key], child)
    }
  }
  visit(JSON.parse(text), JSON.parse(modified), '')
  return JSON.stringify(changes, null, 2)
}

function envToJson(text, _action, language) {
  const values = Object.create(null)
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const entry = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line)
    if (!entry) throw new Error(`${translate(language, '无效的 .env 行。')} (${index + 1})`)
    const [, key, rawValue] = entry
    if (/^['"`]/.test(rawValue)) {
      const quoted = /^(['"`])((?:\\.|.)*?)\1\s*(?:#.*)?$/.exec(rawValue)
      if (!quoted) throw new Error(`${translate(language, '无效的 .env 行。')} (${index + 1})`)
      values[key] = quoted[1] === '"' ? quoted[2].replace(/\\([nr"\\])/g, (_, char) => ({ n: '\n', r: '\r' })[char] ?? char) : quoted[2]
    } else {
      values[key] = rawValue.split('#', 1)[0].trimEnd()
    }
  }
  return JSON.stringify(values, null, 2)
}

function cookieHeader(text, _action, language) {
  const values = Object.create(null)
  const raw = text.trim().replace(/^cookie:\s*/i, '')
  for (const pair of raw.split(';').map(item => item.trim()).filter(Boolean)) {
    const separator = pair.indexOf('=')
    if (separator < 1) fail(language, '请输入由分号分隔的 Cookie 键值对。')
    const key = pair.slice(0, separator).trim()
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) fail(language, '请输入由分号分隔的 Cookie 键值对。')
    if (!values[key]) values[key] = []
    values[key].push(pair.slice(separator + 1).trim())
  }
  return JSON.stringify(values, null, 2)
}

function xmlValidate(text, _action, language) {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  const error = document.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror')[0]
    ?? [...document.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'parsererror')]
      .find(element => element.querySelector('h3 + div[style]'))
  if (error) throw new Error(error.textContent.trim())
  if (!document.documentElement) fail(language, '请输入 XML 文档。')
  return JSON.stringify({ valid: true, root: document.documentElement.nodeName,
    namespace: document.documentElement.namespaceURI }, null, 2)
}

async function hmac(text, secret, language, action) {
  if (!secret) fail(language, '请输入用于签名的密钥。')
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: action.slice(5) }, false, ['sign'])
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))))
}

function base64Url(text, action, language) {
  if (action === '编码') {
    return btoa(Array.from(encoder.encode(text), byte => String.fromCharCode(byte)).join(''))
      .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  }
  const input = text.trim()
  if (!/^[\w-]*={0,2}$/.test(input)) fail(language, '请输入有效的 Base64URL 内容。')
  const bytes = Uint8Array.from(atob(input.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  return value
})
function crc32(text) {
  let value = 0xffffffff
  for (const byte of encoder.encode(text)) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255]
  return ((value ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

function cidrMatch(text, subnet) {
  const address = ipaddr.parse(text.trim())
  const [networkAddress, bits] = ipaddr.parseCIDR(subnet.trim())
  return JSON.stringify({ address: address.toString(), subnet, matches: address.kind() === networkAddress.kind() &&
    address.match(networkAddress, bits) }, null, 2)
}

function readDate(text, language) {
  const value = text.trim()
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    fail(language, '请输入 ISO 日期或带时区的 ISO 时间。')
  }
  const day = new Date(value.slice(0, 10))
  const date = new Date(value)
  if (!Number.isFinite(+date) || !Number.isFinite(+day) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    fail(language, '请输入 ISO 日期或带时区的 ISO 时间。')
  }
  return date
}

function dateDifference(text, end, language) {
  const milliseconds = +readDate(end, language) - +readDate(text, language)
  return JSON.stringify({ milliseconds, seconds: milliseconds / 1000, minutes: milliseconds / 60000,
    hours: milliseconds / 3600000, days: milliseconds / 86400000 }, null, 2)
}

function colorContrast(text, background, language) {
  function luminance(input) {
    let value = input.trim().replace(/^#/, '')
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) fail(language, '请输入 #RGB 或 #RRGGBB。')
    if (value.length === 3) value = [...value].map(char => char.repeat(2)).join('')
    const channels = value.match(/../g).map(hex => parseInt(hex, 16) / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const colors = [luminance(text), luminance(background)].sort((a, b) => b - a)
  const ratio = (colors[0] + 0.05) / (colors[1] + 0.05)
  return JSON.stringify({ ratio: ratio.toFixed(4) + ':1', AA: { normal: ratio >= 4.5, large: ratio >= 3 },
    AAA: { normal: ratio >= 7, large: ratio >= 4.5 } }, null, 2)
}

const statusCodes = {
  100: 'Continue', 101: 'Switching Protocols', 200: 'OK', 201: 'Created', 202: 'Accepted',
  204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found',
  303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  406: 'Not Acceptable', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 412: 'Precondition Failed',
  413: 'Content Too Large', 415: 'Unsupported Media Type', 418: "I'm a teapot", 422: 'Unprocessable Content',
  425: 'Too Early', 426: 'Upgrade Required', 429: 'Too Many Requests', 431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons', 500: 'Internal Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported',
}
function httpStatus(text, _action, language) {
  const query = text.trim().toLowerCase()
  return Object.entries(statusCodes).filter(([code, label]) => (code + ' ' + label).toLowerCase().includes(query))
    .map(([code, label]) => `${code}  ${label}`).join('\n') || translate(language, '无匹配')
}

function bigintInspect(text, _action, language) {
  if (!/^[+-]?\d+$/.test(text.trim())) fail(language, '请输入十进制整数。')
  const value = BigInt(text.trim())
  return JSON.stringify({ value: value.toString(), bitLength: value === 0n ? 0 : (value < 0n ? -value : value).toString(2).length,
    isSafeJsInteger: value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER),
    fitsSigned32: value >= -(1n << 31n) && value < (1n << 31n),
    fitsSigned64: value >= -(1n << 63n) && value < (1n << 63n) }, null, 2)
}

function reverseDns(text) {
  const address = ipaddr.parse(text.trim())
  if (address.kind() === 'ipv4') return address.toByteArray().reverse().join('.') + '.in-addr.arpa.'
  return [...hex(address.toByteArray())].reverse().join('.') + '.ip6.arpa.'
}

export const proTools = [
  { id: 'json-pointer', name: 'JSON Pointer 查询', label: 'RFC 6901', group: code, icon: 'Braces', hue: 'blue',
    description: '按路径提取 JSON 中的对象、字段或数组元素', sample: '{"users":[{"name":"Ada"}]}',
    secondary: { label: '查询路径', sample: '/users/0/name' }, actions: ['查询值'], run: jsonPointer },
  { id: 'json-diff', name: 'JSON 结构对比', label: 'JSON DIFF', group: code, icon: 'GitCompareArrows', hue: 'amber',
    description: '忽略对象键顺序，按路径列出新增、删除和变更', sample: '{"version":1,"active":true,"tags":["web"]}',
    secondary: { label: '修改后 JSON', sample: '{"version":2,"tags":["web","api"]}', multiline: true },
    actions: ['比较结构'], run: jsonDiff },
  { id: 'dotenv', name: '.env 转 JSON', label: 'DOTENV', group: code, icon: 'Code2', hue: 'mint',
    description: '解析单行环境变量、引号和注释，保留字符串值', sample: 'PORT=8080\nexport APP_NAME="DevKit"\nDEBUG=false # local',
    actions: ['转 JSON'], run: envToJson },
  { id: 'xml-validator', name: 'XML 校验', label: 'XML', group: code, icon: 'Code2', hue: 'violet',
    description: '检查 XML 语法并显示根元素和命名空间', sample: '<config xmlns="urn:devkit"><port>8080</port></config>',
    actions: ['校验'], run: xmlValidate },
  { id: 'cookie', name: 'Cookie 标头解析', label: 'COOKIE', group: api, icon: 'ListFilter', hue: 'amber',
    description: '把请求 Cookie 转成 JSON，保留重复键', sample: 'Cookie: theme=dark; lang=zh-CN; theme=light',
    actions: ['转 JSON'], run: cookieHeader },
  { id: 'http-status', name: 'HTTP 状态码速查', label: 'HTTP STATUS', group: api, icon: 'ListFilter', hue: 'blue',
    description: '按状态码或英文关键词查常用 HTTP 响应状态', sample: '429', actions: ['查询状态码'], run: httpStatus },
  { id: 'hmac', name: 'HMAC 签名', label: 'HMAC', group: cryptoGroup, icon: 'KeyRound', hue: 'pink',
    description: '对 UTF-8 文本生成 HMAC SHA-256、SHA-384 或 SHA-512 签名', sample: 'Hello, DevKit!',
    secondary: { label: '密钥', sample: 'demo-key', secret: true }, actions: ['HMAC-SHA-256', 'HMAC-SHA-384', 'HMAC-SHA-512'], run: hmac },
  { id: 'crc32', name: 'CRC32 校验和', label: 'CRC32', group: cryptoGroup, icon: 'Hash', hue: 'mint',
    description: '计算 UTF-8 文本的 CRC32 校验和', sample: '123456789', actions: ['计算 CRC32'], run: crc32 },
  { id: 'base64url', name: 'Base64URL 编解码', label: 'BASE64URL', group: '格式与编码', icon: 'Binary', hue: 'blue',
    description: '转换 UTF-8 与 URL 安全的无填充 Base64', sample: 'DevKit + 浏览器', actions: ['编码', '解码'], run: base64Url },
  { id: 'cidr-match', name: 'IP 网段归属检查', label: 'CIDR MATCH', group: network, icon: 'Binary', hue: 'violet',
    description: '检查 IPv4 或 IPv6 地址是否落在指定 CIDR 网段', sample: '192.168.1.42',
    secondary: { label: 'CIDR 网段', sample: '192.168.1.0/24' }, actions: ['检查归属'], run: cidrMatch },
  { id: 'reverse-dns', name: '反向 DNS 名称生成', label: 'DNS PTR', group: network, icon: 'Link2', hue: 'blue',
    description: '将 IPv4 或 IPv6 地址转换为 PTR 查询名称', sample: '192.0.2.12', actions: ['生成 PTR 名称'], run: reverseDns },
  { id: 'date-difference', name: '日期间隔计算', label: 'DATE DIFF', group: data, icon: 'Clock3', hue: 'amber',
    description: '计算两个 ISO 日期或时间之间的有符号间隔', sample: '2026-11-26T12:00:00+08:00',
    secondary: { label: '结束日期或时间', sample: '2026-11-27T04:00:00Z' }, actions: ['计算间隔'], run: dateDifference },
  { id: 'contrast', name: '颜色对比度', label: 'WCAG CONTRAST', group: '文本与颜色', icon: 'Palette', hue: 'pink',
    description: '计算前景色与背景色的对比度及 WCAG AA / AAA 结果', sample: '#64F5B6',
    secondary: { label: '背景色', sample: '#0B1015' }, actions: ['计算对比度'], run: colorContrast },
  { id: 'integer-range', name: '整数范围检查', label: 'INT32 / INT64', group: data, icon: 'Calculator', hue: 'mint',
    description: '检查整数是否适合 JS 安全整数、int32 或 int64', sample: '9007199254740993',
    actions: ['检查范围'], run: bigintInspect },
]
