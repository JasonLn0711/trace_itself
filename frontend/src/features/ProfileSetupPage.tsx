'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Card, Field, Notice, PageIntro, StatCard } from '../components/Primitives';
import { extractApiErrorMessage, profileApi } from '../lib/api';
import { parseListInput, toOptionalNumber } from '../lib/nutrition';
import type { NutritionGoal, NutritionProfile } from '../types';

type ProfileFormState = {
  display_name: string;
  age: string;
  sex: string;
  height_cm: string;
  current_weight_kg: string;
  target_weight_kg: string;
  goal_type: string;
  activity_level: string;
  weekly_workouts: string;
  workout_types: string;
  location_region: string;
  dietary_preferences: string;
  allergies: string;
  disliked_foods: string;
  tracking_focus: string;
};

type GoalFormState = {
  daily_calorie_target: string;
  daily_protein_g: string;
  daily_carbs_g: string;
  daily_fat_g: string;
  daily_sugar_g: string;
  daily_sodium_mg: string;
  daily_fiber_g: string;
};

const emptyProfileForm: ProfileFormState = {
  display_name: '',
  age: '',
  sex: '',
  height_cm: '',
  current_weight_kg: '',
  target_weight_kg: '',
  goal_type: '減脂',
  activity_level: '中度',
  weekly_workouts: '',
  workout_types: '',
  location_region: '台灣',
  dietary_preferences: '',
  allergies: '',
  disliked_foods: '',
  tracking_focus: '熱量, 蛋白質'
};

const emptyGoalForm: GoalFormState = {
  daily_calorie_target: '',
  daily_protein_g: '',
  daily_carbs_g: '',
  daily_fat_g: '',
  daily_sugar_g: '',
  daily_sodium_mg: '',
  daily_fiber_g: ''
};

function profileToForm(profile: NutritionProfile): ProfileFormState {
  return {
    display_name: profile.display_name ?? '',
    age: profile.age?.toString() ?? '',
    sex: profile.sex ?? '',
    height_cm: profile.height_cm?.toString() ?? '',
    current_weight_kg: profile.current_weight_kg?.toString() ?? '',
    target_weight_kg: profile.target_weight_kg?.toString() ?? '',
    goal_type: profile.goal_type ?? '減脂',
    activity_level: profile.activity_level ?? '中度',
    weekly_workouts: profile.weekly_workouts?.toString() ?? '',
    workout_types: profile.workout_types.join(', '),
    location_region: profile.location_region ?? '台灣',
    dietary_preferences: profile.dietary_preferences.join(', '),
    allergies: profile.allergies.join(', '),
    disliked_foods: profile.disliked_foods.join(', '),
    tracking_focus: profile.tracking_focus.join(', ')
  };
}

function goalToForm(goal: NutritionGoal): GoalFormState {
  return {
    daily_calorie_target: goal.daily_calorie_target?.toString() ?? '',
    daily_protein_g: goal.daily_protein_g?.toString() ?? '',
    daily_carbs_g: goal.daily_carbs_g?.toString() ?? '',
    daily_fat_g: goal.daily_fat_g?.toString() ?? '',
    daily_sugar_g: goal.daily_sugar_g?.toString() ?? '',
    daily_sodium_mg: goal.daily_sodium_mg?.toString() ?? '',
    daily_fiber_g: goal.daily_fiber_g?.toString() ?? ''
  };
}

