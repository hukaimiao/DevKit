import { translate } from './i18n.js'

const git = [
  ['git status --short', '简洁查看工作区状态', 'Show a compact working-tree status'],
  ['git switch -c <branch>', '创建并切换到新分支', 'Create and switch to a branch'],
  ['git branch -vv', '查看本地分支和跟踪关系', 'List branches and their upstreams'],
  ['git log --oneline --graph --decorate --all', '以图形查看所有分支的提交历史', 'Show commit history as a graph'],
  ['git diff', '查看未暂存改动', 'Show unstaged changes'],
  ['git diff --staged', '查看已暂存改动', 'Show staged changes'],
  ['git add -p', '按块暂存改动', 'Stage selected hunks'],
  ['git restore --staged <file>', '取消暂存，保留工作区改动', 'Unstage a file while retaining working-tree changes'],
  ['git commit -m "<message>"', '提交当前暂存区', 'Commit staged changes'],
  ['git fetch --prune', '更新远程引用并清理失效的跟踪引用', 'Fetch and prune stale remote-tracking refs'],
  ['git pull --ff-only', '仅允许快进式拉取', 'Pull only when a fast-forward is possible'],
  ['git push -u origin <branch>', '推送分支并设置上游', 'Push a branch and set its upstream'],
  ['git merge --abort', '中止进行中的合并', 'Abort an in-progress merge'],
  ['git rebase --continue', '解决冲突并暂存后继续变基', 'Continue a rebase after staging conflict resolutions'],
  ['git rebase --abort', '中止进行中的变基', 'Abort an in-progress rebase'],
  ['git stash push -u -m "<message>"', '暂存工作区及未跟踪文件', 'Stash changes and untracked files'],
  ['git stash list', '查看 stash 列表', 'List stashes'],
  ['git stash apply <stash>', '应用 stash 并保留记录', 'Apply a stash and keep it in the list'],
  ['git cherry-pick <commit>', '将指定提交应用到当前分支', 'Apply a commit to the current branch'],
  ['git revert <commit>', '创建一个提交以撤销指定提交', 'Create a commit that reverses the selected commit'],
  ['git reflog', '查看本地引用移动记录', 'Show local reference updates'],
  ['git blame -L <start>,<end> <file>', '查看行范围的提交来源', 'Show commit attribution for a range of lines'],
  ['git bisect start', '开始用二分定位引入问题的提交', 'Start finding the first bad commit with binary search'],
  ['git worktree list', '列出关联的工作树', 'List linked worktrees'],
  ['git tag --list', '查看本地标签', 'List local tags'],
]

function lookupGit(text, _action, language) {
  const terms = text.toLowerCase().trim().split(/\s+/)
  return git.filter(row => terms.every(term => row.some(value => value.toLowerCase().includes(term))))
    .map(([command, zh, en]) => `${command}\n  ${language === 'en' ? en : zh}`).join('\n\n') || translate(language, '无匹配')
}

function invalid(language, message) {
  throw new Error(translate(language, message))
}

function curlTokens(input, language) {
  const tokens = []
  let word = ''
  let quote = ''
  let started = false
  const source = input.replace(/\r\n/g, '\n').trim()
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (char === '\\' && quote !== "'") {
      const next = source[++index]
      if (next === undefined) invalid(language, 'cURL 命令包含不完整的转义。')
      if (next !== '\n') {
        word += quote === '"' && !/["\\$`]/.test(next) ? '\\' + next : next
        started = true
      }
    } else if (quote) {
      if (char === quote) quote = ''
      else if (quote === '"' && /[$`]/.test(char)) invalid(language, '请将 cURL 中的 Shell 表达式替换为实际值。')
      else word += char
    } else if (char === "'" || char === '"') {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) tokens.push(word)
      word = ''
      started = false
    } else {
      if (/[;&|<>`$()]/.test(char)) invalid(language, '请将 cURL 中的 Shell 表达式替换为实际值。')
      word += char
      started = true
    }
  }
  if (quote) invalid(language, 'cURL 命令中的引号没有闭合。')
  if (started) tokens.push(word)
  return tokens
}

