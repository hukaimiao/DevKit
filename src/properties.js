import { parse, stringify } from 'yaml'

const whitespace = /[ \t\f]/

function unescapeProperty(value) {
  return value.replace(/\\(u[\s\S]{0,4}|[\s\S])/g, (_, escape) => {
    if (escape[0] === 'u') {
      if (!/^u[\da-f]{4}$/i.test(escape)) throw new Error('Invalid Unicode escape in .properties.')
      return String.fromCharCode(parseInt(escape.slice(1), 16))
    }
    return ({ t: '\t', r: '\r', n: '\n', f: '\f' })[escape] ?? escape
  })
}

function readProperties(text) {
  const entries = new Map()
  let pending = null
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const trimmed = raw.replace(/^[ \t\f]+/, '')
    if (pending === null && (!trimmed || /^[#!]/.test(trimmed))) continue
    const line = (pending ?? '') + trimmed
    if ((line.match(/\\+$/)?.[0].length ?? 0) % 2 === 1) {
      pending = line.slice(0, -1)
      continue
    }
    addProperty(entries, line)
    pending = null
  }
  if (pending !== null) addProperty(entries, pending)
  return entries
}

function addProperty(entries, line) {
  let cursor = 0
  while (cursor < line.length && !/[ \t\f=:]/.test(line[cursor])) {
    cursor += line[cursor] === '\\' ? 2 : 1
  }
  const key = unescapeProperty(line.slice(0, cursor))
  while (cursor < line.length && whitespace.test(line[cursor])) cursor++
  if (line[cursor] === '=' || line[cursor] === ':') cursor++
  while (cursor < line.length && whitespace.test(line[cursor])) cursor++
  entries.set(key, unescapeProperty(line.slice(cursor)))
}

function escapeProperty(value, key = false) {
  const escapes = { '\\': '\\\\', '\t': '\\t', '\r': '\\r', '\n': '\\n', '\f': '\\f' }
  return value.replace(/[\\\t\r\n\f =:#!]/g, (char, index) => {
    if (escapes[char]) return escapes[char]
    return key || (char === ' ' && index === 0) ? '\\' + char : char
  })
}

function yamlToProperties(text) {
  const root = parse(text, { maxAliasCount: 100 })
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('YAML must contain a top-level mapping.')
  const flat = new Map()
  const active = new Set()
  function visit(value, path) {
    if (value !== null && typeof value === 'object') {
      if (active.has(value)) throw new Error('Circular YAML aliases cannot be converted.')
      active.add(value)
      const entries = Object.entries(value)
      if (!entries.length && path.length) throw new Error(`Empty collections have no .properties representation: ${path.join('.')}`)
      for (const [key, child] of entries) visit(child, [...path, key])
      active.delete(value)
      return
    }
    const key = path.join('.')
    if (flat.has(key)) throw new Error(`Duplicate flattened key: ${key}`)
    flat.set(key, value === null ? '' : String(value))
  }
  visit(root, [])
  return [...flat].map(([key, value]) => `${escapeProperty(key, true)}=${escapeProperty(value)}`).join('\n')
}

function propertiesToYaml(text) {
  const entries = readProperties(text)
  const root = Object.create(null)
  for (const [key, value] of entries) {
    const path = key.split('.')
    let node = root
    for (const part of path.slice(0, -1)) {
      if (!Object.hasOwn(node, part)) node[part] = Object.create(null)
      if (typeof node[part] === 'string') throw new Error(`Conflicting property paths: ${key}`)
      node = node[part]
    }
    const last = path.at(-1)
    if (Object.hasOwn(node, last)) throw new Error(`Conflicting property paths: ${key}`)
    node[last] = value
  }
  return stringify(root)
}

export const propertiesTool = {
  id: 'properties', name: 'YAML ↔ Properties', label: '.PROPERTIES', group: '代码与配置', icon: 'Braces', hue: 'amber',
  description: '转换 Java 配置。嵌套键用点连接，数组按数字索引展开，Properties 值按字符串读取',
  sample: 'server:\n  port: 8080\n  servlet:\n    context-path: /api\napp:\n  name: DevKit',
  samples: { 'Properties 转 YAML': 'server.port=8080\nserver.servlet.context-path=/api\napp.name=DevKit' },
  actions: ['YAML 转 Properties', 'Properties 转 YAML'],
  run: (text, action) => action === 'Properties 转 YAML' ? propertiesToYaml(text) : yamlToProperties(text),
}
