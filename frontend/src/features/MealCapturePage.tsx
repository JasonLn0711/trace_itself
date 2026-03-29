'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Notice, PageIntro, SegmentedControl } from '../components/Primitives';
import { extractApiErrorMessage, mealsApi } from '../lib/api';
import { toDateTimeInputValue } from '../lib/nutrition';

const mealTypeOptions = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '點心' },
  { value: 'late-night', label: '宵夜' }
];

export function MealCapturePage() {
  const router = useRouter();
  const [mealType, setMealType] = useState('lunch');
  const [eatenAt, setEatenAt] = useState(toDateTimeInputValue());
  const [transcriptText, setTranscriptText] = useState('');
  const [extraText, setExtraText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelection(
    setter: (value: File | null) => void,
    event: ChangeEvent<HTMLInputElement>
  ) {
    setter(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const meal = await mealsApi.ingest({
        meal_type: mealType,
        eaten_at: new Date(eatenAt).toISOString(),
        transcript_text: transcriptText || null,
        extra_text: extraText || null,
        image_file: imageFile,
        audio_file: audioFile
      });
      router.push(`/meals/${meal.id}/review`);
    } catch (submitError) {
      setError(extractApiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Meal Capture"
        title="記錄一餐"
        description="先把照片、語音檔名與餐點描述收進草稿，再交給分析流程做初步拆解。"
        actions={
          <Link href="/dashboard" className="btn btn-secondary">
            看今天總覽
          </Link>
        }
      />

      <Notice
        title="這一版會真的把圖片與音訊送進 backend"
        description="meal ingestion 會先私有保存檔案，再使用同一組 Gemini provider 做音訊轉錄與餐點多模態分析。"
        tone="info"
      />

      {error ? <Notice title="建立餐次失敗" description={error} tone="danger" /> : null}

      <form className="card section-card stack" onSubmit={handleSubmit}>
        <SegmentedControl label="Meal type" value={mealType} onChange={setMealType} options={mealTypeOptions} />

        <div className="form-grid cols-2">
          <Field label="用餐時間">
            <input type="datetime-local" value={eatenAt} onChange={(event) => setEatenAt(event.target.value)} />
          </Field>
          <Field label="餐點照片">
            <input type="file" accept="image/*" onChange={(event) => handleFileSelection(setImageFile, event)} />
          </Field>
          <Field label="語音檔">
            <input type="file" accept="audio/*" onChange={(event) => handleFileSelection(setAudioFile, event)} />
          </Field>
          <Field label="補充文字" hint="可填份量、糖度、去皮或加醬等細節">
            <input value={extraText} onChange={(event) => setExtraText(event.target.value)} placeholder="半碗飯、微糖、去皮、加辣" />
          </Field>
        </div>

        <Field
          label="語音轉錄 / 餐點描述"
          hint="建議固定描述：主食、配菜、飲料、份量，以及是否無糖、半糖、去皮、加醬。"
        >
          <textarea
            value={transcriptText}
            onChange={(event) => setTranscriptText(event.target.value)}
            placeholder="例如：今天中午吃雞腿便當，飯半碗，青菜有高麗菜跟豆干，還有一杯微糖紅茶。"
          />
        </Field>

        <div className="helper-row">
          <span className="muted small">
            選檔後會上傳：{imageFile?.name ?? '未選照片'} / {audioFile?.name ?? '未選音訊'}
          </span>
          <Button type="submit" disabled={submitting}>
            {submitting ? '上傳並分析中...' : '上傳並分析'}
          </Button>
        </div>
      </form>
    </div>
  );
}