function curlToCode(text, action, language) {
  const tokens = curlTokens(text, language)
  if (tokens.shift() !== 'curl') invalid(language, '请粘贴一条以 curl 开头的命令。')
  const headers = []
  const data = []
  let url
  let method
  let get = false
  let follow = false
  for (let index = 0; index < tokens.length; index++) {
    let option = tokens[index]
    let inline
    if (option.startsWith('--') && option.includes('=')) {
      const at = option.indexOf('=')
      inline = option.slice(at + 1)
      option = option.slice(0, at)
    } else if (/^-[XHd]/.test(option) && option.length > 2) {
      inline = option.slice(2)
      option = option.slice(0, 2)
    }
    const argument = () => {
      const value = inline ?? tokens[++index]
      if (value === undefined) invalid(language, 'cURL 选项缺少参数。')
      return value
    }
    const setUrl = value => {
      if (url !== undefined) invalid(language, '每次只能转换一个 URL。')
      url = value
    }
    switch (option) {
      case '-X': case '--request': method = argument(); break
      case '-H': case '--header': {
        const header = argument()
        const at = header.indexOf(':')
        const name = header.slice(0, at).trim()
        const value = header.slice(at + 1).trim()
        if (at < 1 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !value || /[\r\n]/.test(value)) {
          invalid(language, '仅支持格式为 名称: 值 的非空请求标头。')
        }
        headers.push([name, value])
        break
      }
      case '-d': case '--data': case '--data-raw': case '--data-binary': {
        const value = argument()
        if (option !== '--data-raw' && value.startsWith('@')) invalid(language, '请粘贴请求正文。此工具不会读取 @文件。')
        data.push(value)
        break
      }
      case '--url': setUrl(argument()); break
      case '-G': case '--get': get = true; break
      case '-I': case '--head': method = 'HEAD'; break
      case '-L': case '--location': follow = true; break
      case '-s': case '-S': case '-sS': case '--silent': case '--show-error': break
      default:
        if (option.startsWith('-')) throw new Error(`${translate(language, '不支持的 cURL 选项')} ${option}`)
        setUrl(option)
    }
  }
  if (!url || !/^https?:\/\//i.test(url) || !URL.canParse(url)) invalid(language, '请输入有效的 HTTP 或 HTTPS URL。')
  method = method ?? (get || !data.length ? 'GET' : 'POST')
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)) invalid(language, 'HTTP 方法无效。')
  let body = data.length ? data.join('&') : undefined
  if (get && body !== undefined) {
    const at = url.indexOf('#')
    const base = at < 0 ? url : url.slice(0, at)
    url = base + (base.includes('?') ? '&' : '?') + body + (at < 0 ? '' : url.slice(at))
    body = undefined
  }
  const knownHeaders = new Set(headers.map(([name]) => name.toLowerCase()))
  if (body !== undefined && !knownHeaders.has('content-type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded'])
  const literal = JSON.stringify
  if (action === '生成 Python Requests') {
    if (knownHeaders.size < headers.length - Number(body !== undefined && !knownHeaders.has('content-type'))) {
      invalid(language, 'Python Requests 输出不支持重复的请求标头。')
    }
    const args = [literal(method), literal(url), `headers=${literal(Object.fromEntries(headers))}`,
      ...(body !== undefined ? [`data=${literal(body)}.encode("utf-8")`] : []), `allow_redirects=${follow ? 'True' : 'False'}`]
    return `import requests\n\nresponse = requests.request(\n  ${args.join(',\n  ')},\n)\nprint(response.text)`
  }
  if (body !== undefined && /^(GET|HEAD)$/i.test(method)) invalid(language, 'Fetch 的 GET 和 HEAD 请求不支持正文。')
  return `const response = await fetch(${literal(url)}, ${JSON.stringify({
    method, headers, ...(body !== undefined ? { body } : {}), redirect: follow ? 'follow' : 'manual',
  }, null, 2)});\nconsole.log(await response.text());`
}

function typescriptType(value, depth) {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    const items = [...new Set(value.map(item => typescriptType(item, depth)))]
    return items.length ? `Array<${items.join(' | ')}>` : 'Array<unknown>'
  }
  if (typeof value !== 'object') return typeof value
  const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
  if (!entries.length) return 'Record<string, unknown>'
  const lines = entries.map(([key, item]) => `${'  '.repeat(depth + 1)}${JSON.stringify(key)}: ${typescriptType(item, depth + 1)};`)
  return '{\n' + lines.join('\n') + '\n' + '  '.repeat(depth) + '}'
}

