<script setup>
import { computed, ref } from 'vue'
import NumberTool from './NumberTool.vue'
import { annualPayroll, cities, initialPayroll, payrollSources, payrollYear } from './payroll'
import { translate, translateError } from './i18n'

const props = defineProps({ tool: { type: Object, required: true }, language: { type: String, required: true } })
const t = key => translate(props.language, key)
const view = ref('annual')
const monthly = ref(null)
const input = ref({ ...initialPayroll })
const result = ref(null)
const scenario = ref('separate')
const error = ref('')
const city = computed(() => cities[input.value.city])
const shown = computed(() => result.value?.[scenario.value])
const currency = computed(() => new Intl.NumberFormat(props.language, { style: 'currency', currency: 'CNY',
  currencyDisplay: 'code', minimumFractionDigits: 2 }))
const monthFormat = computed(() => new Intl.DateTimeFormat(props.language, { month: 'short', timeZone: 'UTC' }))
const fmt = cents => currency.value.format(cents / 100)
const monthName = month => monthFormat.value.format(Date.UTC(payrollYear, month - 1, 1))
const annualFields = [['salary', '月税前工资'], ['deductions', '每月专项附加及其他税前扣除'], ['bonus', '税前年终奖']]
const manualFields = [['manualSocial', '每月个人社保'], ['manualFund', '每月个人公积金']]
const baseFields = [['socialBase', '社保缴费基数'], ['fundBase', '公积金缴存基数']]
const breakdown = [['pension', '养老保险'], ['medical', '医疗保险'], ['unemployment', '失业保险'],
  ['social', '个人社保合计'], ['fund', '个人公积金'], ['total', '个人五险一金合计']]
const tableFields = [['bonus', '税前年终奖'], ['social', '个人社保合计'], ['fund', '个人公积金'],
  ['tax', '当月预扣个税'], ['takeHome', '当月预计到手']]

function calculate() {
  if (view.value === 'monthly') {
    monthly.value?.calculate()
    return
  }
  error.value = ''
  result.value = null
  try {
    result.value = annualPayroll(input.value)
  } catch (cause) {
    error.value = cause.message
  }
}

function onCityChange() {
  if (city.value) input.value.fundRate = Math.min(7, city.value.fundMaxRate)
  calculate()
}

function reset() {
  input.value = { ...initialPayroll }
  scenario.value = 'separate'
  calculate()
}

function edit() {
  result.value = null
  error.value = ''
}

calculate()
defineExpose({ calculate })
</script>

