import type {
  AccessGroup,
  AccessGroupInput,
  AIProvider,
  AIProviderInput,
  AsrTranscript,
  AsrTranscriptSummary,
  LiveAsrSessionSnapshot,
  DailyLog,
  DashboardSummary,
  MeetingRecord,
  MeetingRecordSummary,
  Milestone,
  ProductUpdate,
  Project,
  Task,
  User,
  UserCreateInput,
  UserPasswordResetInput,
  UserSession,
  UserUpdateInput,
  UsagePolicy,
  UsagePolicyInput,
  UsagePolicySnapshot
} from '../types';

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

async function requestForm<T>(
  path: string,
  formData: FormData,
  options: Omit<RequestOptions, 'body'> = {}
): Promise<T> {
  const { headers, handleUnauthorized = true, ...init } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(headers ?? {})
    },
    body: formData
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

async function requestBinary<T>(
  path: string,
  body: ArrayBuffer | Uint8Array,
  options: Omit<RequestOptions, 'body'> = {}
): Promise<T> {
  const { headers, handleUnauthorized = true, ...init } = options;
  const binaryBody = body instanceof Uint8Array ? body.slice().buffer : body;
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(headers ?? {})
    },
    body: binaryBody
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
  login(username: string, password: string) {
    return request<UserSession>('/auth/login', {
      method: 'POST',
      body: { username, password },
      handleUnauthorized: false
    });
  },
  logout() {
    return request<UserSession>('/auth/logout', {
      method: 'POST',
      handleUnauthorized: false
    });
  },
  me() {
    return request<UserSession>('/auth/me', {
      handleUnauthorized: false
    });
  }
};

export const asrApi = {
  list(query?: { limit?: number }) {
    return request<AsrTranscriptSummary[]>(withQuery('/asr/transcripts', query));
  },
  get(id: number) {
    return request<AsrTranscript>(`/asr/transcripts/${id}`);
  },
  audioUrl(id: number) {
    return `${API_BASE}/asr/transcripts/${id}/audio`;
  },
  transcribe(input: { file: File; title?: string; language?: string; provider_id?: number | null }) {
    const formData = new FormData();
    formData.append('file', input.file);
    if (input.title?.trim()) {
      formData.append('title', input.title.trim());
    }
    if (input.language?.trim()) {
      formData.append('language', input.language.trim());
    }
    if (input.provider_id) {
      formData.append('provider_id', String(input.provider_id));
    }
    return requestForm<AsrTranscript>('/asr/transcripts', formData, {
      method: 'POST'
    });
  },
  createLiveSession(input?: { language?: string; provider_id?: number | null }) {
    return request<LiveAsrSessionSnapshot>('/asr/live-sessions', {
      method: 'POST',
      body: {
        language: input?.language?.trim() || null,
        provider_id: input?.provider_id ?? null
      }
    });
  },
  pushLiveChunk(sessionId: string, chunk: ArrayBuffer | Uint8Array) {
    return requestBinary<LiveAsrSessionSnapshot>(`/asr/live-sessions/${sessionId}/chunks`, chunk, {
      method: 'POST'
    });
  },
  finalizeLiveSession(sessionId: string) {
    return request<LiveAsrSessionSnapshot>(`/asr/live-sessions/${sessionId}/finalize`, {
      method: 'POST'
    });
  },
  persistLiveSession(input: { session_id: string; file: File; title?: string }) {
    const formData = new FormData();
    formData.append('file', input.file);
    if (input.title?.trim()) {
      formData.append('title', input.title.trim());
    }
    return requestForm<AsrTranscript>(`/asr/live-sessions/${input.session_id}/persist`, formData, {
      method: 'POST'
    });
  },
  discardLiveSession(sessionId: string) {
    return request<void>(`/asr/live-sessions/${sessionId}`, {
      method: 'DELETE'
    });
  },
  remove(id: number) {
    return request<void>(`/asr/transcripts/${id}`, {
      method: 'DELETE'
    });
  }
};

export const meetingsApi = {
  list(query?: { limit?: number }) {
    return request<MeetingRecordSummary[]>(withQuery('/meetings', query));
  },
  get(id: number) {
    return request<MeetingRecord>(`/meetings/${id}`);
  },
  audioUrl(id: number) {
    return `${API_BASE}/meetings/${id}/audio`;
  },
  create(input: {
    file: File;
    title?: string;
    language?: string;
    asr_provider_id?: number | null;
    llm_provider_id?: number | null;
  }) {
    const formData = new FormData();
    formData.append('file', input.file);
    if (input.title?.trim()) {
      formData.append('title', input.title.trim());
    }
    if (input.language?.trim()) {
      formData.append('language', input.language.trim());
    }
    if (input.asr_provider_id) {
      formData.append('asr_provider_id', String(input.asr_provider_id));
    }
    if (input.llm_provider_id) {
      formData.append('llm_provider_id', String(input.llm_provider_id));
    }
    return requestForm<MeetingRecord>('/meetings', formData, {
      method: 'POST'
    });
  },
  remove(id: number) {
    return request<void>(`/meetings/${id}`, {
      method: 'DELETE'
    });
  }
};

export const dashboardApi = {
  summary() {
    return request<DashboardSummary>('/dashboard/summary');
  }
};

export const usersApi = {
  list() {
    return request<User[]>('/users');
  },
  create(body: UserCreateInput) {
    return request<User>('/users', {
      method: 'POST',
      body
    });
  },
  update(id: number, body: UserUpdateInput) {
    return request<User>(`/users/${id}`, {
      method: 'PUT',
      body
    });
  },
  resetPassword(id: number, body: UserPasswordResetInput) {
    return request<User>(`/users/${id}/reset-password`, {
      method: 'POST',
      body
    });
  },
  unlock(id: number) {
    return request<User>(`/users/${id}/unlock`, {
      method: 'POST'
    });
  }
};

export const accessGroupsApi = {
  list() {
    return request<AccessGroup[]>('/access-groups');
  },
  create(body: AccessGroupInput) {
    return request<AccessGroup>('/access-groups', {
      method: 'POST',
      body
    });
  },
  update(id: number, body: Partial<AccessGroupInput>) {
    return request<AccessGroup>(`/access-groups/${id}`, {
      method: 'PUT',
      body
    });
  },
  remove(id: number) {
    return request<void>(`/access-groups/${id}`, {
      method: 'DELETE'
    });
  }
};

export const aiProvidersApi = {
  list(query?: { kind?: string; include_inactive?: boolean }) {
    return request<AIProvider[]>(withQuery('/ai-providers', query));
  },
  create(body: AIProviderInput) {
    return request<AIProvider>('/ai-providers', {
      method: 'POST',
      body
    });
  },
  update(id: number, body: Partial<AIProviderInput>) {
    return request<AIProvider>(`/ai-providers/${id}`, {
      method: 'PUT',
      body
    });
  },
  remove(id: number) {
    return request<void>(`/ai-providers/${id}`, {
      method: 'DELETE'
    });
  }
};

export const usagePolicyApi = {
  get() {
    return request<UsagePolicySnapshot>('/usage-policy');
  },
  update(body: UsagePolicyInput) {
    return request<UsagePolicy>('/usage-policy', {
      method: 'PUT',
      body
    });
  }
};

export const productUpdatesApi = {
  list(query?: { area?: string; change_type?: string; limit?: number }) {
    return request<ProductUpdate[]>(withQuery('/product-updates', query));
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
