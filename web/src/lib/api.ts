import type {
  AuthResponse,
  Task,
  CreateTaskDto,
  CreateTaskResponse,
  ClarifyTaskDto,
  TaskEvent,
  User,
  UpdateUserDto,
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

  if (response.status === 403) {
    throw new Error('Forbidden');
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

  users: {
    list: (params?: { status?: string; role?: string }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.role) query.append('role', params.role);

      return fetchAPI<{ users: User[] }>(`/users?${query}`);
    },

    listPending: () => fetchAPI<{ users: User[] }>('/users/pending'),

    get: (id: string) => fetchAPI<User>(`/users/${id}`),

    update: (id: string, data: UpdateUserDto) =>
      fetchAPI<User>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    approve: (id: string) =>
      fetchAPI<User>(`/users/${id}/approve`, {
        method: 'POST',
      }),

    deactivate: (id: string) =>
      fetchAPI<User>(`/users/${id}/deactivate`, {
        method: 'POST',
      }),

    makeAdmin: (id: string) =>
      fetchAPI<User>(`/users/${id}/make-admin`, {
        method: 'POST',
      }),

    makeDeveloper: (id: string) =>
      fetchAPI<User>(`/users/${id}/make-developer`, {
        method: 'POST',
      }),
  },

  repos: {
    list: (includeStats = false) =>
      fetchAPI<{ repos: any[]; total: number }>(
        `/repos${includeStats ? '?includeStats=true' : ''}`,
      ),

    available: () =>
      fetchAPI<{ repos: any[]; total: number }>('/repos/available'),

    add: (repoName: string, defaultAgent?: string) =>
      fetchAPI<any>('/repos', {
        method: 'POST',
        body: JSON.stringify({ repoName, defaultAgent }),
      }),

    remove: (id: string) =>
      fetchAPI<any>(`/repos/${id}`, {
        method: 'DELETE',
      }),

    getSettings: (id: string) => fetchAPI<any>(`/repos/${id}/settings`),

    updateSettings: (id: string, data: { defaultAgent?: string; customSystemPrompt?: string }) =>
      fetchAPI<any>(`/repos/${id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    getStats: (id: string) => fetchAPI<any>(`/repos/${id}/stats`),
  },

  templates: {
    list: (params?: {
      type?: string;
      repo?: string;
      search?: string;
      sort?: string;
      page?: number;
      limit?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.type) query.append('type', params.type);
      if (params?.repo) query.append('repo', params.repo);
      if (params?.search) query.append('search', params.search);
      if (params?.sort) query.append('sort', params.sort);
      if (params?.page) query.append('page', String(params.page));
      if (params?.limit) query.append('limit', String(params.limit));

      return fetchAPI<{
        templates: any[];
        total: number;
        page: number;
        limit: number;
      }>(`/templates?${query}`);
    },

    get: (id: string) => fetchAPI<any>(`/templates/${id}`),

    create: (data: any) =>
      fetchAPI<any>('/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: any) =>
      fetchAPI<any>(`/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      fetchAPI<void>(`/templates/${id}`, {
        method: 'DELETE',
      }),

    apply: (id: string, variables: Record<string, any>) =>
      fetchAPI<{
        templateId: string;
        description: string;
        repo?: string;
        taskType?: string;
        priority?: string;
        filesHint?: string[];
        acceptanceCriteria?: string[];
      }>(`/templates/${id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ variables }),
      }),

    favorite: (id: string) =>
      fetchAPI<{ favorited: boolean; favoriteCount: number }>(
        `/templates/${id}/favorite`,
        {
          method: 'POST',
        },
      ),

    unfavorite: (id: string) =>
      fetchAPI<{ favorited: boolean; favoriteCount: number }>(
        `/templates/${id}/favorite`,
        {
          method: 'DELETE',
        },
      ),
  },
};
