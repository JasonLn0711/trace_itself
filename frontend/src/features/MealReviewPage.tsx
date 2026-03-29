'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Notice, PageIntro, StatCard } from '../components/Primitives';
import { extractApiErrorMessage, mealsApi } from '../lib/api';
import { formatMetric, sumMealMetric, toDateTimeInputValue, toOptionalNumber } from '../lib/nutrition';
import type { Meal, MealItem } from '../types';

function editableItem(item: MealItem): MealItem {
  return {
    food_name: item.food_name,
    canonical_food_id: item.canonical_food_id ?? null,
    estimated_portion_label: item.estimated_portion_label ?? '',
    estimated_quantity: item.estimated_quantity ?? 1,
    estimated_unit: item.estimated_unit ?? '份',
    calories: item.calories ?? 0,
    protein_g: item.protein_g ?? 0,
    carbs_g: item.carbs_g ?? 0,
    fat_g: item.fat_g ?? 0,
    sugar_g: item.sugar_g ?? 0,
    sodium_mg: item.sodium_mg ?? 0,
    fiber_g: item.fiber_g ?? 0,
    confidence: item.confidence ?? null,
    source_type: item.source_type ?? 'manual',
    uncertain: item.uncertain ?? false,
    notes: item.notes ?? ''
  };
}

function createEmptyItem(): MealItem {
  return {
    food_name: '',
    estimated_portion_label: '1份',
    estimated_quantity: 1,
    estimated_unit: '份',
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    sugar_g: 0,
    sodium_mg: 0,
    fiber_g: 0,
    uncertain: true,
    source_type: 'manual',
    notes: ''
  };
}

