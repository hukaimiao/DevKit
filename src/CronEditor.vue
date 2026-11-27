<script setup>
import { computed, ref } from 'vue'
import { Check, Copy } from 'lucide-vue-next'
import { inferSchedule, makeCron, nextCronRuns, parseCron, scheduleFields } from './cron'
import { makeQuartz, nextQuartzRuns, parseQuartz, quartzWeekdays } from './quartz'
import { translate, translateError } from './i18n'

const props = defineProps({ language: { type: String, required: true } })
const t = key => translate(props.language, key)

const dialect = ref('linux')
const quartz = computed(() => dialect.value === 'quartz')
const mode = ref('daily')
const drafts = new Map()
const ordinal = ref(1)
const nthDay = ref(1)
const year = ref('')
const time = ref('09:00:00')
const monthDay = ref(1)
const interval = ref(15)
const weekdays = ref([1])
const expression = ref('0 9 * * *')
const fields = ref(parseCron(expression.value).fields)
const timeZone = ref('UTC')
const start = ref('')
const dates = ref([])
const previewed = ref(false)
const resultZone = ref('UTC')
const error = ref('')
const copied = ref(false)

const years = Array.from({ length: 130 }, (_, index) => 1970 + index)
const dayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const zones = [...new Set(['UTC', Intl.DateTimeFormat().resolvedOptions().timeZone,
  'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles',
  ...(Intl.supportedValuesOf?.('timeZone') ?? [])].filter(Boolean))]
const modes = { daily: '每天', weekly: '每周', monthly: '每月', interval: '分钟间隔', custom: '自定义字段' }
const labels = { second: '秒', minute: '分钟', hour: '小时', day: '每月日期', month: '月份', weekday: '星期' }
const activeFields = computed(() => Object.keys(labels).filter(key => key !== 'second' || quartz.value))
const availableModes = computed(() => quartz.value
  ? { ...modes, last: '每月最后一天', nth: '每月第几个星期几' }
  : modes)
const formatter = computed(() => new Intl.DateTimeFormat(props.language, {
  timeZone: resultZone.value, dateStyle: 'medium', timeStyle: 'long', hourCycle: 'h23',
}))

function clearResult() {
  dates.value = []
  previewed.value = false
  error.value = ''
  copied.value = false
}

function attempt(operation) {
  clearResult()
  try {
    operation()
  } catch (cause) {
    error.value = cause.message
  }
}

