'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, MetricPill, MiniBarChart, Notice, PageIntro, Sparkline, StatCard } from '../components/Primitives';
import { extractApiErrorMessage, nutritionApi } from '../lib/api';
import { formatMetric } from '../lib/nutrition';
import type { NutritionToday, NutritionWindow } from '../types';

export function NutritionDashboardPage() {
  const [today, setToday] = useState<NutritionToday | null>(null);
  const [weekly, setWeekly] = useState<NutritionWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [todayData, weeklyData] = await Promise.all([nutritionApi.today(), nutritionApi.weekly()]);
        if (!active) {
          return;
        }
        setToday(todayData);
        setWeekly(weeklyData);
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

    void load();
    return () => {
      active = false;
    };
  }, []);

  const calorieValues = useMemo(() => weekly?.calorie_points.map((point) => point.calories) ?? [], [weekly]);
  const calorieLabels = useMemo(() => weekly?.calorie_points.map((point) => point.label) ?? [], [weekly]);
  const weightValues = useMemo(() => weekly?.weight_points.map((point) => point.weight_kg) ?? [], [weekly]);

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Nutrition Dashboard"
        title="今天吃了多少，以及這週的節奏長什麼樣"
        description="把單餐記錄拉高到日與週的視角，你會更容易看出蛋白質是否穩、哪個時段容易爆卡，以及體重有沒有往目標前進。"
        actions={
          <>
            <Link href="/meals/new" className="btn btn-primary">
              新增餐次
            </Link>
            <Link href="/profile/setup" className="btn btn-secondary">
              調整設定
            </Link>
          </>
        }
        aside={
          today ? (
            <div className="grid compact">
              <MetricPill label="剩餘熱量" value={today.remaining_calories === null ? '--' : `${Math.round(today.remaining_calories)} kcal`} tone="info" />
              <MetricPill label="高風險餐次" value={today.high_risk_meals.length} tone={today.high_risk_meals.length > 0 ? 'warning' : 'success'} />
              <MetricPill label="已記錄餐數" value={today.meals.length} tone="neutral" />
            </div>
          ) : null
        }
      />

      {loading ? <Notice title="讀取 dashboard 中" description="正在聚合今日與每週的飲食資料。" tone="info" /> : null}
      {error ? <Notice title="載入失敗" description={error} tone="danger" /> : null}

      {today ? (
        <>
          <div className="grid stats">
            <StatCard label="今日熱量" value={`${formatMetric(today.total_calories, 0)} kcal`} hint={today.calorie_target ? `目標 ${today.calorie_target} kcal` : '尚未設定目標'} />
            <StatCard label="蛋白質" value={`${formatMetric(today.total_protein_g, 1)} g`} />
            <StatCard label="碳水" value={`${formatMetric(today.total_carbs_g, 1)} g`} />
            <StatCard label="脂肪" value={`${formatMetric(today.total_fat_g, 1)} g`} />
          </div>

          <div className="grid two">
            <Card className="section-card">
              <div className="section-header">
                <div>
                  <h2>今日餐次</h2>
                  <p className="muted">這裡顯示今天已分析或已確認的餐次。</p>
                </div>
              </div>
              <div className="stack">
                {today.meals.length ? (
                  today.meals.map((meal) => (
                    <Link key={meal.id} href={`/meals/${meal.id}/review`} className="entity card">
                      <div className="entity-top">
                        <div>
                          <h3 className="entity-title">{meal.meal_type}</h3>
                          <p className="muted small">{new Date(meal.eaten_at).toLocaleString()}</p>
                        </div>
                        <strong>{formatMetric(meal.total_calories, 0)} kcal</strong>
                      </div>
                      <div className="entity-copy">
                        <p>{meal.ai_summary ?? '尚無摘要'}</p>
                        <p className="muted small">{meal.user_confirmed ? '已確認' : '待確認'}</p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="empty-state">
                    <h3>今天還沒有餐次</h3>
                    <p className="muted">從新增餐次開始，讓 dashboard 有資料可以聚合。</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="section-card">
              <div className="section-header">
                <div>
                  <h2>今日提醒</h2>
                  <p className="muted">{today.encouragement}</p>
                </div>
              </div>
              <div className="stack">
                {today.suggestions.map((suggestion) => (
                  <div key={suggestion} className="notice notice-info">
                    <strong>{suggestion}</strong>
                  </div>
                ))}
                <div className="helper-row">
                  <span className="muted small">糖 {formatMetric(today.total_sugar_g, 1)} g</span>
                  <span className="muted small">鈉 {formatMetric(today.total_sodium_mg, 0)} mg</span>
                  <span className="muted small">纖維 {formatMetric(today.total_fiber_g, 1)} g</span>
                </div>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {weekly ? (
        <div className="grid two">
          <Card className="section-card">
            <div className="section-header">
              <div>
                <h2>本週熱量趨勢</h2>
                <p className="muted">{weekly.summary_text}</p>
              </div>
            </div>
            <MiniBarChart values={calorieValues} labels={calorieLabels} />
            <div className="helper-row">
              <span className="muted small">平均熱量 {formatMetric(weekly.average_calories, 0)} kcal</span>
              <span className="muted small">蛋白質達標天數 {weekly.protein_target_days} / {weekly.days}</span>
            </div>
          </Card>

          <Card className="section-card">
            <div className="section-header">
              <div>
                <h2>體重與高頻食物</h2>
                <p className="muted">有體重紀錄時，這裡會顯示近一週走勢。</p>
              </div>
            </div>
            {weightValues.length ? <Sparkline values={weightValues} colorClass="success" /> : <p className="muted">目前還沒有足夠的體重資料。</p>}
            <div className="stack">
              {weekly.top_foods.map((item) => (
                <div key={item.food_name} className="helper-row">
                  <span>{item.food_name}</span>
                  <strong>{item.count} 次</strong>
                </div>
              ))}
              {!weekly.top_foods.length ? <p className="muted">還沒有足夠的食物頻率資料。</p> : null}
            </div>
            <div className="stack">
              {weekly.risk_windows.map((window) => (
                <div key={window.meal_type} className="helper-row">
                  <span>{window.meal_type}</span>
                  <strong>{window.count}</strong>
                </div>
              ))}
              {!weekly.risk_windows.length ? <p className="muted">本週還沒有明顯的高風險時段。</p> : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
