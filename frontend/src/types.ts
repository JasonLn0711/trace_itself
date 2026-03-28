export type PrimitiveStatus = string;
export type PrimitivePriority = string;
export type ProductUpdateType = 'build' | 'fix' | 'update' | 'security';
export type AIProviderKind = 'asr' | 'llm';
export type AIProviderDriver = 'local_breeze' | 'gemini';
export type AuditEventType = 'login_success' | 'login_failed' | 'logout' | 'page_view';

export type UserRole = 'admin' | 'member';

export interface UserCapabilities {
  project_tracer: boolean;
  asr: boolean;
  llm: boolean;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  priority: PrimitivePriority;
  status: PrimitiveStatus;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  status: PrimitiveStatus;
  progress: number | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  milestone_id: number | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: PrimitivePriority;
  status: PrimitiveStatus;
  estimated_hours: number | null;
  actual_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface DailyLog {
  id: number;
  log_date: string;
  summary: string | null;
  blockers: string | null;
  next_step: string | null;
  total_focus_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  access_group_id: number | null;
  access_group_name: string | null;
  max_concurrent_sessions: number;
  active_session_count: number;
  capabilities: UserCapabilities;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductUpdate {
  id: number;
  version_tag: string | null;
  title: string;
  summary: string;
  details: string | null;
  area: string;
  change_type: ProductUpdateType;
  changed_at: string;
  is_pinned: boolean;
  author_user_id: number | null;
  author_display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: number;
  user_id: number | null;
  username: string | null;
  display_name: string | null;
  event_type: AuditEventType | string;
  path: string | null;
  description: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AsrTranscriptSummary {
  id: number;
  title: string;
  original_filename: string;
  audio_mime_type: string | null;
  language: string | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  model_name: string;
  capture_mode: 'live' | 'file';
  live_entry_count: number;
  speaker_diarization_enabled: boolean;
  speaker_count: number | null;
  excerpt: string;
  created_at: string;
  updated_at: string;
}

export interface AsrTranscriptEntry {
  id: string;
  recorded_at: string | null;
  speaker_label: string | null;
  started_at_seconds: number | null;
  ended_at_seconds: number | null;
  text: string;
}

export interface AsrTranscript {
  id: number;
  title: string;
  original_filename: string;
  audio_mime_type: string | null;
  language: string | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  model_name: string;
  capture_mode: 'live' | 'file';
  transcript_text: string;
  transcript_entries: AsrTranscriptEntry[];
  speaker_diarization_enabled: boolean;
  speaker_count: number | null;
  speaker_diarization_model_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveAsrTranscriptEntry {
  id: string;
  recorded_at: string;
  text: string;
}

export interface LiveAsrSessionSnapshot {
  session_id: string;
  state: string;
  language: string | null;
  duration_seconds: number;
  level: number;
  committed_text: string;
  partial_text: string;
  preview_text: string;
  entries: LiveAsrTranscriptEntry[];
  partial_entry: LiveAsrTranscriptEntry | null;
  model_name: string;
  final_ready: boolean;
}

export interface MeetingRecordSummary {
  id: number;
  project_id: number | null;
  project_name: string | null;
  title: string;
  audio_filename: string;
  audio_mime_type: string | null;
  file_size_bytes: number;
  language: string | null;
  duration_seconds: number | null;
  summary_text: string;
  action_items_text: string;
  asr_model_name: string;
  speaker_diarization_enabled: boolean;
  speaker_count: number | null;
  llm_model_name: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingTranscriptEntry {
  id: string;
  speaker_label: string | null;
  started_at_seconds: number | null;
  ended_at_seconds: number | null;
  text: string;
}

export interface MeetingRecord {
  id: number;
  project_id: number | null;
  project_name: string | null;
  title: string;
  audio_filename: string;
  audio_mime_type: string | null;
  file_size_bytes: number;
  language: string | null;
  duration_seconds: number | null;
  transcript_text: string;
  transcript_entries: MeetingTranscriptEntry[];
  minutes_text: string;
  summary_text: string;
  action_items_text: string;
  asr_model_name: string;
  speaker_diarization_enabled: boolean;
  speaker_count: number | null;
  speaker_diarization_model_name: string | null;
  llm_model_name: string;
  created_at: string;
  updated_at: string;
}

export interface AccessGroup {
  id: number;
  name: string;
  description: string | null;
  can_use_project_tracer: boolean;
  can_use_asr: boolean;
  can_use_llm: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface AccessGroupInput {
  name: string;
  description?: string | null;
  can_use_project_tracer: boolean;
  can_use_asr: boolean;
  can_use_llm: boolean;
}

export interface AIProvider {
  id: number;
  name: string;
  kind: AIProviderKind;
  driver: AIProviderDriver;
  model_name: string;
  base_url: string | null;
  description: string | null;
  is_active: boolean;
  has_api_key: boolean;
  api_key_hint: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIProviderInput {
  name: string;
  kind: AIProviderKind;
  driver: AIProviderDriver;
  model_name: string;
  base_url?: string | null;
  description?: string | null;
  is_active: boolean;
  api_key?: string | null;
}

export interface UsagePolicy {
  id: number;
  llm_runs_per_24h: number;
  max_audio_seconds_per_request: number;
  created_at: string;
  updated_at: string;
}

export interface UsageSummary {
  llm_runs_last_24h: number;
  llm_runs_remaining: number;
  audio_seconds_last_24h: number;
  window_hours: number;
}

export interface UsagePolicySnapshot {
  policy: UsagePolicy;
  usage: UsageSummary;
}

export interface UsagePolicyInput {
  llm_runs_per_24h: number;
  max_audio_seconds_per_request: number;
}

export interface DashboardSummary {
  active_projects: Project[];
  today_tasks: Task[];
  overdue_tasks: Task[];
  upcoming_milestones: Milestone[];
  recent_daily_logs: DailyLog[];
  recent_product_updates?: ProductUpdate[];
  project_progress?: ProjectProgressItem[];
  task_status_breakdown?: TaskStatusBreakdownItem[];
  focus_hours_trend?: FocusHoursTrendItem[];
}

export interface DashboardTimelineMilestone {
  id: number;
  project_id: number;
  title: string;
  start_date: string;
  due_date: string;
  status: PrimitiveStatus;
  progress: number;
}

export interface DashboardTimelineProject {
  id: number;
  name: string;
  status: PrimitiveStatus;
  start_date: string | null;
  target_date: string | null;
  milestones: DashboardTimelineMilestone[];
}

export interface DashboardTimeline {
  today: string;
  window_start: string;
  window_end: string;
  projects: DashboardTimelineProject[];
}

export interface DashboardNextActionItem {
  action_title: string;
  project_id: number | null;
  project_name: string | null;
  entity_type: string;
  entity_id: number | null;
  reason: string;
  urgency_score: number;
  due_date: string | null;
  status: PrimitiveStatus | null;
  route: string;
}

export interface DashboardNextActions {
  items: DashboardNextActionItem[];
}

export interface DashboardStagnationAlert {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  project_id: number | null;
  project_name: string | null;
  entity_type: string;
  entity_id: number | null;
  route: string;
  due_date?: string | null;
  last_activity_at?: string | null;
  days_since_activity?: number | null;
  progress?: number | null;
}

export interface DashboardProjectHealthItem {
  project_id: number;
  project_name: string;
  status: PrimitiveStatus;
  target_date: string | null;
  completion_percent: number;
  open_tasks: number;
  overdue_tasks: number;
  last_activity_at: string | null;
  last_completion_at: string | null;
  days_since_activity: number | null;
  health: string;
  note: string;
}

export interface DashboardStagnation {
  alerts: DashboardStagnationAlert[];
  project_health: DashboardProjectHealthItem[];
  tracking_notes: string[];
}

export interface DashboardRealityGapTrendPoint {
  label: string;
  week_start: string;
  planned_tasks: number;
  completed_tasks: number;
}

export interface DashboardRealityGap {
  planned_tasks_this_week: number;
  completed_tasks_this_week: number;
  weekly_completion_rate: number;
  estimated_hours_this_week: number;
  actual_hours_this_week: number;
  overdue_ratio: number;
  delay_rate: number;
  trend: DashboardRealityGapTrendPoint[];
}

export interface DashboardWeeklyReview {
  completed_tasks_this_week: number;
  overdue_tasks: number;
  most_active_project: string | null;
  most_active_project_id: number | null;
  inactive_projects: string[];
  total_focus_hours: number;
  focus_days_logged: number;
  biggest_progress: string | null;
  biggest_blocker: string | null;
  summary_text: string;
}

export interface DashboardActivityFeedItem {
  id: string;
  event_type: string;
  title: string;
  detail: string | null;
  entity_type: string;
  entity_id: number | null;
  project_id: number | null;
  project_name: string | null;
  changed_at: string;
  route: string;
  tone: string;
}

export interface DashboardActivityFeed {
  items: DashboardActivityFeedItem[];
}

export interface ProjectProgressItem {
  project_id: number;
  project_name: string;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  completion_percent: number;
}

export interface TaskStatusBreakdownItem {
  status: PrimitiveStatus;
  count: number;
}

export interface FocusHoursTrendItem {
  log_date: string;
  total_focus_hours: number;
}

export interface UserSession {
  authenticated: boolean;
  user?: User | null;
}

export interface UserCreateInput {
  username: string;
  display_name: string;
  role: UserRole;
  access_group_id?: number | null;
  max_concurrent_sessions: number;
  is_active: boolean;
  password: string;
}

export interface UserUpdateInput {
  display_name?: string;
  role?: UserRole;
  access_group_id?: number | null;
  max_concurrent_sessions?: number;
  is_active?: boolean;
}

export interface UserPasswordResetInput {
  password: string;
}

export interface ApiErrorPayload {
  detail?: unknown;
  message?: string;
}