export function ProfileSetupPage() {
  const [profileForm, setProfileForm] = useState<ProfileFormState>(emptyProfileForm);
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [profile, goals] = await Promise.all([profileApi.get(), profileApi.getGoals()]);
        if (!active) {
          return;
        }
        setProfileForm(profileToForm(profile));
        setGoalForm(goalToForm(goals));
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await profileApi.update({
        display_name: profileForm.display_name || null,
        age: toOptionalNumber(profileForm.age),
        sex: profileForm.sex || null,
        height_cm: toOptionalNumber(profileForm.height_cm),
        current_weight_kg: toOptionalNumber(profileForm.current_weight_kg),
        target_weight_kg: toOptionalNumber(profileForm.target_weight_kg),
        goal_type: profileForm.goal_type || null,
        activity_level: profileForm.activity_level || null,
        weekly_workouts: toOptionalNumber(profileForm.weekly_workouts),
        workout_types: parseListInput(profileForm.workout_types),
        location_region: profileForm.location_region || null,
        dietary_preferences: parseListInput(profileForm.dietary_preferences),
        allergies: parseListInput(profileForm.allergies),
        disliked_foods: parseListInput(profileForm.disliked_foods),
        tracking_focus: parseListInput(profileForm.tracking_focus)
      });

      const goals = await profileApi.updateGoals({
        daily_calorie_target: toOptionalNumber(goalForm.daily_calorie_target),
        daily_protein_g: toOptionalNumber(goalForm.daily_protein_g),
        daily_carbs_g: toOptionalNumber(goalForm.daily_carbs_g),
        daily_fat_g: toOptionalNumber(goalForm.daily_fat_g),
        daily_sugar_g: toOptionalNumber(goalForm.daily_sugar_g),
        daily_sodium_mg: toOptionalNumber(goalForm.daily_sodium_mg),
        daily_fiber_g: toOptionalNumber(goalForm.daily_fiber_g)
      });

      setGoalForm(goalToForm(goals));
      setSuccess('個人設定與營養目標已更新。');
    } catch (submitError) {
      setError(extractApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Nutrition Setup"
        title="建立你的飲食追蹤基準"
        description="先把身體資料、目標與限制定清楚，後面的餐次分析與每日建議才會更接近你的情境。"
        aside={
          <div className="grid compact">
            <StatCard label="追蹤重點" value={parseListInput(profileForm.tracking_focus).length || 1} hint="營養指標" />
            <StatCard label="飲食限制" value={parseListInput(profileForm.allergies).length} hint="過敏原數" />
            <StatCard label="運動頻率" value={profileForm.weekly_workouts || '--'} hint="每週次數" />
          </div>
        }
      />

      {error ? <Notice title="載入或儲存失敗" description={error} tone="danger" /> : null}
      {success ? <Notice title="設定已更新" description={success} tone="success" /> : null}

      <form className="stack" onSubmit={handleSubmit}>
        <Card className="section-card">
          <div className="section-header">
            <div>
              <h2>個人資料</h2>
              <p className="muted">這些欄位會影響每日熱量與營養目標的預估。</p>
            </div>
          </div>

          <div className="form-grid cols-2">
            <Field label="暱稱">
              <input value={profileForm.display_name} onChange={(event) => setProfileForm((current) => ({ ...current, display_name: event.target.value }))} />
            </Field>
            <Field label="性別">
              <input value={profileForm.sex} onChange={(event) => setProfileForm((current) => ({ ...current, sex: event.target.value }))} placeholder="男 / 女 / 不指定" />
            </Field>
            <Field label="年齡">
              <input value={profileForm.age} onChange={(event) => setProfileForm((current) => ({ ...current, age: event.target.value }))} inputMode="numeric" />
            </Field>
            <Field label="身高 (cm)">
              <input value={profileForm.height_cm} onChange={(event) => setProfileForm((current) => ({ ...current, height_cm: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="目前體重 (kg)">
              <input value={profileForm.current_weight_kg} onChange={(event) => setProfileForm((current) => ({ ...current, current_weight_kg: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="目標體重 (kg)">
              <input value={profileForm.target_weight_kg} onChange={(event) => setProfileForm((current) => ({ ...current, target_weight_kg: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="目標類型">
              <input value={profileForm.goal_type} onChange={(event) => setProfileForm((current) => ({ ...current, goal_type: event.target.value }))} placeholder="減脂 / 維持 / 增肌" />
            </Field>
            <Field label="活動量">
              <input value={profileForm.activity_level} onChange={(event) => setProfileForm((current) => ({ ...current, activity_level: event.target.value }))} placeholder="久坐 / 輕度 / 中度 / 高度" />
            </Field>
            <Field label="每週運動次數">
              <input value={profileForm.weekly_workouts} onChange={(event) => setProfileForm((current) => ({ ...current, weekly_workouts: event.target.value }))} inputMode="numeric" />
            </Field>
            <Field label="運動類型">
              <input value={profileForm.workout_types} onChange={(event) => setProfileForm((current) => ({ ...current, workout_types: event.target.value }))} placeholder="重訓, 跑步, 瑜伽" />
            </Field>
            <Field label="地區">
              <input value={profileForm.location_region} onChange={(event) => setProfileForm((current) => ({ ...current, location_region: event.target.value }))} />
            </Field>
            <Field label="追蹤重點" hint="可用逗號分隔">
              <input value={profileForm.tracking_focus} onChange={(event) => setProfileForm((current) => ({ ...current, tracking_focus: event.target.value }))} placeholder="熱量, 蛋白質, 糖, 鈉" />
            </Field>
          </div>
        </Card>

        <Card className="section-card">
          <div className="section-header">
            <div>
              <h2>飲食限制與偏好</h2>
              <p className="muted">這些資訊會進入分析與建議邏輯，避免出現不適合你的推薦。</p>
            </div>
          </div>

          <div className="form-grid cols-2">
            <Field label="飲食偏好" hint="可用逗號分隔">
              <textarea value={profileForm.dietary_preferences} onChange={(event) => setProfileForm((current) => ({ ...current, dietary_preferences: event.target.value }))} placeholder="素食, 低碳, 清真" />
            </Field>
            <Field label="過敏原" hint="可用逗號分隔">
              <textarea value={profileForm.allergies} onChange={(event) => setProfileForm((current) => ({ ...current, allergies: event.target.value }))} placeholder="花生, 蝦蟹, 牛奶" />
            </Field>
            <Field label="不吃的食物" hint="可用逗號分隔">
              <textarea value={profileForm.disliked_foods} onChange={(event) => setProfileForm((current) => ({ ...current, disliked_foods: event.target.value }))} placeholder="香菜, 內臟, 生洋蔥" />
            </Field>
          </div>
        </Card>

        <Card className="section-card">
          <div className="section-header">
            <div>
              <h2>每日營養目標</h2>
              <p className="muted">可保留空白使用系統預估，或手動覆蓋成你的個人目標。</p>
            </div>
          </div>

          <div className="form-grid cols-2">
            <Field label="熱量目標 (kcal)">
              <input value={goalForm.daily_calorie_target} onChange={(event) => setGoalForm((current) => ({ ...current, daily_calorie_target: event.target.value }))} inputMode="numeric" />
            </Field>
            <Field label="蛋白質 (g)">
              <input value={goalForm.daily_protein_g} onChange={(event) => setGoalForm((current) => ({ ...current, daily_protein_g: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="碳水 (g)">
              <input value={goalForm.daily_carbs_g} onChange={(event) => setGoalForm((current) => ({ ...current, daily_carbs_g: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="脂肪 (g)">
              <input value={goalForm.daily_fat_g} onChange={(event) => setGoalForm((current) => ({ ...current, daily_fat_g: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="糖 (g)">
              <input value={goalForm.daily_sugar_g} onChange={(event) => setGoalForm((current) => ({ ...current, daily_sugar_g: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="鈉 (mg)">
              <input value={goalForm.daily_sodium_mg} onChange={(event) => setGoalForm((current) => ({ ...current, daily_sodium_mg: event.target.value }))} inputMode="decimal" />
            </Field>
            <Field label="纖維 (g)">
              <input value={goalForm.daily_fiber_g} onChange={(event) => setGoalForm((current) => ({ ...current, daily_fiber_g: event.target.value }))} inputMode="decimal" />
            </Field>
          </div>
        </Card>

        <div className="helper-row">
          <span className="muted small">{loading ? '載入中...' : '資料會作為餐點分析與 dashboard 聚合的基準。'}</span>
          <Button type="submit" disabled={saving}>
            {saving ? '儲存中...' : '儲存設定'}
          </Button>
        </div>
      </form>
    </div>
  );
}
