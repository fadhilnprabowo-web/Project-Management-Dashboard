export function parseLocaleNumber(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return Number(value)
  const text = value.trim().replace(/\s/g, '')
  if (!text) return 0
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(text)
      ? text.replace(/\./g, '')
      : text
  return Number(normalized)
}

export function formatPercent(value:unknown){const n=parseLocaleNumber(value);const valid=Number.isFinite(n)?n:0;const absolute=Math.abs(valid);const rounded=Math.sign(valid)*Math.round((absolute+Number.EPSILON*Math.max(1,absolute))*100)/100;return `${rounded.toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})}%`}