function jsonToTypescript(text, name, language) {
  const alias = name.trim() || 'Root'
  // Parsing a synthetic identifier-free declaration would require loading a compiler.
  // A capitalized ASCII identifier avoids TypeScript's reserved lowercase words.
  if (!/^[A-Z][A-Za-z0-9_$]*$/.test(alias) || ['String', 'Number', 'Boolean', 'Object', 'Symbol', 'BigInt', 'Function', 'Array', 'Record'].includes(alias)) {
    invalid(language, '请输入以大写字母开头的类型名，避免使用 Array 等内置类型名称。')
  }
  return `export type ${alias} = ${typescriptType(JSON.parse(text), 0)};`
}

async function hashFile(file, algorithm, _options, language) {
  if (file.size > 128 * 1024 * 1024) invalid(language, '文件哈希支持最大 128 MiB 的文件。')
  const buffer = await file.arrayBuffer()
  const result = await crypto.subtle.digest(algorithm, buffer)
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function compressImage(file, format, options, language) {
  if (!/^image\/(jpeg|png|webp|bmp|avif)$/.test(file.type)) {
    invalid(language, '请选择 JPEG、PNG、WebP、BMP 或 AVIF 图片。')
  }
  if (file.size > 40 * 1024 * 1024) invalid(language, '图片压缩支持最大 40 MiB 的图片。')
  const quality = Number(options.quality)
  const limit = Number(options.dimension)
  if (!Number.isInteger(quality) || quality < 1 || quality > 100 || !Number.isInteger(limit) || limit < 1 || limit > 4096) {
    invalid(language, '质量应为 1–100，最长边应为 1–4096 像素。')
  }
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, limit / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (format === 'image/jpeg') {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, format, quality / 100))
    if (!blob || blob.type !== format) invalid(language, '当前浏览器无法输出所选图片格式。')
    return { blob, width: canvas.width, height: canvas.height, originalSize: file.size,
      name: (file.name.replace(/\.[^.]*$/, '') || 'image') + (format === 'image/webp' ? '-compressed.webp' : '-compressed.jpg') }
  } finally {
    image.close()
  }
}

export const developerTools = [
  { id: 'git-reference', name: 'Git 命令速查', label: 'GIT', group: '代码与配置', icon: 'GitCompareArrows', hue: 'amber',
    description: '按中英文关键词查找分支、暂存、变基、回滚等常用命令，留空查看全部',
    sample: 'stash', actions: ['查找命令'], run: lookupGit },
  { id: 'curl-code', name: 'cURL 转代码', label: 'CURL', group: '接口调试', icon: 'Terminal', hue: 'blue',
    description: '将带方法、标头和正文的 HTTP cURL 命令转换为 Fetch 或 Python Requests 代码',
    sample: "curl -X POST 'https://example.com/api' -H 'Content-Type: application/json' --data-raw '{\"name\":\"DevKit\"}'",
    actions: ['生成 JavaScript Fetch', '生成 Python Requests'], run: curlToCode },
  { id: 'json-typescript', name: 'JSON 生成 TypeScript 类型', label: 'JSON → TS', group: '代码与配置', icon: 'Braces', hue: 'violet',
    description: '从 JSON 示例推断嵌套对象和数组类型，支持设置根类型名称',
    sample: '{"id":1,"name":"DevKit","tags":["developer",null],"settings":{"local":true}}',
    secondary: { label: '根类型名称', sample: 'Root' }, actions: ['生成 TypeScript'], run: jsonToTypescript },
  { id: 'file-hash', name: '文件哈希', label: 'FILE SHA', group: '加密与校验', icon: 'Hash', hue: 'mint',
    description: '从本地文件计算 SHA-256、SHA-384 或 SHA-512，最多 128 MiB',
    file: true, actions: ['SHA-256', 'SHA-384', 'SHA-512'], run: hashFile },
  { id: 'image-compress', name: '图片压缩', label: 'WEBP / JPEG', group: '文本与颜色', icon: 'Palette', hue: 'pink',
    description: '在本地调整图片尺寸和质量，预览并下载 WebP 或 JPEG',
    file: true, accept: 'image/jpeg,image/png,image/webp,image/bmp,image/avif', image: true,
    imageOptions: true, actions: ['压缩为 WebP', '压缩为 JPEG'],
    run: (file, action, options, language) => compressImage(file, action === '压缩为 WebP' ? 'image/webp' : 'image/jpeg', options, language) },
]
