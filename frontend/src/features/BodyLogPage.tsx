'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Card, Field, Notice, PageIntro, Sparkline } from '../components/Primitives';
import { bodyLogsApi, extractApiErrorMessage } from '../lib/api';
import { formatMetric, toOptionalNumber } from '../lib/nutrition';
import type { BodyLog } from '../types';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function BodyLogPage() {
  const [logs, setLogs] = useState<BodyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logDate, setLogDate] = useState(todayInputValue());
  const [weightKg, setWeightKg] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await bodyLogsApi.list({ limit: 60 });
        if (!active) {
          return;
        }
        setLogs(response);
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

  const weightValues = useMemo(
    () => logs.slice().reverse().map((item) => item.weight_kg).filter((value): value is number => value !== null),
    [logs]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const created = await bodyLogsApi.create({
        log_date: logDate,
        weight_kg: toOptionalNumber(weightKg),
        body_fat_pct: toOptionalNumber(bodyFatPct),
        notes: notes || null
      });
      setLogs((current) => [created, ...current].sort((left, right) => right.log_date.localeCompare(left.log_date)));
      setNotes('');
      setWeightKg('');
      setBodyFatPct('');
    } catch (submitError) {
      setError(extractApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await bodyLogsApi.remove(id);
      setLogs((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      setError(extractApiErrorMessage(deleteError));
    }
  }

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Body Log"
        title="紀錄體重與身體狀態"
        description="把體重曲線接進飲食追蹤後，你就能開始看出熱量與體重變化是不是同方向。"
      />

      {error ? <Notice title="Body log 操作失敗" description={error} tone="danger" /> : null}

      <div className="grid two">
        <Card className="section-card">
          <div className="section-header">
            <div>
              <h2>新增紀錄</h2>
              <p className="muted">同一天只能有一筆紀錄。</p>
            </div>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <div className="form-grid cols-2">
              <Field label="日期">
                <input type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} />
              </Field>
              <Field label="體重 (kg)">
                <input value={weightKg} onChange={(event) => setWeightKg(event.target.value)} inputMode="decimal" />
              </Field>
              <Field label="體脂 (%)">
                <input value={bodyFatPct} onChange={(event) => setBodyFatPct(event.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <Field label="備註">
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：睡不好、水腫、今天訓練量高" />
            </Field>
            <div className="helper-row">
              <span className="muted small">{saving ? '儲存中...' : '建立後也會同步更新 profile 的目前體重。'}</span>
              <Button type="submit" disabled={saving}>
                {saving ? '儲存中...' : '新增紀錄'}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="section-card">
          <div className="section-header">
            <div>
              <h2>近期趨勢</h2>
              <p className="muted">{loading ? '載入中...' : '最近的體重折線會顯示在這裡。'}</p>
            </div>
          </div>
          {weightValues.length >= 2 ? <Sparkline values={weightValues} colorClass="success" /> : <p className="muted">至少需要兩筆體重資料才會顯示趨勢。</p>}
        </Card>
      </div>

      <Card className="section-card">
        <div className="section-header">
          <div>
            <h2>歷史紀錄</h2>
            <p className="muted">由新到舊排列。</p>
          </div>
        </div>
        <div className="stack">
          {logs.map((item) => (
            <div key={item.id} className="entity card">
              <div className="entity-top">
                <div>
                  <h3 className="entity-title">{item.log_date}</h3>
                  <p className="muted small">{item.notes ?? '沒有備註'}</p>
                </div>
                <strong>{item.weight_kg === null ? '--' : `${formatMetric(item.weight_kg, 1)} kg`}</strong>
              </div>
              <div className="helper-row">
                <span className="muted small">體脂 {item.body_fat_pct === null ? '--' : `${formatMetric(item.body_fat_pct, 1)} %`}</span>
                <Button type="button" variant="ghost" onClick={() => void handleDelete(item.id)}>
                  刪除
                </Button>
              </div>
            </div>
          ))}
          {!logs.length && !loading ? (
            <div className="empty-state">
              <h3>還沒有 body log</h3>
              <p className="muted">先新增第一筆體重紀錄，之後 dashboard 才會開始畫出趨勢。</p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
