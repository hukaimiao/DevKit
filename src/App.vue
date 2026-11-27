<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Binary, Braces, Calculator, CaseSensitive, Check, ChevronRight, Code2,
  Clock3, Command, Copy, Download, Fingerprint, GitCompareArrows, Globe2, Hash, KeyRound, LayoutGrid, Link2, ListFilter, MapPin, Menu, Palette, QrCode, Regex, Sheet, Star,
  Search, ShieldCheck, Terminal, X, Zap } from 'lucide-vue-next'
import { tools } from './tools'
import CronEditor from './CronEditor.vue'
import NumberTool from './NumberTool.vue'
import PayrollTool from './PayrollTool.vue'
import { compareText } from './code-tools'
import { browserLanguage, englishTools, translate, translateError } from './i18n'

function savedLanguage() {
  try {
    const value = localStorage.getItem('devkit:language')
    return value === 'zh' || value === 'en' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

const preference = ref(savedLanguage())
const detected = ref(browserLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]))
const language = computed(() => preference.value === 'auto' ? detected.value : preference.value)
const t = key => translate(language.value, key)
const toolName = tool => language.value === 'en' ? englishTools[tool.id]?.[0] ?? tool.name : tool.name
const toolDescription = tool => language.value === 'en' ? englishTools[tool.id]?.[1] ?? tool.description : tool.description
const toolCount = count => language.value === 'zh' ? `${count} 个工具` : `${count} ${count === 1 ? 'tool' : 'tools'}`

watchEffect(() => {
  document.documentElement.lang = language.value === 'zh' ? 'zh-CN' : 'en'
  document.title = `DevKit · ${t('开发者工具箱')}`
})

function changeLanguage(event) {
  preference.value = event.target.value
  try {
    if (preference.value === 'auto') localStorage.removeItem('devkit:language')
    else localStorage.setItem('devkit:language', preference.value)
  } catch {
    // Apply the selection for this page even if storage is disabled.
  }
}

function updateDetectedLanguage() {
  detected.value = browserLanguage(navigator.languages?.length ? navigator.languages : [navigator.language])
}

const icons = { BarChart3, Binary, Braces, Calculator, CaseSensitive, Clock3, Code2, Fingerprint, GitCompareArrows, Hash, KeyRound, Link2, ListFilter, MapPin, Palette, QrCode, Regex, Sheet }
const groups = [...new Set(tools.map(tool => tool.group))]
const current = ref(null)
const cronEditor = ref(null)
const numberTool = ref(null)
const category = ref('全部工具')
const favorites = ref(readFavorites())
const filters = ['全部工具', '我的收藏', ...groups]

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem('devkit:favorites') ?? '[]')
    return Array.isArray(saved) ? saved.filter(id => tools.some(tool => tool.id === id)) : []
  } catch {
    return []
  }
}

function toggleFavorite(id) {
  favorites.value = favorites.value.includes(id)
    ? favorites.value.filter(saved => saved !== id)
    : [...favorites.value, id]
  try {
    localStorage.setItem('devkit:favorites', JSON.stringify(favorites.value))
  } catch {
    // Keep favorites available in memory when storage is disabled.
  }
}
const query = ref('')
const searchBox = ref(null)
const inputBox = ref(null)
const menuOpen = ref(false)
const input = ref('')
const comparison = ref('')
const secondary = computed(() => current.value?.secondary)
const pairedEditors = computed(() => current.value?.comparison !== undefined || secondary.value?.multiline === true)
const output = ref('')
const file = ref(null)
const fileInput = ref(null)
const imageDetails = ref(null)
const imageOptions = ref({ quality: 75, dimension: 1920 })

function clearOutput() {
  if (imageDetails.value) URL.revokeObjectURL(output.value)
  imageDetails.value = null
  output.value = ''
}

function selectFile(event) {
  runId++
  clearOutput()
  error.value = ''
  file.value = event?.target.files?.[0] ?? null
  if (!event && fileInput.value) fileInput.value.value = ''
}

function formatSize(size) {
  const format = new Intl.NumberFormat(language.value, { maximumFractionDigits: 1 })
  if (size >= 1048576) return format.format(size / 1048576) + ' MiB'
  if (size >= 1024) return format.format(size / 1024) + ' KiB'
  return format.format(size) + ' B'
}
const error = ref('')
const pattern = ref('')
const flags = ref('g')
const copied = ref(false)
let runId = 0
let copyTimer
const shown = computed(() => tools.filter(tool => {
  const keyword = query.value.trim().toLowerCase()
  const inCategory = category.value === '我的收藏'
    ? favorites.value.includes(tool.id)
    : category.value === '全部工具' || tool.group === category.value
  return (keyword || inCategory) &&
    [tool.name, tool.label, tool.description, tool.group, t(tool.group), ...(englishTools[tool.id] ?? [])].some(value => value.toLowerCase().includes(keyword))
}))