function parseDialect(text) {
  if (quartz.value) return parseQuartz(text)
  const parsed = parseCron(text)
  if (parsed.hasSeconds) throw new Error('Linux Cron 需要五段表达式。')
  if (/[?#]/.test(parsed.expression) || /[LW]/i.test(parsed.fields.day) || /L(?:,|$)/i.test(parsed.fields.weekday)) {
    throw new Error('这些日期或星期符号需要使用 Quartz 模式。')
  }
  return parsed
}

function apply(parsed) {
  const { fields: parsedFields } = parsed
  let schedule
  if (quartz.value) {
    const weekday = parsedFields.weekday
    const numeric = /^(?:[1-7](?:,[1-7])*|(?:SUN|MON|TUE|WED|THU|FRI|SAT)(?:,(?:SUN|MON|TUE|WED|THU|FRI|SAT))*)$/
    const weekdayValue = text => /^\d$/.test(text) ? Number(text) - 1 : quartzWeekdays.indexOf(text)
    const simpleWeekday = weekday === '?' || weekday === '*' ? '*' :
      numeric.test(weekday) ? weekday.split(',').map(weekdayValue).join(',') : weekday
    schedule = inferSchedule({ ...parsed, fields: {
      ...parsedFields, day: parsedFields.day === '?' ? '*' : parsedFields.day, weekday: simpleWeekday,
    } })
    const fixedTime = [parsedFields.hour, parsedFields.minute, parsedFields.second].every(part => /^\d{1,2}$/.test(part))
    const nth = /^(SUN|MON|TUE|WED|THU|FRI|SAT|[1-7])#([1-5])$/.exec(weekday)
    if (parsedFields.month === '*' && fixedTime && (parsedFields.day === 'L' || nth)) {
      schedule.mode = nth ? 'nth' : 'last'
      schedule.time = [parsedFields.hour, parsedFields.minute, parsedFields.second].map(part => part.padStart(2, '0')).join(':')
      if (nth) {
        ordinal.value = Number(nth[2])
        nthDay.value = weekdayValue(nth[1])
      }
    }
  } else {
    schedule = inferSchedule(parsed)
  }
  fields.value = parsedFields
  year.value = parsedFields.year ?? ''
  mode.value = schedule.mode
  time.value = schedule.time
  interval.value = schedule.interval
  weekdays.value = schedule.weekdays
  monthDay.value = schedule.monthDay
  expression.value = parsed.expression
}

function switchDialect(event) {
  drafts.set(dialect.value, {
    mode: mode.value, time: time.value, monthDay: monthDay.value, interval: interval.value,
    weekdays: [...weekdays.value], expression: expression.value, fields: { ...fields.value },
    year: year.value, ordinal: ordinal.value, nthDay: nthDay.value,
  })
  dialect.value = event.target.value
  clearResult()
  const existing = drafts.get(dialect.value)
  if (existing) {
    const controls = { mode, time, monthDay, interval, weekdays, expression, fields, year, ordinal, nthDay }
    for (const [key, value] of Object.entries(existing)) controls[key].value = value
  } else {
    apply(parseDialect(quartz.value ? '0 0 9 * * ?' : '0 9 * * *'))
  }
}

function parseExpression() {
  attempt(() => apply(parseDialect(expression.value)))
}

function generate() {
  attempt(() => {
    const selected = mode.value === 'custom' ? fields.value : scheduleFields({
      mode: mode.value, time: time.value, interval: interval.value, monthDay: monthDay.value, weekdays: weekdays.value,
    })
    if (quartz.value) {
      const quartzFields = { ...selected, year: year.value }
      if (mode.value !== 'custom') {
        quartzFields.weekday = '?'
        if (mode.value === 'weekly' || mode.value === 'nth') {
          quartzFields.day = '?'
          quartzFields.weekday = mode.value === 'weekly'
            ? [...weekdays.value].sort().map(day => day + 1).join(',')
            : `${nthDay.value + 1}#${ordinal.value}`
        } else if (mode.value === 'last') {
          quartzFields.day = 'L'
        }
      }
      expression.value = makeQuartz(quartzFields)
      fields.value = quartzFields
    } else {
      expression.value = parseDialect(makeCron(selected, false)).expression
      fields.value = selected
    }
  })
}

function changeMode() {
  clearResult()
  if (mode.value !== 'custom') return
  // Start with the current expression when moving into advanced editing.
  try {
    fields.value = parseDialect(expression.value).fields
  } catch {
    // Keep the last valid fields while the expression is being edited.
  }
}

function preview() {
  attempt(() => {
    resultZone.value = timeZone.value
    const parsed = parseDialect(expression.value)
    dates.value = (quartz.value ? nextQuartzRuns : nextCronRuns)(parsed.expression, timeZone.value, start.value)
    previewed.value = true
  })
}

async function copyExpression() {
  const value = expression.value
  error.value = ''
  try {
    await navigator.clipboard.writeText(value)
    if (expression.value === value) copied.value = true
  } catch {
    error.value = '无法写入剪贴板，可直接选中结果复制。'
  }
}

defineExpose({ preview })
</script>

<template>
  <div class="cron-workspace">
    <section class="cron-panel" aria-labelledby="cron-builder-title" @input="clearResult">
      <h2 id="cron-builder-title">{{ t('时间选择') }}</h2>
      <div class="cron-grid">
        <label>{{ t('计划类型') }}
          <select v-model="mode" @change="changeMode">
            <option v-for="(label, value) in availableModes" :key="value" :value="value">{{ t(label) }}</option>
          </select>
        </label>
        <label>{{ t('Cron 类型') }}
          <select :value="dialect" @change="switchDialect">
            <option value="linux">Linux Cron</option>
            <option value="quartz">Quartz</option>
          </select>
        </label>
        <label v-if="mode === 'interval'">{{ t('每隔几分钟') }}
          <input v-model.number="interval" type="number" min="1" max="59">
        </label>
        <label v-else-if="mode !== 'custom'">{{ t('执行时间') }}
          <input v-model="time" type="time" :step="quartz ? 1 : 60">
        </label>
        <label v-if="mode === 'monthly'">{{ t('每月日期') }}
          <input v-model.number="monthDay" type="number" min="1" max="31">
        </label>
      </div>
      <div v-if="quartz" class="cron-grid">
        <label>{{ t('年份（可选）') }}
          <input v-model="year" placeholder="2028" list="cron-year-options" spellcheck="false">
          <datalist id="cron-year-options">
            <option v-for="value in years" :key="value" :value="value" />
          </datalist>
        </label>
        <label v-if="mode === 'nth'">{{ t('第几次') }}
          <select v-model.number="ordinal"><option v-for="number in 5" :key="number" :value="number">{{ number }}</option></select>
        </label>
        <label v-if="mode === 'nth'">{{ t('星期') }}
          <select v-model.number="nthDay"><option v-for="(day, index) in dayNames" :key="day" :value="index">{{ t(day) }}</option></select>
        </label>
      </div>
      <p v-if="quartz" class="cron-help">{{ t('Quartz 年份留空表示不限。日期和星期字段须有一个为 ?，星期从 1（周日）到 7（周六）。') }}</p>
      <fieldset v-if="mode === 'weekly'" class="cron-weekdays">
        <legend>{{ t('星期') }}</legend>
        <label v-for="(day, index) in dayNames" :key="day">
          <input v-model="weekdays" type="checkbox" :value="index">{{ t(day) }}
        </label>
      </fieldset>
      <div v-if="mode === 'custom'" class="cron-grid cron-fields">
        <label v-for="key in activeFields" :key="key">{{ t(labels[key]) }}
          <input v-model="fields[key]" spellcheck="false" placeholder="*">
        </label>
      </div>
      <p v-if="mode === 'custom'" class="cron-help">{{ t('字段支持列表、范围和步长，例如 1,3、1-5、*/15。') }}</p>
      <button class="primary" @click="generate">{{ t('生成表达式') }}</button>
    </section>

    <section class="cron-panel" aria-labelledby="cron-expression-title">
      <h2 id="cron-expression-title"><label for="cron-expression">{{ t('Cron 表达式') }}</label></h2>
      <input id="cron-expression" v-model="expression" class="cron-expression" spellcheck="false"
        :placeholder="quartz ? '0 30 9 ? * 6#3 2028' : '0 9 * * 1-5'" @input="clearResult" @keydown.enter.exact.prevent="parseExpression">
      <div class="cron-buttons">
        <button class="secondary" @click="parseExpression">{{ t('反解析到时间选择') }}</button>
        <button class="secondary" :disabled="!expression.trim()" @click="copyExpression">
          <component :is="copied ? Check : Copy" :size="15" />{{ t(copied ? '已复制' : '复制') }}
        </button>
      </div>
    </section>

    <section class="cron-panel" aria-labelledby="cron-preview-title">
      <h2 id="cron-preview-title">{{ t('执行预览') }}</h2>
      <div class="cron-grid">
        <label>{{ t('预览时区') }}
          <select v-model="timeZone" @change="clearResult">
            <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
          </select>
        </label>
        <label>{{ t('起算时间') }}
          <input v-model="start" type="datetime-local" @input="clearResult">
        </label>
      </div>
      <p class="cron-help">{{ t('起算时间按所选时区解释，留空则从现在开始。') }}</p>
      <button class="primary" @click="preview">{{ t('预览接下来 10 次') }}</button>
      <ol v-if="dates.length" class="cron-dates" aria-live="polite">
        <li v-for="date in dates" :key="date.toISOString()">
          <time :datetime="date.toISOString()">{{ formatter.format(date) }}</time>
          <span v-if="resultZone !== 'UTC'">{{ date.toISOString() }}</span>
        </li>
      </ol>
      <p v-else-if="previewed" class="cron-help" role="status">{{ t('所选起算时间之后没有匹配的执行时间。') }}</p>
    </section>
    <p v-if="error" class="error" role="alert">{{ translateError(language, error) }}</p>
  </div>
</template>
