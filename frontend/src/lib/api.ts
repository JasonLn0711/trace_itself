import type { DailyLog, DashboardSummary, Milestone, Project, Task } from '../types';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  handleUnauthorized?: boolean;
};

const API_BASE = '/api';

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, handleUnauthorized = true, ...init } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => undefined) : await response.text().catch(() => undefined);

  if (!response.ok) {
    if (response.status === 401 && handleUnauthorized && typeof window !== 'undefined') {
      window.location.assign('/login');
    }
    throw new ApiError(response.status, normalizeErrorMessage(payload) ?? response.statusText, payload);
  }

  return payload as T;
}

function normalizeErrorMessage(payload: unknown): string | undefined {
  if (!payload) {
    return undefined;
  }
  if (typeof payload === 'string') {
    return payload;
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === 'string') {
      return record.message;
    }
    if (typeof record.detail === 'string') {
      return record.detail;
    }
    if (Array.isArray(record.detail)) {
      return record.detail
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            const detailRecord = item as Record<string, unknown>;
            return typeof detailRecord.msg === 'string' ? detailRecord.msg : undefined;
          }
          return undefined;
        })
        .filter(Boolean)
        .join(', ');
    }
  }
  return undefined;
}

function withQuery(path: string, query?: Record<string, string | number | boolean | null | undefined>) {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function extractApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}

export const authApi = {
  login(password: string) {
    return request<{ ok?: boolean }>('/auth/login', {
      method: 'POST',
      body: { password },
      handleUnauthorized: false
    });
  },
  logout() {
    return request<{ ok?: boolean }>('/auth/logout', {
      method: 'POST',
      handleUnauthorized: false
    });
  },
  me() {
    return request<{ authenticated?: boolean }>('/auth/me', {
      handleUnauthorized: false
    });
  }
};

export const dashboardApi = {
  summary() {
    return request<DashboardSummary>('/dashboard/summary');
  }
};

export const projectsApi = {
  list() {
    return request<Project[]>('/projects');
  },
  get(id: number) {
    return request<Project>(`/projects/${id}`);
  },
  create(body: Partial<Project>) {
    return request<Project>('/projects', {
      method: 'POST',
      body
    });
  },
  update(id: number, body: Partial<Project>) {
    return request<Project>(`/projects/${id}`, {
      method: 'PUT',
      body
    });
  },
  remove(id: number) {
    return request<void>(`/projects/${id}`, {
      method: 'DELETE'
    });
  }
};

export const milestonesApi = {
  list(query?: { project_id?: number }) {
    return request<Milestone[]>(withQuery('/milestones', query));
  },
  get(id: number) {
    return request<Milestone>(`/milestones/${id}`);
  },
  create(body: Partial<Milestone>) {
    return request<Milestone>('/milestones', {
      method: 'POST',
      body
    });
  },
  update(id: number, body: Partial<Milestone>) {
    return request<Milestone>(`/milestones/${id}`, {
      method: 'PUT',
      body
    });
  },
  remove(id: number) {
    return request<void>(`/milestones/${id}`, {
      method: 'DELETE'
    });
  },
  upcoming() {
    return request<Milestone[]>('/milestones/upcoming');
  }
};

export const tasksApi = {
  list(query?: { project_id?: number; milestone_id?: number; status?: string }) {
    return request<Task[]>(withQuery('/tasks', query));
  },
  get(id: number) {
    return request<Task>(`/tasks/${id}`);
  },
  create(body: Partial<Task>) {
    return request<Task>('/tasks', {
      method: 'POST',
      body
    });
  },
  update(id: number, body: Partial<Task>) {
    return request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body
    });
  },
  remove(id: number) {
    return request<void>(`/tasks/${id}`, {
      method: 'DELETE'
    });
  },
  overdue() {
    return request<Task[]>('/tasks/overdue');
  }
};

export const dailyLogsApi = {
  list() {
    return request<DailyLog[]>('/daily-logs');
  },
  get(id: number) {
    return request<DailyLog>(`/daily-logs/${id}`);
  },
  create(body: Partial<DailyLog>) {
    return request<DailyLog>('/daily-logs', {
      method: 'POST',
      body
    });
  },
  update(id: number, body: Partial<DailyLog>) {
    return request<DailyLog>(`/daily-logs/${id}`, {
      method: 'PUT',
      body
    });
  },
  remove(id: number) {
    return request<void>(`/daily-logs/${id}`, {
      method: 'DELETE'
    });
  }
};