function home(group = '全部工具') {
  runId++
  clearOutput()
  file.value = null
  current.value = null
  category.value = group
  query.value = ''
  menuOpen.value = false
}

function open(tool) {
  runId++
  clearTimeout(copyTimer)
  clearOutput()
  selectFile()
  current.value = tool
  imageOptions.value = { quality: 75, dimension: 1920 }
  input.value = comparison.value = error.value = pattern.value = query.value = ''
  flags.value = 'g'
  copied.value = false
  menuOpen.value = false
  window.scrollTo(0, 0)
}

function loadSample(action) {
  input.value = typeof action === 'string' ? current.value.samples[action] : current.value.sample
  comparison.value = current.value.comparison ?? secondary.value?.sample ?? ''
  pattern.value = current.value.pattern ?? ''
}

async function run(action) {
  const id = ++runId
  clearTimeout(copyTimer)
  clearOutput()
  error.value = ''
  copied.value = false
  try {
    const tool = current.value
    let result
    if (tool.file) {
      if (!file.value) throw new Error('请先选择文件。')
      result = await tool.run(file.value, action, { ...imageOptions.value }, language.value)
    } else if (tool.comparison !== undefined) {
      result = compareText(input.value, comparison.value)
    } else if (tool.secondary) {
      result = await tool.run(input.value, comparison.value, language.value, action)
    } else if (tool.pattern !== undefined) {
      result = await tool.run(input.value, pattern.value, flags.value, language.value)
    } else {
      result = await tool.run(input.value, action, language.value)
    }
    if (id !== runId) return
    if (result?.blob instanceof Blob) {
      output.value = URL.createObjectURL(result.blob)
      imageDetails.value = result
    } else {
      output.value = result
    }
  } catch (cause) {
    if (id === runId) error.value = cause.message
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 1600)
  } catch {
    error.value = '无法写入剪贴板，可直接选中结果复制。'
  }
}

function keys(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchBox.value?.focus()
    searchBox.value?.select()
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && current.value) {
    event.preventDefault()
    if (cronEditor.value) cronEditor.value.preview()
    else if (numberTool.value) numberTool.value.calculate()
    else run(current.value.actions[0])
  }
  if (event.key === 'Escape') {
    query.value = ''
    menuOpen.value = false
    searchBox.value?.blur()
  }
}

async function openFirst() {
  if (!query.value.trim() || !shown.value.length) return
  open(shown.value[0])
  await nextTick()
  inputBox.value?.focus()
}

onMounted(() => {
  window.addEventListener('keydown', keys)
  window.addEventListener('languagechange', updateDetectedLanguage)
})
onUnmounted(() => {
  window.removeEventListener('keydown', keys)
  window.removeEventListener('languagechange', updateDetectedLanguage)
  clearTimeout(copyTimer)
  clearOutput()
})
</script>