<template>
  <div class="payroll-tool">
    <div class="filters" :aria-label="t('工资测算方式')">
      <button v-for="[key, label] in [['annual', '全年与年终奖'], ['monthly', '单月累计预扣']]" :key="key"
        :class="{ active: view === key }" :aria-pressed="view === key" @click="view = key">{{ t(label) }}</button>
    </div>
    <NumberTool v-show="view === 'monthly'" ref="monthly" :tool="tool" :language="language" />
    <div v-show="view === 'annual'" class="payroll-layout">
      <section class="cron-panel">
        <h2>{{ t('工资与缴费设置') }} · {{ payrollYear }}</h2>
        <form @submit.prevent="calculate" @input="edit">
          <div class="cron-grid">
            <label>{{ t('缴费城市') }}
              <select v-model="input.city" @change="onCityChange">
                <option v-for="[key, profile] in Object.entries(cities)" :key="key" :value="key">{{ t(profile.label) }}</option>
                <option value="manual">{{ t('其他城市／手动填写') }}</option>
              </select>
            </label>
            <label v-for="[key, label] in annualFields" :key="key">{{ t(label) }}
              <input v-model.number="input[key]" type="number" min="0" max="1000000000" step="0.01" required>
            </label>
            <label>{{ t('年终奖发放月份') }}
              <select v-model.number="input.bonusMonth">
                <option v-for="month in 12" :key="month" :value="month">{{ monthName(month) }}</option>
              </select>
            </label>
          </div>
          <div v-if="city" class="cron-grid">
            <label v-for="[key, label] in baseFields" :key="key">{{ t(label) }}
              <input v-model.number="input[key]" type="number" min="0" max="1000000000" step="0.01" :placeholder="t('留空使用月薪估算')">
            </label>
            <label>{{ t('个人公积金比例（%）') }}
              <select v-model.number="input.fundRate">
                <option v-for="rate in city.fundMaxRate - 4" :key="rate" :value="rate + 4">{{ rate + 4 }}%</option>
              </select>
            </label>
          </div>
          <div v-else class="cron-grid">
            <label v-for="[key, label] in manualFields" :key="key">{{ t(label) }}
              <input v-model.number="input[key]" type="number" min="0" max="1000000000" step="0.01" required>
            </label>
          </div>
          <p class="cron-help">{{ t('按同一雇主全年 12 个月固定工资估算，金额为人民币。') }}</p>
          <p v-if="city" class="cron-help">{{ t('城市预设按 2026 年 1–6 月和 7–12 月分别套用已公布的缴费基数上下限。实际申报基数及公积金比例请以工资单为准。') }}</p>
          <div class="cron-buttons">
            <button class="primary" type="submit">{{ t('计算全年到手') }}</button>
            <button class="secondary" type="button" @click="reset">{{ t('重置') }}</button>
          </div>
        </form>
        <p v-if="error" class="error" role="alert">{{ translateError(language, error) }}</p>
      </section>

      <section class="cron-panel" aria-live="polite">
        <h2>{{ t('全年收入与年终奖') }}</h2>
        <template v-if="result">
          <dl class="number-results">
            <div><dt>{{ t('全年税前收入') }}</dt><dd>{{ fmt(result.gross) }}</dd></div>
            <div><dt>{{ t('全年个人五险一金') }}</dt><dd>{{ fmt(result.totalContributions) }}</dd></div>
          </dl>
          <div class="payroll-scroll">
            <table class="payroll-table">
              <thead><tr><th scope="col">{{ t('计税方式') }}</th><th scope="col">{{ t('奖金相关个税') }}</th>
                <th scope="col">{{ t('全年个税') }}</th><th scope="col">{{ t('全年预计到手') }}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{{ t('年终奖单独计税') }}</th><td>{{ fmt(result.separateBonusTax) }}</td>
                  <td>{{ fmt(result.separate.annualTax) }}</td><td>{{ fmt(result.separate.takeHome) }}</td></tr>
                <tr><th scope="row">{{ t('年终奖并入综合所得') }}</th><td>{{ fmt(result.combinedBonusTax) }}</td>
                  <td>{{ fmt(result.combined.annualTax) }}</td><td>{{ fmt(result.combined.takeHome) }}</td></tr>
              </tbody>
            </table>
          </div>
          <p class="cron-help">{{ t('并入时的奖金相关个税为加入奖金后增加的全年税额。单独计税适用于符合条件的全年一次性奖金，现行政策有效至 2027 年 12 月 31 日。') }}</p>
        </template>
        <p v-else class="cron-help">{{ t('运行后在这里显示结果') }}</p>
      </section>

      <section v-if="shown" class="cron-panel payroll-wide">
        <h2>{{ t('个人五险一金明细') }}</h2>
        <div class="payroll-scroll">
          <table class="payroll-table">
            <thead><tr><th scope="col">{{ t('项目') }}</th><th scope="col">{{ t('1–6 月每月') }}</th>
              <th scope="col">{{ t('7–12 月每月') }}</th></tr></thead>
            <tbody>
              <tr v-for="[key, label] in breakdown.filter(([key]) => shown.rows[0][key] !== undefined)" :key="key">
                <th scope="row">{{ t(label) }}</th><td>{{ fmt(shown.rows[0][key]) }}</td><td>{{ fmt(shown.rows[6][key]) }}</td>
              </tr>
              <template v-if="city">
                <tr v-for="[key, label] in baseFields" :key="key">
                  <th scope="row">{{ t(label) }}</th><td>{{ fmt(shown.rows[0][key] * 100) }}</td><td>{{ fmt(shown.rows[6][key] * 100) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p v-if="city" class="cron-help">{{ t('工伤和生育保险无个人单独缴费；上海补充公积金可在手动模式录入。') }}</p>
      </section>
      <section v-if="shown" class="cron-panel payroll-wide">
        <h2>{{ t('逐月到手明细') }}</h2>
        <label class="payroll-scenario">{{ t('计税方式') }}
          <select v-model="scenario">
            <option value="separate">{{ t('年终奖单独计税') }}</option>
            <option value="combined">{{ t('年终奖并入综合所得') }}</option>
          </select>
        </label>
        <div class="payroll-scroll">
          <table class="payroll-table">
            <thead><tr><th scope="col">{{ t('月份') }}</th><th scope="col">{{ t('月税前工资') }}</th>
              <th v-for="[key, label] in tableFields" :key="key" scope="col">{{ t(label) }}</th></tr></thead>
            <tbody>
              <tr v-for="row in shown.rows" :key="row.month"><th scope="row">{{ monthName(row.month) }}</th>
                <td>{{ fmt(result.salary) }}</td><td v-for="[key] in tableFields" :key="key">{{ fmt(row[key]) }}</td></tr>
            </tbody>
          </table>
        </div>
        <p v-if="shown.settlement !== 0" class="cron-help">
          {{ t(shown.settlement < 0 ? '预计汇算退税' : '预计汇算补税') }} · {{ fmt(Math.abs(shown.settlement)) }}
        </p>
      </section>
      <section class="cron-panel payroll-wide">
        <h2>{{ t('计算依据') }}</h2>
        <ul class="payroll-sources">
          <li v-for="[label, url] in [...payrollSources, ...(city?.sources ?? [])]" :key="url">
            <a :href="url" target="_blank" rel="noopener noreferrer">{{ t(label) }}</a>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
