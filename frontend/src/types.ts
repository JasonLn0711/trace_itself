export type PrimitiveStatus = string;
export type PrimitivePriority = string;
export type ProductUpdateType = 'build' | 'fix' | 'update' | 'security';
export type AIProviderKind = 'asr' | 'llm';
export type AIProviderDriver = 'local_breeze' | 'gemini';

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

export interface AsrTranscriptSummary {
  id: number;
  title: string;
  original_filename: string;
  audio_mime_type: string | null;
  language: string | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  model_name: string;
  excerpt: string;
  created_at: string;
  updated_at: string;
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
  transcript_text: string;
  created_at: string;
  updated_at: string;
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
  model_name: string;
  final_ready: boolean;
}

export interface MeetingRecordSummary {
  id: number;
  title: string;
  audio_filename: string;
  audio_mime_type: string | null;
  file_size_bytes: number;
  language: string | null;
  duration_seconds: number | null;
  summary_text: string;
  action_items_text: string;
  asr_model_name: string;
  llm_model_name: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingRecord {
  id: number;
  title: string;
  audio_filename: string;
  audio_mime_type: string | null;
  file_size_bytes: number;
  language: string | null;
  duration_seconds: number | null;
  transcript_text: string;
  minutes_text: string;
  summary_text: string;
  action_items_text: string;
  asr_model_name: string;
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
  is_active: boolean;
  password: string;
}

export interface UserUpdateInput {
  display_name?: string;
  role?: UserRole;
  access_group_id?: number | null;
  is_active?: boolean;
}

export interface UserPasswordResetInput {
  password: string;
}

export interface ApiErrorPayload {
  detail?: unknown;
  message?: string;
}
