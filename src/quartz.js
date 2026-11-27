import { CronDate, CronExpressionParser } from 'cron-parser'

const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
export const quartzWeekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const keys = ['second', 'minute', 'hour', 'day', 'month', 'weekday', 'year']

function fieldError(field) {
  throw new Error('Invalid Quartz field: ' + field)
}

function values(field, min, max, names = []) {
  const parseValue = text => {
    if (names.includes(text)) return names.indexOf(text) + min
    if (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max) fieldError(field)
    return Number(text)
  }
  const found = new Set()
  for (const part of field.split(',')) {
    const match = /^([A-Z]+|\d+|\*)(?:-([A-Z]+|\d+))?(?:\/(\d+))?$/.exec(part)
    if (!match) fieldError(field)
    const [, first, last, stepText] = match
    const step = Number(stepText ?? 1)
    if (step < 1 || step > max - min + 1 || (first === '*' && last)) fieldError(field)
    const from = first === '*' ? min : parseValue(first)
    const to = last ? parseValue(last) : first === '*' || stepText ? max : from
    if (min === 1970 && from > to) fieldError(field)
    const span = max - min + 1
    for (let index = 0; index <= (to - from + span) % span; index += step) {
      found.add(min + (from - min + index) % span)
    }
  }
  return [...found].sort((a, b) => a - b)
}

function nearestWeekday(date, year, month, last) {
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay()
  if (weekday === 6) return date === 1 ? 3 : date - 1
  if (weekday === 0) return date === last ? date - 2 : date + 1
  return date
}

function dayMatch(day, weekday) {
  if (day === '?') {
    const special = /^(SUN|MON|TUE|WED|THU|FRI|SAT|[1-7])(?:#([1-5])|(L))$/.exec(weekday)
    if (special) {
      const wanted = values(special[1], 1, 7, quartzWeekdays)[0]
      return (year, month, date, last, actual) => actual === wanted &&
        (special[3] ? date + 7 > last : Math.ceil(date / 7) === Number(special[2]))
    }
    const allowed = new Set(values(weekday === 'L' ? '7' : weekday, 1, 7, quartzWeekdays))
    return (year, month, date, last, actual) => allowed.has(actual)
  }
  const final = /^L(?:-(\d{1,2}))?(W)?$/.exec(day)
  if (final) {
    const offset = Number(final[1] ?? 0)
    if (offset > 30) fieldError(day)
    return (year, month, date, last) => last > offset && date ===
      (final[2] ? nearestWeekday(last - offset, year, month, last) : last - offset)
  }
  const nearby = /^(\d{1,2})W$/.exec(day)
  if (nearby) {
    const target = values(nearby[1], 1, 31)[0]
    return (year, month, date, last) => target <= last && date === nearestWeekday(target, year, month, last)
  }
  const allowed = new Set(values(day, 1, 31))
  return (year, month, date) => allowed.has(date)
}

export function parseQuartz(input) {
  const parts = input.trim().toUpperCase().split(/\s+/)
  if (parts.length !== 6 && parts.length !== 7) throw new Error('Quartz 需要六段或七段表达式。')
  const fields = Object.fromEntries(keys.map((key, index) => [key, parts[index] ?? '']))
  const { second, minute, hour, day, month, weekday, year } = fields
  if ((day === '?') === (weekday === '?')) throw new Error('Quartz 的日期和星期字段必须恰有一个为 ?。')
  return {
    fields, expression: parts.join(' '), hasSeconds: true,
    seconds: values(second, 0, 59), minutes: values(minute, 0, 59), hours: values(hour, 0, 23),
    months: values(month, 1, 12, monthNames), years: values(year || '*', 1970, 2099), matchesDay: dayMatch(day, weekday),
  }
}

export function makeQuartz(fields) {
  const parts = keys.slice(0, fields.year.trim() ? 7 : 6).map(key => fields[key].trim())
  if (parts.some(part => !part || /\s/.test(part))) throw new Error('每个 Cron 字段必须是一个非空值。')
  return parseQuartz(parts.join(' ')).expression
}

export function nextQuartzRuns(expression, tz, start) {
  const { hours, minutes, seconds, months, years, matchesDay } = parseQuartz(expression)
  const current = new CronDate(start || undefined, tz)
  const currentMs = current.getTime()
  const currentYear = current.getFullYear()
  const currentMonth = current.getMonth() + 1
  const currentDay = current.getDate()
  const times = [seconds, minutes, hours].map(parts => parts.join(',')).join(' ')
  const allowedHours = new Set(hours)
  const dates = []
  for (const year of years) {
    if (year < currentYear) continue
    for (const month of months) {
      if (year === currentYear && month < currentMonth) continue
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const first = year === currentYear && month === currentMonth ? currentDay : 1
      for (let date = first; date <= last; date++) {
        const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 1
        if (!matchesDay(year, month, date, last, weekday)) continue
        const day = new CronDate(`${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}T00:00:00`, tz)
        if (day.getDate() !== date) continue
        const end = new CronDate(day.toDate(), tz)
        end.setEndOfDay()
        const after = Math.max(currentMs, day.getTime() - 1)
        if (after >= end.getTime()) continue
        const cursor = CronExpressionParser.parse(`${times} ${date} ${month} *`, { tz, currentDate: after, endDate: end.toDate() })
        while (cursor.hasNext() && dates.length < 10) {
          const next = cursor.next()
          if (allowedHours.has(next.getHours())) dates.push(next.toDate())
        }
        if (dates.length === 10) return dates
      }
    }
  }
  return dates
}
