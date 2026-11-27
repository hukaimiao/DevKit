import { CronExpressionParser } from 'cron-parser'

const aliases = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

export function parseCron(input) {
  const text = input.trim()
  const parts = (Object.hasOwn(aliases, text.toLowerCase()) ? aliases[text.toLowerCase()] : text).split(/\s+/)
  if (![5, 6].includes(parts.length)) throw new Error('请输入五段或六段 Cron 表达式。')
  const hasSeconds = parts.length === 6
  const [second, minute, hour, day, month, weekday] = hasSeconds ? parts : ['0', ...parts]
  const expression = parts.join(' ')
  CronExpressionParser.parse(expression)
  return { fields: { second, minute, hour, day, month, weekday }, hasSeconds, expression }
}

export function makeCron(fields, hasSeconds) {
  const parts = [fields.minute, fields.hour, fields.day, fields.month, fields.weekday]
  if (hasSeconds) parts.unshift(fields.second)
  if (parts.some(part => !part.trim() || /\s/.test(part.trim()))) throw new Error('每个 Cron 字段必须是一个非空值。')
  return parseCron(parts.map(part => part.trim()).join(' ')).expression
}

export function inferSchedule({ fields, hasSeconds }) {
  const { second, minute, hour, day, month, weekday } = fields
  const custom = { mode: 'custom', time: '09:00:00', interval: 15, monthDay: 1, weekdays: [1] }
  const number = /^\d{1,2}$/
  if (month !== '*' || !number.test(second)) return custom
  const step = /^\*\/(\d+)$/.exec(minute)
  if (step && Number(step[1]) >= 1 && Number(step[1]) <= 59 &&
    Number(second) === 0 && hour === '*' && day === '*' && weekday === '*') {
    return { ...custom, mode: 'interval', interval: Number(step[1]) }
  }
  if (!(number.test(minute) && number.test(hour))) return custom
  const time = [hour, minute, hasSeconds ? second : '0'].map(part => part.padStart(2, '0')).join(':')
  if (day === '*' && weekday === '*') return { ...custom, mode: 'daily', time }
  if (day === '*' && /^[0-7](?:,[0-7])*$/.test(weekday)) {
    return { ...custom, mode: 'weekly', time, weekdays: [...new Set(weekday.split(',').map(part => Number(part) % 7))].sort() }
  }
  if (weekday === '*' && number.test(day)) return { ...custom, mode: 'monthly', time, monthDay: Number(day) }
  return custom
}

export function scheduleFields({ mode, time, interval, monthDay, weekdays }) {
  const fields = { second: '0', minute: '*', hour: '*', day: '*', month: '*', weekday: '*' }
  if (mode === 'interval') {
    if (!Number.isInteger(interval) || interval < 1 || interval > 59) throw new Error('间隔必须是 1–59 分钟。')
    return { ...fields, minute: `*/${interval}` }
  }
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) throw new Error('请选择有效的执行时间。')
  const [hour, minute, second = '00'] = time.split(':').map(part => String(Number(part)))
  Object.assign(fields, { hour, minute, second })
  if (mode === 'weekly') {
    if (!weekdays.length) throw new Error('请至少选择一个星期几。')
    fields.weekday = [...weekdays].sort().join(',')
  }
  if (mode === 'monthly') {
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) throw new Error('日期必须在 1–31 之间。')
    fields.day = String(monthDay)
  }
  return fields
}

export function nextCronRuns(expression, tz, currentDate) {
  const parsed = parseCron(expression)
  // Unlike take(), next() surfaces schedules with no matching occurrence.
  const cursor = CronExpressionParser.parse(parsed.expression, { tz, currentDate: currentDate || undefined })
  const dates = []
  for (let index = 0; index < 10; index++) {
    try {
      dates.push(cursor.next().toDate())
    } catch (error) {
      if (!dates.length) throw error
      break
    }
  }
  return dates
}
