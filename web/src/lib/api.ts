import type {
  AuthResponse,
  Task,
  CreateTaskDto,
  CreateTaskResponse,
  ClarifyTaskDto,
  TaskEvent,
} from '../types';

const API_BASE = '/api';

async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP error ${response.status}`);
  }

  return response.json();
}

export const api = {
  auth: {
    getMe: () => fetchAPI<AuthResponse>('/auth/me'),
    logout: () =>
      fetchAPI('/auth/logout', {
        method: 'POST',
      }),
  },

  tasks: {
    list: (params?: {
      status?: string;
      repo?: string;
      page?: number;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.repo) query.append('repo', params.repo);
      if (params?.page) query.append('page', String(params.page));
      if (params?.limit) query.append('limit', String(params.limit));

      return fetchAPI<{ tasks: Task[]; total: number; page: number; limit: number }>(
        `/tasks?${query}`,
      );
    },

    get: (id: string) =>
      fetchAPI<Task & { events: TaskEvent[] }>(`/tasks/${id}`),

    create: (data: CreateTaskDto) =>
      fetchAPI<CreateTaskResponse>('/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    clarify: (id: string, data: ClarifyTaskDto) =>
      fetchAPI<Task>(`/tasks/${id}/clarify`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    retry: (id: string) =>
      fetchAPI<Task>(`/tasks/${id}/retry`, {
        method: 'POST',
      }),

    cancel: (id: string) =>
      fetchAPI<void>(`/tasks/${id}`, {
        method: 'DELETE',
      }),
  },
};
