const group = '生活工具'
export const taxBands = [[36000, 3, 0], [144000, 10, 2520], [300000, 20, 16920],
  [420000, 25, 31920], [660000, 30, 52920], [960000, 35, 85920], [Infinity, 45, 181920]]

const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const amount = (id, label, initial = 0, max = 1e9) => ({ id, label, initial, min: 0, max, step: 0.01 })
const integer = (id, label, initial, min, max) => ({ id, label, initial, min, max, step: 1 })

export function payroll({ salary, insurance, extra, exempt, months, pastTaxable, paid, relief }) {
  if (insurance + exempt > salary) throw new Error('当月五险一金和免税收入之和不能超过税前工资。')
  const taxable = money(Math.max(0, pastTaxable + salary - insurance - extra - exempt - 5000 * months))
  const [, rate, deduction] = taxBands.find(([limit]) => taxable <= limit)
  const cumulative = money(Math.max(0, taxable * rate / 100 - deduction - relief))
  const tax = money(Math.max(0, cumulative - paid))
  return [
    ['本月预扣个税', tax], ['本月预计到手', money(salary - insurance - tax)],
    ['累计应税所得额', taxable], ['累计应预扣税额', cumulative], ['适用预扣率', rate, '%'],
  ]
}

export function discount({ price, discountRate }) {
  const final = money(price * discountRate / 100)
  return [['折后价', final], ['节省金额', money(price - final)]]
}

export function mortgage({ principal, annualRate, months }, action) {
  const rate = annualRate / 1200
  let first
  let last
  let total
  if (action === '等额本金') {
    first = principal / months + principal * rate
    last = principal / months * (1 + rate)
    total = principal + principal * rate * (months + 1) / 2
  } else {
    first = rate === 0 ? principal / months : principal * rate / -Math.expm1(-months * Math.log1p(rate))
    last = first
    total = first * months
  }
  return [['首月还款', money(first)], ['末月还款', money(last)], ['总利息', money(total - principal)], ['还款总额', money(total)]]
}

export const lifeTools = [
  { id: 'payroll-cn', name: '工资个税估算（中国大陆）', label: 'CNY · IIT', group, icon: 'Calculator', hue: 'mint',
    description: '按城市估算个人五险一金，对比年终奖计税方式并计算全年到手，支持单月累计预扣',
    form: [
      amount('salary', '本月税前工资', 15000), amount('insurance', '本月个人五险一金', 2000),
      amount('extra', '本月专项附加及其他税前扣除', 1000), amount('exempt', '本月工资中的免税收入'),
      integer('months', '本单位本年累计任职月数', 1, 1, 12),
      { ...amount('pastTaxable', '前月累计收入减免税收入和扣除（未减 5000 元/月）'), min: -1e9 },
      amount('paid', '此前累计已预扣税额'), amount('relief', '截至本月累计减免税额'),
    ],
    note: '累计收入及扣除按同一单位、同一纳税年度填写。适用常规每月 5000 元减除费用口径。',
    source: 'https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194838/content.html',
    actions: ['估算个税'], run: payroll },
  { id: 'discount', name: '折扣计算', label: 'DISCOUNT', group, icon: 'Calculator', hue: 'amber',
    description: '根据原价和实付比例计算折后价与节省金额',
    form: [amount('price', '商品原价', 199), amount('discountRate', '实付比例（%，八折填 80）', 80, 100)],
    actions: ['计算折扣'], run: discount },
  { id: 'mortgage', name: '房贷还款估算', label: 'MORTGAGE', group, icon: 'Calculator', hue: 'blue',
    description: '按固定年利率对比等额本息与等额本金的月供、总利息和还款总额',
    form: [amount('principal', '贷款本金', 1000000), amount('annualRate', '固定年利率（%）', 3.1, 100),
      integer('months', '还款月数', 360, 1, 600)],
    note: '按月计息估算，实际账单可能因计息日、费用及分期舍入而不同。',
    actions: ['等额本息', '等额本金'], run: mortgage },
]