export function MealReviewPage({ mealId }: { mealId: number }) {
  const router = useRouter();
  const [meal, setMeal] = useState<Meal | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [extraText, setExtraText] = useState('');
  const [eatenAt, setEatenAt] = useState(toDateTimeInputValue());
  const [items, setItems] = useState<MealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMeal() {
      try {
        const response = await mealsApi.get(mealId);
        if (!active) {
          return;
        }
        setMeal(response);
        setTranscriptText(response.transcript_text ?? '');
        setExtraText(response.extra_text ?? '');
        setEatenAt(toDateTimeInputValue(response.eaten_at));
        setItems(response.items.map(editableItem));
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(extractApiErrorMessage(loadError));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadMeal();
    return () => {
      active = false;
    };
  }, [mealId]);

  const totals = useMemo(
    () => ({
      calories: sumMealMetric(items, 'calories'),
      protein: sumMealMetric(items, 'protein_g'),
      carbs: sumMealMetric(items, 'carbs_g'),
      fat: sumMealMetric(items, 'fat_g')
    }),
    [items]
  );

  function updateItem(index: number, patch: Partial<MealItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function handleReanalyze() {
    setReanalyzing(true);
    setError(null);

    try {
      await mealsApi.update(mealId, {
        eaten_at: new Date(eatenAt).toISOString(),
        transcript_text: transcriptText,
        extra_text: extraText
      });
      const refreshed = await mealsApi.analyze(mealId);
      setMeal(refreshed);
      setItems(refreshed.items.map(editableItem));
    } catch (reanalyzeError) {
      setError(extractApiErrorMessage(reanalyzeError));
    } finally {
      setReanalyzing(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await mealsApi.update(mealId, {
        eaten_at: new Date(eatenAt).toISOString(),
        transcript_text: transcriptText,
        extra_text: extraText
      });
      await mealsApi.confirm(mealId, {
        transcript_text: transcriptText,
        extra_text: extraText,
        items: items
          .filter((item) => item.food_name.trim())
          .map((item) => ({
            ...item,
            estimated_quantity: item.estimated_quantity ?? 1,
            calories: item.calories ?? 0,
            protein_g: item.protein_g ?? 0,
            carbs_g: item.carbs_g ?? 0,
            fat_g: item.fat_g ?? 0,
            sugar_g: item.sugar_g ?? 0,
            sodium_mg: item.sodium_mg ?? 0,
            fiber_g: item.fiber_g ?? 0
          }))
      });
      router.push('/dashboard');
    } catch (confirmError) {
      setError(extractApiErrorMessage(confirmError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Notice title="載入餐次中" description="正在抓取分析結果與可編輯品項。" tone="info" />;
  }

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Meal Review"
        title="確認這餐的拆解結果"
        description="AI 先做保守估算，你可以快速修正品項、份量或營養數字，再正式寫入每日統計。"
        actions={
          <Link href="/meals/new" className="btn btn-secondary">
            回到新增餐次
          </Link>
        }
        aside={
          <div className="grid compact">
            <StatCard label="熱量" value={`${formatMetric(totals.calories, 0)} kcal`} />
            <StatCard label="蛋白質" value={`${formatMetric(totals.protein, 1)} g`} />
            <StatCard label="碳水" value={`${formatMetric(totals.carbs, 1)} g`} />
            <StatCard label="脂肪" value={`${formatMetric(totals.fat, 1)} g`} />
          </div>
        }
      />

      {error ? <Notice title="餐次處理失敗" description={error} tone="danger" /> : null}
      {meal?.suggestion_text ? <Notice title="AI 建議" description={meal.suggestion_text} tone="info" /> : null}

      <form className="stack" onSubmit={handleConfirm}>
        <Card className="section-card">
          <div className="form-grid cols-2">
            <Field label="用餐時間">
              <input type="datetime-local" value={eatenAt} onChange={(event) => setEatenAt(event.target.value)} />
            </Field>
            <Field label="補充文字">
              <input value={extraText} onChange={(event) => setExtraText(event.target.value)} placeholder="半碗飯、微糖、少醬" />
            </Field>
          </div>
          <Field label="語音轉錄 / 描述">
            <textarea value={transcriptText} onChange={(event) => setTranscriptText(event.target.value)} />
          </Field>
          <div className="helper-row">
            <span className="muted small">{meal?.ai_summary ?? '尚未有 AI 摘要。'}</span>
            <Button type="button" variant="secondary" onClick={handleReanalyze} disabled={reanalyzing}>
              {reanalyzing ? '重新分析中...' : '重新分析'}
            </Button>
          </div>
        </Card>

        <div className="stack">
          {items.map((item, index) => (
            <Card key={`${item.food_name}-${index}`} className="section-card">
              <div className="helper-row">
                <strong>品項 {index + 1}</strong>
                <Button type="button" variant="ghost" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  移除
                </Button>
              </div>

              <div className="form-grid cols-2">
                <Field label="食物名稱">
                  <input value={item.food_name} onChange={(event) => updateItem(index, { food_name: event.target.value })} />
                </Field>
                <Field label="份量描述">
                  <input
                    value={item.estimated_portion_label ?? ''}
                    onChange={(event) => updateItem(index, { estimated_portion_label: event.target.value })}
                    placeholder="半碗 / 1 杯 / 1 份"
                  />
                </Field>
                <Field label="數量">
                  <input
                    value={item.estimated_quantity ?? ''}
                    onChange={(event) => updateItem(index, { estimated_quantity: toOptionalNumber(event.target.value) ?? 0 })}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="單位">
                  <input value={item.estimated_unit ?? ''} onChange={(event) => updateItem(index, { estimated_unit: event.target.value })} />
                </Field>
                <Field label="熱量">
                  <input value={item.calories ?? ''} onChange={(event) => updateItem(index, { calories: toOptionalNumber(event.target.value) ?? 0 })} inputMode="decimal" />
                </Field>
                <Field label="蛋白質">
                  <input value={item.protein_g ?? ''} onChange={(event) => updateItem(index, { protein_g: toOptionalNumber(event.target.value) ?? 0 })} inputMode="decimal" />
                </Field>
                <Field label="碳水">
                  <input value={item.carbs_g ?? ''} onChange={(event) => updateItem(index, { carbs_g: toOptionalNumber(event.target.value) ?? 0 })} inputMode="decimal" />
                </Field>
                <Field label="脂肪">
                  <input value={item.fat_g ?? ''} onChange={(event) => updateItem(index, { fat_g: toOptionalNumber(event.target.value) ?? 0 })} inputMode="decimal" />
                </Field>
              </div>

              <p className="muted small">
                糖 {formatMetric(item.sugar_g ?? 0, 1)} g / 鈉 {formatMetric(item.sodium_mg ?? 0, 0)} mg / 纖維 {formatMetric(item.fiber_g ?? 0, 1)} g
              </p>
              {item.notes ? <p className="muted small">{item.notes}</p> : null}
            </Card>
          ))}
        </div>

        <div className="helper-row">
          <Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, createEmptyItem()])}>
            新增自訂品項
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? '確認中...' : '確認這餐並寫入 dashboard'}
          </Button>
        </div>
      </form>
    </div>
  );
}
