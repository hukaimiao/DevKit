import { taxBands } from './life-tools.js'

export const payrollYear = 2026
export const payrollSources = [
  ['工资预扣政策', 'https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194838/content.html'],
  ['年终奖政策', 'https://fgk.chinatax.gov.cn/zcfgk/c102416/c5211524/content.html'],
]
export const cities = {
  beijing: {
    label: '北京',
    fundMaxRate: 12,
    medicalSurcharge: 3,
    periods: [
      { social: [7162, 35811], fund: [2540, 35811] },
      { social: [7270, 36348], fund: [2540, 36348] },
    ],
    sources: [
      ['上半年社保', 'https://rsj.beijing.gov.cn/bm/ywml/202611/t20261106_4935571.html'],
      ['下半年社保', 'https://www.beijing.gov.cn/zhengce/zhengcefagui/202608/t20260821_4831679.html'],
      ['个人社保费率', 'https://sw.beijing.gov.cn/zwxx/swxx/202605/P020260512520283489932.pdf'],
      ['上半年公积金', 'https://gjj.beijing.gov.cn/web/zwgk61/2024zcjd/743765478/'],
      ['下半年公积金', 'https://gjj.beijing.gov.cn/web/zwgk61/2024zcwj/436433461/744103382/index.html'],
    ],
  },
  shanghai: {
    label: '上海',
    fundMaxRate: 7,
    medicalSurcharge: 0,
    periods: [
      { social: [7460, 37302], fund: [2690, 37302] },
      { social: [7546, 37731], fund: [2740, 37731] },
    ],
    sources: [
      ['上半年社保', 'https://rsj.sh.gov.cn/tgsgg_17341/20250918/t0035_1435637.html'],
      ['下半年社保', 'https://shanghai.chinatax.gov.cn/bsfw/nszx/hdfk/202609/t481435.html'],
      ['个人社保费率', 'https://www.shanghai.gov.cn/nw17239/20260913/37398bbb63ad4fffa64e0b9deb0f6afc.html'],
      ['上半年公积金', 'https://www.shzfgjj.cn/html/newxxgk/zcwj/gfxwj/228051.html'],
      ['下半年公积金', 'https://www.shanghai.gov.cn/gwk/affairs/content/0064%40f3d788ec72e9404ebcbf3d27fda98435'],
    ],
  },
}

export const initialPayroll = {
  city: 'shanghai', salary: 15000, deductions: 1000, bonus: 30000, bonusMonth: 12,
  socialBase: '', fundBase: '', fundRate: 7, manualSocial: 1500, manualFund: 1000,
}
const bonusDeductions = [0, 210, 1410, 2660, 4410, 7160, 15160]
const toCents = yuan => Math.round(yuan * 100)
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0)

function contribution(input, city, month) {
  if (!city) {
    const social = toCents(input.manualSocial)
    const fund = toCents(input.manualFund)
    return { social, fund, total: social + fund }
  }
  const period = city.periods[month <= 6 ? 0 : 1]
  const clamp = (value, [min, max]) => Math.max(min, Math.min(max, value))
  const socialBase = clamp(input.socialBase === '' ? input.salary : input.socialBase, period.social)
  const fundBase = clamp(input.fundBase === '' ? input.salary : input.fundBase, period.fund)
  const base = toCents(socialBase)
  const pension = Math.round(base * 0.08)
  const medical = Math.round(base * 0.02) + toCents(city.medicalSurcharge)
  const unemployment = Math.round(base * 0.005)
  const fund = Math.round(fundBase * input.fundRate / 100) * 100
  const social = pension + medical + unemployment
  return { pension, medical, unemployment, fund, social, socialBase, fundBase, total: social + fund }
}

function taxOn(taxable) {
  const [, rate, quickDeduction] = taxBands.find(([limit]) => taxable <= toCents(limit))
  return Math.max(0, Math.round(taxable * rate / 100) - toCents(quickDeduction))
}

function separateBonusTax(bonus) {
  // The monthly bracket thresholds multiplied by 12 equal the annual thresholds.
  const index = taxBands.findIndex(([limit]) => bonus <= toCents(limit))
  return Math.max(0, Math.round(bonus * taxBands[index][1] / 100) - toCents(bonusDeductions[index]))
}

function validAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9
}

export function annualPayroll(input) {
  const city = Object.hasOwn(cities, input.city) ? cities[input.city] : null
  const amounts = [input.salary, input.deductions, input.bonus]
  if (!city) amounts.push(input.manualSocial, input.manualFund)
  else amounts.push(...[input.socialBase, input.fundBase].filter(value => value !== ''))
  if (!amounts.every(validAmount)) throw new Error('请输入有效的非负金额（最多 10 亿元）。')
  if (!Number.isInteger(input.bonusMonth) || input.bonusMonth < 1 || input.bonusMonth > 12) throw new Error('请选择 1–12 月。')
  if (city && (!Number.isInteger(input.fundRate) || input.fundRate < 5 || input.fundRate > city.fundMaxRate)) {
    throw new Error('请选择城市支持的公积金缴存比例。')
  }
  const salary = toCents(input.salary)
  const bonus = toCents(input.bonus)
  const allowance = toCents(5000 + input.deductions)
  const contributions = Array.from({ length: 12 }, (_, index) => contribution(input, city, index + 1))
  if (contributions.some(row => row.total > salary)) throw new Error('个人五险一金不能超过月税前工资。')
  const bonusTax = separateBonusTax(bonus)
  function scenario(combined) {
    let cumulativeTaxable = 0
    let withheld = 0
    const rows = contributions.map((payroll, index) => {
      const month = index + 1
      const monthBonus = month === input.bonusMonth ? bonus : 0
      cumulativeTaxable += salary + (combined ? monthBonus : 0) - payroll.total - allowance
      const wageTax = Math.max(0, taxOn(cumulativeTaxable) - withheld)
      withheld += wageTax
      const tax = wageTax + (!combined && month === input.bonusMonth ? bonusTax : 0)
      return { month, bonus: monthBonus, ...payroll, tax, takeHome: salary + monthBonus - payroll.total - tax }
    })
    const annualTax = taxOn(cumulativeTaxable) + (combined ? 0 : bonusTax)
    const withheldTotal = sum(rows, 'tax')
    return { rows, annualTax, withheldTotal, settlement: annualTax - withheldTotal,
      takeHome: salary * 12 + bonus - sum(contributions, 'total') - annualTax }
  }
  const separate = scenario(false)
  const combined = scenario(true)
  return { separate, combined, salary, bonus, gross: salary * 12 + bonus, totalContributions: sum(contributions, 'total'),
    separateBonusTax: bonusTax, combinedBonusTax: combined.annualTax - (separate.annualTax - bonusTax) }
}
