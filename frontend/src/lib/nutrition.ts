import type { MealItem } from '../types';

export function parseListInput(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDateTimeInputValue(value?: string | Date | null) {
  const source = value ? new Date(value) : new Date();
  const offset = source.getTimezoneOffset();
  const local = new Date(source.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function formatMetric(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

export function sumMealMetric(
  items: MealItem[],
  key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'sugar_g' | 'sodium_mg' | 'fiber_g'
) {
  return items.reduce((total, item) => total + Number(item[key] ?? 0), 0);
}
