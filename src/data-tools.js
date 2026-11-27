import { translate } from './i18n.js'
const textGroup = '文本与颜色'
const dataGroup = '数据计算'
const generators = '日常生成器'

function listTransform(text, action) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (action === '转 JSON 数组') return JSON.stringify(lines, null, 2)
  if (action === '转 SQL IN 列表') return '(' + lines.map(line => "'" + line.replaceAll("'", "''") + "'").join(', ') + ')'
  return lines.map(line => /[",\r\n]/.test(line) ? '"' + line.replaceAll('"', '""') + '"' : line).join(',')
}

function casing(text, action) {
  const words = text.trim().replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const cap = word => word.replace(/^./u, letter => letter.toUpperCase())
  switch (action) {
    case 'camelCase': return words.map((word, index) => index === 0 ? word : cap(word)).join('')
    case 'PascalCase': return words.map(cap).join('')
    case 'snake_case': return words.join('_')
    case 'CONSTANT_CASE': return words.join('_').toUpperCase()
    default: return words.join('-')
  }
}

function versionCompare(text) {
  const versions = text.trim().split(/\s+/)
  if (versions.length !== 2) throw new Error('请输入两个以空白分开的 SemVer 版本号。')
  function parse(value) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+([\da-z-]+(?:\.[\da-z-]+)*))?$/i.exec(value)
    const pre = match?.[4]?.split('.') ?? []
    if (!match || pre.some(part => /^0\d+$/.test(part))) throw new Error(`无效的 SemVer 版本号：${value}`)
    return { parts: match.slice(1, 4).map(BigInt), pre }
  }
  const [left, right] = versions.map(parse)
  const order = (a, b) => a === b ? 0 : a > b ? 1 : -1
  let result = 0
  for (let index = 0; index < 3 && !result; index++) result = order(left.parts[index], right.parts[index])
  if (!result && (!left.pre.length || !right.pre.length)) result = order(right.pre.length, left.pre.length)
  if (!result) {
    for (let index = 0; index < Math.min(left.pre.length, right.pre.length) && !result; index++) {
      const a = left.pre[index], b = right.pre[index]
      const numericA = /^\d+$/.test(a), numericB = /^\d+$/.test(b)
      result = numericA && numericB ? order(BigInt(a), BigInt(b)) : numericA !== numericB ? numericA ? -1 : 1 : order(a, b)
    }
    if (!result) result = order(left.pre.length, right.pre.length)
  }
  return `${versions[0]} ${result === 0 ? '=' : result > 0 ? '>' : '<'} ${versions[1]}`
}

function bytes(text) {
  const match = /^(\d+(?:\.\d+)?)\s*(B|[KMGT]B|[KMGT]iB)?$/i.exec(text.trim())
  if (!match) throw new Error('请输入数值和单位，例如 1.5 GiB；省略单位时使用字节。')
  const unit = (match[2] ?? 'B').toUpperCase()
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB', 'TiB']
  const factors = [1, 1e3, 1e6, 1e9, 1e12, 2 ** 10, 2 ** 20, 2 ** 30, 2 ** 40]
  const value = Number(match[1]) * factors[units.findIndex(label => label.toUpperCase() === unit)]
  if (!Number.isFinite(value)) throw new Error('数值过大。')
  return units.map((label, index) => `${label.padEnd(3)}  ${Number((value / factors[index]).toPrecision(12))}`).join('\n')
}

function decodeEscapes(text, action) {
  if (action === '转 JSON 字符串') return JSON.stringify(text)
  const value = JSON.parse(text)
  if (typeof value !== 'string') throw new Error('请输入带双引号的 JSON 字符串。')
  return value
}

function randomBytes(text, action) {
  const count = Number(text.trim() || '32')
  if (!Number.isInteger(count) || count < 1 || count > 1024) throw new Error('字节数必须在 1–1024 之间。')
  const raw = crypto.getRandomValues(new Uint8Array(count))
  return action === '生成 Base64URL'
    ? btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : Array.from(raw, byte => byte.toString(16).padStart(2, '0')).join('')
}

function lineTool(text, action) {
  const lines = text.split(/\r\n|\n|\r/)
  switch (action) {
    case '添加行号': return lines.map((line, index) => `${index + 1}\t${line}`).join('\n')
    case '移除空行': return lines.filter(line => line.trim()).join('\n')
    case '修剪空白': return lines.map(line => line.trim()).join('\n')
    default: return lines.reverse().join('\n')
  }
}

