import { propertiesTool } from './properties.js'
import { parse, stringify } from 'yaml'
import { diffLines } from 'diff'

function formatCode(parser, plugins) {
  return async text => {
    const [{ format }, ...loaded] = await Promise.all([import('prettier/standalone'), ...plugins.map(load => load())])
    return format(text, { parser, plugins: loaded.map(module => module.default), tabWidth: 2 })
  }
}

const babel = () => import('prettier/plugins/babel')
const estree = () => import('prettier/plugins/estree')
const typescript = () => import('prettier/plugins/typescript')
const html = () => import('prettier/plugins/html')
const css = () => import('prettier/plugins/postcss')
const markdown = () => import('prettier/plugins/markdown')

export function compareText(before, after) {
  return diffLines(before, after, { newlineIsToken: false })
    .map(part => (part.added ? '+' : part.removed ? '-' : ' ') + ' ' +
      part.value.replace(/\n$/, '').split('\n').join(`\n${part.added ? '+' : part.removed ? '-' : ' '} `))
    .join('\n')
}

function csvToJson(text) {
  if (!text.trim()) throw new Error('请输入带表头的 CSV。')
  const rows = [[]]
  const field = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(?=,|\r|\n|$)/y
  text = text.replace(/^\uFEFF/, '')
  let offset = 0
  while (true) {
    field.lastIndex = offset
    const match = field.exec(text)
    if (!match) throw new Error(`第 ${offset + 1} 个字符附近的 CSV 格式无效。`)
    rows.at(-1).push(match[1] == null ? match[2] : match[1].replaceAll('""', '"'))
    offset = field.lastIndex
    if (offset === text.length) break
    if (text[offset] === ',') {
      offset++
      continue
    }
    offset += text.startsWith('\r\n', offset) ? 2 : 1
    if (offset === text.length) break
    rows.push([])
  }
  const [headers, ...data] = rows
  if (headers.some(name => !name.trim()) || new Set(headers).size !== headers.length) throw new Error('CSV 表头必须非空且互不重复。')
  if (data.some(row => row.length !== headers.length)) throw new Error('数据行的字段数与表头不一致。')
  return JSON.stringify(data.map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]]))), null, 2)
}

const group = '代码与配置'
function formatter(id, name, label, description, sample, run) {
  return { id, name, label, group, icon: 'Code2', hue: 'mint', description, sample, actions: ['格式化'], run }
}

export const codeTools = [
  propertiesTool,
  formatter('js', 'JavaScript 格式化', 'JS', '使用 Prettier 整理 JavaScript 和 JSX', 'const greet=(name)=>{return `Hello, ${name}`}', formatCode('babel', [babel, estree])),
  formatter('ts', 'TypeScript 格式化', 'TS', '格式化 TypeScript 类型、函数与泛型', 'type User={id:number;name:string};const users:User[]=[]', formatCode('typescript', [typescript, estree])),
  formatter('html-format', 'HTML 格式化', 'HTML', '整理 HTML 标签和缩进', '<main><h1>DevKit</h1><p>Hello</p></main>', formatCode('html', [html])),
  formatter('css', 'CSS 格式化', 'CSS', '整理样式选择器与属性声明', '.card{color:#fff;padding:12px}.card:hover{opacity:.8}', formatCode('css', [css])),
  formatter('markdown', 'Markdown 格式化', 'MD', '整理 Markdown 标题、列表和表格', '# DevKit\n\n| tool|name|\n|---|---|\n|1|JSON|', formatCode('markdown', [markdown])),
  formatter('sql', 'SQL 格式化', 'SQL', '格式化标准 SQL 语句与查询', 'select u.id,u.name from users u where u.active=1 order by u.id desc;',
    async text => (await import('sql-formatter')).format(text, { keywordCase: 'upper' })),
  { id: 'yaml', name: 'YAML ↔ JSON', label: 'YAML', group, icon: 'Braces', hue: 'violet',
    description: '在 YAML 配置与 JSON 数据之间双向转换', sample: 'project: DevKit\nfeatures:\n  - format\n  - convert',
    actions: ['YAML 转 JSON', 'JSON 转 YAML'], run: (text, action) => action === 'JSON 转 YAML'
      ? stringify(JSON.parse(text)) : JSON.stringify(parse(text, { maxAliasCount: 100 }), null, 2) },
  { id: 'csv-json', name: 'CSV 转 JSON', label: 'CSV', group, icon: 'Sheet', hue: 'blue',
    description: '使用首行作为字段名，支持引号、逗号和跨行字段',
    sample: 'id,name,city\n1,Ada,"Hangzhou, China"\n2,Lin,Shanghai', actions: ['转 JSON'], run: csvToJson },
  { id: 'diff', name: '文本差异对比', label: 'DIFF', group, icon: 'GitCompareArrows', hue: 'amber',
    description: '按行标出新增、删除和保留内容', sample: 'DevKit\nversion=1\nformat=json', comparison: 'DevKit\nversion=2\nformat=json\nmode=local',
    actions: ['比较差异'] },
  { id: 'json-keys', name: 'JSON 键排序', label: 'SORT KEYS', group, icon: 'ListFilter', hue: 'blue',
    description: '按字典序递归整理对象键，保留数组顺序', sample: '{"z":1,"a":{"c":1,"b":2},"list":[{"z":3,"a":4}]}',
    actions: ['排序键'], run: text => {
      function sort(value) {
        if (Array.isArray(value)) return value.map(sort)
        if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]))
        return value
      }
      return JSON.stringify(sort(JSON.parse(text)), null, 2)
    } },
]
