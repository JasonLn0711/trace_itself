export type PrimitiveStatus = string;
export type PrimitivePriority = string;

export type UserRole = 'admin' | 'member';

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
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  active_projects: Project[];
  today_tasks: Task[];
  overdue_tasks: Task[];
  upcoming_milestones: Milestone[];
  recent_daily_logs: DailyLog[];
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
  is_active: boolean;
  password: string;
}

export interface UserUpdateInput {
  display_name?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface UserPasswordResetInput {
  password: string;
}

export interface ApiErrorPayload {
  detail?: unknown;
  message?: string;
}