<template>
  <div class="shell">
    <button v-if="menuOpen" class="scrim" :aria-label="t('关闭菜单')" @click="menuOpen = false"></button>
    <aside class="sidebar" :class="{ expanded: menuOpen }">
      <button class="brand" @click="home()"><span class="logo"><Terminal :size="23" /></span><span>DevKit<small>DEVELOPER TOOLBOX</small></span></button>
      <div class="side-content">
        <button class="nav-link" :class="{ selected: !current && category === '全部工具' }" @click="home()"><LayoutGrid :size="16" /> {{ t('全部工具') }}</button>
        <button class="nav-link" :class="{ selected: !current && category === '我的收藏' }" @click="home('我的收藏')"><Star :size="16" /> {{ t('我的收藏') }}</button>
        <div v-for="group in groups" :key="group" class="nav-group">
          <button class="nav-heading" @click="home(group)">{{ t(group) }}</button>
          <button v-for="tool in tools.filter(item => item.group === group)" :key="tool.id" class="nav-link"
            :class="{ selected: current?.id === tool.id }" @click="open(tool)">
            <component :is="icons[tool.icon]" :size="16" /> {{ toolName(tool) }}
          </button>
        </div>
      </div>
      <div class="side-footer"><ShieldCheck :size="15" /> {{ t('浏览器本地运行') }}</div>
    </aside>

    <div class="page">
      <header class="topbar">
        <button class="mobile-menu icon-button" :aria-label="t('展开菜单')" @click="menuOpen = !menuOpen"><Menu :size="21" /></button>
        <div class="breadcrumb"><Terminal :size="16" /><span>{{ t('工作台') }}</span><ChevronRight :size="13" /><strong>{{ current ? toolName(current) : t(category) }}</strong></div>
        <div class="search-wrap">
          <label class="search"><Search :size="16" /><input ref="searchBox" v-model="query" :placeholder="t('搜索工具…')" :aria-label="t('搜索工具')" @keydown.enter.prevent="openFirst"><kbd><Command :size="11" /> K</kbd></label>
          <div v-if="query.trim()" class="suggestions">
            <button v-for="tool in shown" :key="tool.id" @click="open(tool)"><component :is="icons[tool.icon]" :size="16" />{{ toolName(tool) }}<ArrowUpRight :size="14" /></button>
            <p v-if="!shown.length">{{ t('没有匹配的工具') }}</p>
          </div>
        </div>
        <label class="language-control">
          <Globe2 :size="16" aria-hidden="true" />
          <select :value="preference" :aria-label="t('语言')" @change="changeLanguage">
            <option value="auto">{{ t('跟随浏览器') }}</option>
            <option value="zh" lang="zh-CN">简体中文</option>
            <option value="en" lang="en">English</option>
          </select>
        </label>
      </header>

      <main class="content">
        <template v-if="!current">
          <section class="hero">
            <div class="hero-copy">
              <h1>{{ t('开发者') }}<span>{{ t('工具箱') }}</span><i></i></h1>
              <p>{{ t('格式化、转换、生成与校验。把常用操作放进一个工作台。') }}</p>
              <button class="primary" @click="open(tools[0])"><Zap :size="16" /> {{ t('打开 JSON 工具') }} <ArrowRight :size="15" /></button>
            </div>
            <div class="terminal-art" aria-hidden="true">
              <div class="terminal-top"><span></span><span></span><span></span><b>devkit ~</b></div>
              <div class="terminal-code"><div><em>❯</em> devkit <strong>--list</strong></div><div class="code-offset"><span>✓</span> format</div><div class="code-offset"><span>✓</span> encode</div><div class="code-offset"><span>✓</span> generate</div><div><em>❯</em> <i></i></div></div>
            </div>
          </section>

          <section class="catalog">
            <div class="section-head"><h2>{{ t(query.trim() ? '搜索结果' : category) }}</h2><span>{{ toolCount(shown.length) }}</span></div>
            <div class="filters" :aria-label="t('工具分类')">
              <button v-for="group in filters" :key="group" :class="{ active: category === group }" @click="home(group)">{{ t(group) }}</button>
            </div>
            <div v-if="shown.length" class="cards">
              <article v-for="tool in shown" :key="tool.id" class="card">
                <button class="card-open" @click="open(tool)">
                <div class="card-top"><span class="tool-icon" :class="tool.hue"><component :is="icons[tool.icon]" :size="21" /></span><ArrowUpRight :size="17" class="card-arrow" /></div>
                <h3>{{ toolName(tool) }}</h3><p>{{ toolDescription(tool) }}</p><span class="card-label">{{ tool.label }}</span>
                </button>
                <button class="favorite" :class="{ starred: favorites.includes(tool.id) }"
                  :aria-label="t(favorites.includes(tool.id) ? '取消收藏' : '收藏') + ' ' + toolName(tool)"
                  :aria-pressed="favorites.includes(tool.id)" @click="toggleFavorite(tool.id)"><Star :size="17" /></button>
              </article>
            </div>
            <p v-else class="empty">{{ t(!query.trim() && category === '我的收藏' ? '点击工具卡片上的星标即可收藏。' : '没有找到匹配的工具。') }}</p>
          </section>
        </template>

        <section v-else class="workspace">
          <button class="back" @click="home(category)"><ArrowLeft :size="16" /> {{ t('返回工具列表') }}</button>
          <div class="workspace-title"><span class="tool-icon" :class="current.hue"><component :is="icons[current.icon]" :size="26" /></span><div><h1>{{ toolName(current) }}</h1><p>{{ toolDescription(current) }}</p></div>
            <button class="secondary workspace-favorite" :class="{ starred: favorites.includes(current.id) }"
              :aria-pressed="favorites.includes(current.id)" @click="toggleFavorite(current.id)">
              <Star :size="16" /> {{ t(favorites.includes(current.id) ? '已收藏' : '收藏') }}
            </button>
          </div>
          <CronEditor v-if="current.id === 'cron'" ref="cronEditor" :language="language" />
          <PayrollTool v-else-if="current.id === 'payroll-cn'" ref="numberTool" :tool="current" :language="language" />
          <NumberTool v-else-if="current.form" :key="current.id" ref="numberTool" :tool="current" :language="language" />
          <template v-else>
            <div v-if="current.pattern !== undefined" class="regex-options">
              <label>{{ t('表达式') }}<input v-model="pattern" placeholder="\d+" spellcheck="false"></label>
              <label>{{ t('标志') }}<input v-model="flags" placeholder="g" spellcheck="false"></label>
            </div>
            <label v-if="secondary && !secondary.multiline" class="secondary-field">
              {{ t(secondary.label) }}
              <input v-model="comparison" :type="secondary.secret ? 'password' : 'text'" autocomplete="off" spellcheck="false">
            </label>
            <div v-if="current.imageOptions" class="image-settings">
              <label class="secondary-field">
                {{ t('图片质量（1–100）') }}
                <input v-model.number="imageOptions.quality" type="number" min="1" max="100">
              </label>
              <label class="secondary-field">
                {{ t('最长边（像素）') }}
                <input v-model.number="imageOptions.dimension" type="number" min="1" max="4096">
              </label>
            </div>
            <div class="editors">
              <div class="editor">
                <div class="editor-header">
                  <label :for="current.file ? 'tool-file' : 'tool-input'">{{ t(pairedEditors ? (secondary?.multiline ? '原始 JSON' : '原始文本') : '输入') }}</label>
                  <button v-if="!current.file" class="subtle" @click="loadSample()">{{ t('载入示例') }}</button>
                  <button v-if="current.samples" class="subtle" @click="loadSample('Properties 转 YAML')">{{ t('Properties 示例') }}</button>
                  <button class="subtle" @click="current.file ? selectFile() : input = ''"><X :size="13" /> {{ t('清空') }}</button>
                </div>
                <div v-if="current.file" class="file-select">
                  <label class="secondary" for="tool-file">{{ t('选择本地文件') }}</label>
                  <input id="tool-file" ref="fileInput" type="file" :accept="current.accept" @change="selectFile">
                  <p v-if="file" class="file-name">{{ file.name }} · {{ formatSize(file.size) }}</p>
                  <p v-else>{{ t('文件仅在当前浏览器处理。') }}</p>
                </div>
                <textarea v-else id="tool-input" ref="inputBox" v-model="input" spellcheck="false" :placeholder="t(current.placeholder ?? '在此粘贴内容…')"></textarea>
              </div>
              <div v-if="pairedEditors" class="editor">
                <div class="editor-header"><label for="tool-comparison">{{ t(secondary?.label ?? '修改后文本') }}</label><button class="subtle" @click="comparison = ''"><X :size="13" /> {{ t('清空') }}</button></div>
                <textarea id="tool-comparison" v-model="comparison" spellcheck="false" :placeholder="t('在此粘贴修改后的内容…')"></textarea>
              </div>
              <div class="editor" :class="{ 'comparison-output': pairedEditors }">
                <div class="editor-header"><label for="tool-output">{{ t('结果') }}</label><span v-if="current.id === 'color' && output" class="swatch" :style="{ backgroundColor: output }"></span><a v-if="current.image && output" class="subtle" :href="output" :download="imageDetails?.name ?? 'devkit-qrcode.png'"><Download :size="14" /> {{ t(imageDetails ? '下载图片' : '下载 PNG') }}</a><button v-if="!current.image" class="subtle" :disabled="!output" @click="copy"><component :is="copied ? Check : Copy" :size="14" /> {{ t(copied ? '已复制' : '复制') }}</button></div>
                <div v-if="current.image" id="tool-output" class="image-output">
                  <template v-if="output">
                    <img :src="output" :alt="t(current.imageOptions ? '压缩后的图片' : '生成的二维码')">
                    <div v-if="imageDetails" class="image-details">
                      <span>{{ imageDetails.width }} × {{ imageDetails.height }} px</span>
                      <span>{{ formatSize(imageDetails.originalSize) }} → {{ formatSize(imageDetails.blob.size) }}</span>
                      <span v-if="imageDetails.blob.size >= imageDetails.originalSize">{{ t('当前设置未减小文件体积。') }}</span>
                    </div>
                </template>
                <span v-else>{{ t(current.imageOptions ? '压缩后在这里预览图片' : '生成后在这里预览二维码') }}</span>
              </div>
              <textarea v-else id="tool-output" :value="output" :placeholder="t('运行后在这里显示结果')" readonly spellcheck="false"></textarea>
            </div>
          </div>
          <p v-if="error" class="error" role="alert">{{ translateError(language, error) }}</p>
          <div class="actions"><button v-for="(action, index) in current.actions" :key="action" :class="index === 0 ? 'primary' : 'secondary'" @click="run(action)">{{ t(action) }}</button></div>
          </template>
        </section>
      </main>
    </div>
  </div>
</template>