function httpHeaders(text) {
  const result = Object.create(null)
  for (const line of text.split(/\r?\n/).filter(line => line.trim())) {
    const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[\t ]*(.*)$/.exec(line)
    if (!match) throw new Error(`无效的 HTTP 标头行：${line}`)
    const name = match[1].toLowerCase()
    if (!result[name]) result[name] = []
    result[name].push(match[2].trim())
  }
  return JSON.stringify(result, null, 2)
}

function duration(text, _action, lang = 'zh') {
  const value = text.trim()
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('请输入非负的毫秒数。')
  const total = Number(value)
  if (!Number.isFinite(total)) throw new Error('数值过大。')
  return [ ['毫秒', 1], ['秒', 1000], ['分钟', 60000], ['小时', 3600000], ['天', 86400000] ]
    .map(([unit, factor]) => `${translate(lang, unit)}  ${Number((total / factor).toPrecision(12))}`).join('\n')
}

function grepText(text, pattern, flags, lang = 'zh') {
  const regex = new RegExp(pattern, flags.replace(/[gy]/g, ''))
  return text.split(/\r?\n/).flatMap((line, index) => regex.test(line) ? [`${index + 1}: ${line}`] : []).join('\n') || translate(lang, '无匹配行')
}

export const dataTools = [
  { id: 'list', name: '列表格式转换', label: 'LIST', group: textGroup, icon: 'ListFilter', hue: 'blue',
    description: '将逐行列表转换为 JSON、CSV 单行或 SQL IN 列表', sample: "alice\nbob\nO'Connor",
    actions: ['转 JSON 数组', '转 CSV 单行', '转 SQL IN 列表'], run: listTransform },
  { id: 'case', name: '变量命名转换', label: 'CASE', group: textGroup, icon: 'CaseSensitive', hue: 'pink',
    description: '在驼峰、下划线、大写常量及短横线命名之间转换', sample: 'parseHTTPResponse',
    actions: ['camelCase', 'PascalCase', 'snake_case', 'kebab-case', 'CONSTANT_CASE'], run: casing },
  { id: 'line', name: '行编辑器', label: 'LINES', group: textGroup, icon: 'ListFilter', hue: 'amber',
    description: '添加行号、移除空行、修剪空白或反转行序', sample: '  first  \n\n second\nthird',
    actions: ['添加行号', '移除空行', '修剪空白', '反转行序'], run: lineTool },
  { id: 'grep', name: '按正则筛选行', label: 'GREP', group: textGroup, icon: 'Regex', hue: 'violet',
    description: '从日志或文本中筛出匹配行并保留原行号', sample: 'INFO App started\nERROR Request failed\nINFO Retry completed',
    pattern: '^ERROR', actions: ['筛选匹配行'], run: grepText },
  { id: 'semver', name: 'SemVer 版本比较', label: 'SEMVER', group: dataGroup, icon: 'GitCompareArrows', hue: 'mint',
    description: '按 SemVer 比较两个版本，支持预发布与构建元数据', sample: '2.0.0-rc.2\n2.0.0-rc.10', actions: ['比较版本'], run: versionCompare },
  { id: 'bytes', name: '存储单位转换', label: 'KB / KiB', group: dataGroup, icon: 'Calculator', hue: 'blue',
    description: '转换十进制和二进制容量单位', sample: '1.5 GiB', actions: ['转换容量'], run: bytes },
  { id: 'duration', name: '耗时单位转换', label: 'DURATION', group: dataGroup, icon: 'Clock3', hue: 'amber',
    description: '把毫秒转换为秒、分钟、小时和天', sample: '86400000', actions: ['转换耗时'], run: duration },
  { id: 'json-string', name: 'JSON 字符串转义', label: 'STRING', group: '格式与编码', icon: 'Braces', hue: 'violet',
    description: '将多行文本转成 JSON 字符串，或还原其中的转义', sample: 'Hello, "DevKit"\n第二行',
    actions: ['转 JSON 字符串', '还原文本'], run: decodeEscapes },
  { id: 'random', name: '随机字节生成', label: 'RANDOM', group: generators, icon: 'Fingerprint', hue: 'pink',
    description: '生成密码学安全的随机字节，输出 Hex 或 Base64URL', sample: '32', placeholder: '输入字节数，1–1024',
    actions: ['生成 Hex', '生成 Base64URL'], run: randomBytes },
  { id: 'headers', name: 'HTTP 标头解析', label: 'HTTP HEADERS', group: '接口调试', icon: 'ListFilter', hue: 'mint',
    description: '把原始 HTTP 标头转成 JSON 数组字段，保留重复项', sample: 'Content-Type: application/json\nVary: Accept-Encoding\nVary: Origin',
    actions: ['转 JSON'], run: httpHeaders },
]
