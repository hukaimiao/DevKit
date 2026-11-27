<script setup>
import { ref } from 'vue'
import { translate, translateError } from './i18n'

const props = defineProps({
  tool: { type: Object, required: true },
  language: { type: String, required: true },
})
const t = key => translate(props.language, key)
const defaults = () => Object.fromEntries(props.tool.form.map(field => [field.id, field.initial]))
const input = ref(defaults())
const results = ref([])
const error = ref('')
const lastAction = ref('')

function reset() {
  input.value = defaults()
  results.value = []
  error.value = ''
  lastAction.value = ''
}

function calculate(action = props.tool.actions[0]) {
  results.value = []
  error.value = ''
  lastAction.value = action
  try {
    for (const { id, label, min, max, step } of props.tool.form) {
      const value = input.value[id]
      if (!Number.isFinite(value) || value < min || value > max || (step === 1 && !Number.isInteger(value))) {
        const range = `${new Intl.NumberFormat(props.language).format(min)}–${new Intl.NumberFormat(props.language).format(max)}`
        throw new Error(`${t(label)} · ${range}${step === 1 ? ' · ' + t('整数') : ''}`)
      }
    }
    results.value = props.tool.run(input.value, action)
  } catch (cause) {
    error.value = cause.message
  }
}

function showValue(value, unit) {
  return new Intl.NumberFormat(props.language, { minimumFractionDigits: unit ? 0 : 2, maximumFractionDigits: 2 }).format(value) + (unit ?? '')
}

defineExpose({ calculate })
</script>

<template>
  <div class="cron-workspace">
    <section class="cron-panel number-panel">
      <h2>{{ t('输入') }}</h2>
      <div class="cron-grid">
        <label v-for="field in tool.form" :key="field.id">
          {{ t(field.label) }}
          <input v-model.number="input[field.id]" type="number" :min="field.min" :max="field.max" :step="field.step"
            @input="results = []; error = ''">
        </label>
      </div>
      <p v-if="tool.note" class="cron-help">{{ t(tool.note) }}
        <a v-if="tool.source" :href="tool.source" target="_blank" rel="noopener noreferrer">{{ t('计算依据') }}</a>
      </p>
      <div class="cron-buttons">
        <button v-for="(action, index) in tool.actions" :key="action" :class="index === 0 ? 'primary' : 'secondary'"
          @click="calculate(action)">{{ t(action) }}</button>
        <button class="secondary" @click="reset">{{ t('重置') }}</button>
      </div>
    </section>
    <section class="cron-panel number-panel" aria-live="polite">
      <h2>{{ t('结果') }}<span v-if="results.length && tool.actions.length > 1"> · {{ t(lastAction) }}</span></h2>
      <dl v-if="results.length" class="number-results">
        <div v-for="[label, value, unit] in results" :key="label">
          <dt>{{ t(label) }}</dt><dd>{{ showValue(value, unit) }}</dd>
        </div>
      </dl>
      <p v-else class="cron-help">{{ t('运行后在这里显示结果') }}</p>
    </section>
    <p v-if="error" class="error" role="alert">{{ translateError(language, error) }}</p>
  </div>
</template>
