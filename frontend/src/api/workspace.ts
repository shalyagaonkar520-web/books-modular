/** AI Employee Workspace ("Connect to Mobile"): owner controls and the employee's chat. */
import { api, request } from './client';
import type { AuthResponse } from './types';

export type WorkspaceAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

export interface WorkspacePermissions {
  features: Record<string, WorkspaceAction[]>;
  financial: boolean;
}

export interface WorkspaceConfig {
  allowAuto: boolean;
  allowManual: boolean;
  defaultMode: 'auto' | 'manual';
  confirmWrites: boolean;
  context: string;
}

export interface Workspace {
  id: string;
  name: string;
  department: string;
  description: string | null;
  permissions: WorkspacePermissions;
  config: WorkspaceConfig;
  isActive: boolean;
  employeeCount: number;
  statusCounts: Record<InviteStatus, number>;
  createdAt: string;
}

export type InviteStatus = 'pending' | 'accepted' | 'active' | 'revoked';

export interface WorkspaceEmployee {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  name: string;
  email: string;
  jobTitle: string | null;
  status: InviteStatus;
  invitedAt: string;
  inviteExpiresAt: string | null;
  inviteExpired: boolean;
  acceptedAt: string | null;
  lastActiveAt: string | null;
  aiEnabled: boolean;
  allowAuto: boolean;
  allowManual: boolean;
  monthlyBudgetUsd: number | null;
  dailyCallLimit: number | null;
  monthCalls: number;
  monthCostUsd: number;
}

export interface CatalogFeature {
  key: string;
  label: string;
  group: string;
  financial: boolean;
}

export interface WorkspacePreset {
  key: string;
  name: string;
  department: string;
  description: string;
  permissions: WorkspacePermissions;
}

export interface WorkspaceCatalog {
  actions: { key: WorkspaceAction; label: string }[];
  features: CatalogFeature[];
  presets: WorkspacePreset[];
}

export interface AiSettings {
  aiEnabled: boolean;
  monthlyBudgetUsd: number;
  defaultEmployeeBudgetUsd: number;
  defaultDailyCallLimit: number;
  spentThisMonthUsd: number;
  keyConfigured: boolean;
  /** The plan's AI requests this month (requests = null: no cap). */
  allowance: { requests: number | null; used: number; remaining: number | null; hardCounts: number; resetsOn: string };
  model: string;
  visionModel: string;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface UsageReport {
  days: number;
  today: UsageTotals;
  month: UsageTotals;
  period: UsageTotals;
  byEmployee: (UsageTotals & { userId: string; name: string; email: string })[];
  byFeature: (UsageTotals & { feature: string })[];
  daily: { date: string; calls: number; tokens: number; costUsd: number }[];
  answers: { total: number; usedAi: number; withoutAi: number };
  settings: AiSettings;
}

export interface Overview {
  workspaces: number;
  employees: Record<InviteStatus, number>;
  settings: AiSettings;
  emailConfigured: boolean;
}

export interface ActivityEvent {
  at: string | null;
  action: string;
  entity: string;
  summary: string | null;
  user?: string | null;
}

export interface EmployeeActivity {
  employee: WorkspaceEmployee;
  messageCount: number;
  events: ActivityEvent[];
}

export interface WorkspaceInviteInfo {
  name: string;
  email: string;
  organizationName: string;
  workspaceName: string;
  department: string;
}

// ---- employee side -------------------------------------------------------
export interface WorkspaceFeature {
  key: string;
  label: string;
  group: string;
  actions: WorkspaceAction[];
}

export interface WorkspaceMe {
  name: string;
  email: string;
  jobTitle: string | null;
  organizationName: string;
  workspace: { id: string; name: string; department: string; description: string | null };
  features: WorkspaceFeature[];
  financial: boolean;
  modes: { allowAuto: boolean; allowManual: boolean; current: 'auto' | 'manual' };
  ai: { enabled: boolean; configured: boolean; blockedReason: string | null };
  photoUpload: boolean;
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export type Card =
  | { type: 'table'; title: string; columns: string[]; rows: string[][] }
  | { type: 'stats'; title: string; items: { label: string; value: string }[] }
  | { type: 'preview'; title: string; fields: { label: string; value: string }[]; warnings: string[]; lines?: { columns: string[]; rows: string[][] } };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  meta: {
    cards?: Card[];
    tool?: string;
    used_ai?: boolean;
    pending_action_id?: string | null;
    pending_status?: 'draft' | 'ready' | 'done' | 'cancelled' | null;
    done?: boolean;
    attachments?: { id: string; filename: string }[];
    mode?: string;
  };
  /** Local only: the sending of this message is still in flight. */
  sending?: boolean;
}

export interface QuickFact {
  tool: string;
  text: string;
  cards: Card[];
}

const A = '/workspace/admin';

export const workspaceAdminApi = {
  overview: () => api.get<Overview>(`${A}/overview`),
  catalog: () => api.get<WorkspaceCatalog>(`${A}/catalog`),
  workspaces: () => api.get<Workspace[]>(`${A}/workspaces`),
  createWorkspace: (body: Partial<Workspace>) => api.post<Workspace>(`${A}/workspaces`, body),
  updateWorkspace: (id: string, body: Partial<Workspace>) => api.put<Workspace>(`${A}/workspaces/${id}`, body),
  deleteWorkspace: (id: string) => api.delete<void>(`${A}/workspaces/${id}`),
  employees: () => api.get<WorkspaceEmployee[]>(`${A}/employees`),
  invite: (body: { workspaceId: string; email: string; name?: string; jobTitle?: string }) => api.post<WorkspaceEmployee>(`${A}/employees`, body),
  updateEmployee: (id: string, body: Partial<Pick<WorkspaceEmployee, 'name' | 'jobTitle' | 'workspaceId' | 'aiEnabled' | 'allowAuto' | 'allowManual' | 'monthlyBudgetUsd' | 'dailyCallLimit'>>) =>
    api.patch<WorkspaceEmployee>(`${A}/employees/${id}`, body),
  resend: (id: string) => api.post<WorkspaceEmployee>(`${A}/employees/${id}/resend`),
  revoke: (id: string) => api.post<WorkspaceEmployee>(`${A}/employees/${id}/revoke`),
  restore: (id: string) => api.post<WorkspaceEmployee>(`${A}/employees/${id}/restore`),
  deleteEmployee: (id: string) => api.delete<void>(`${A}/employees/${id}`),
  activity: (id: string) => api.get<EmployeeActivity>(`${A}/employees/${id}/activity`),
  audit: () => api.get<ActivityEvent[]>(`${A}/audit`),
  usage: (days = 30) => api.get<UsageReport>(`${A}/usage`, { days }),
  settings: () => api.get<AiSettings>(`${A}/settings`),
  updateSettings: (body: Partial<Pick<AiSettings, 'aiEnabled' | 'monthlyBudgetUsd' | 'defaultEmployeeBudgetUsd' | 'defaultDailyCallLimit'>>) => api.put<AiSettings>(`${A}/settings`, body),
};

export const workspaceApi = {
  inviteInfo: (token: string) => request<WorkspaceInviteInfo>(`/workspace/invite/${encodeURIComponent(token)}`, { retryOnUnauthorized: false }),
  acceptInvite: (body: { token: string; password: string; name?: string }) =>
    request<AuthResponse>('/workspace/invite/accept', { method: 'POST', body, retryOnUnauthorized: false }),
  me: () => api.get<WorkspaceMe>('/workspace/me'),
  setMode: (mode: 'auto' | 'manual') => api.patch<{ mode: string }>('/workspace/me', { mode }),
  quick: () => api.get<QuickFact[]>('/workspace/quick'),
  chats: () => api.get<ChatSummary[]>('/workspace/chats'),
  newChat: () => api.post<ChatSummary>('/workspace/chats'),
  renameChat: (id: string, title: string) => api.patch<{ id: string; title: string }>(`/workspace/chats/${id}`, { title }),
  deleteChat: (id: string) => api.delete<void>(`/workspace/chats/${id}`),
  messages: (id: string) => api.get<ChatMessage[]>(`/workspace/chats/${id}/messages`),
  send: (chatId: string, text: string, files: File[], mode: 'auto' | 'manual') => {
    const form = new FormData();
    form.set('text', text);
    form.set('mode', mode);
    files.forEach((file) => form.append('files', file));
    return api.upload<ChatMessage>(`/workspace/chats/${chatId}/messages`, form);
  },
  confirm: (actionId: string) => api.post<ChatMessage>(`/workspace/actions/${actionId}/confirm`),
  cancel: (actionId: string) => api.post<ChatMessage>(`/workspace/actions/${actionId}/cancel`),
};

/** Fetch a private chat photo through the authenticated API as an object URL. */
export async function fetchAttachmentUrl(id: string): Promise<string> {
  const { getAccessToken } = await import('./client');
  const res = await fetch(`/api/workspace/attachments/${id}`, { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` }, credentials: 'include' });
  if (!res.ok) throw new Error('Could not load the photo');
  return URL.createObjectURL(await res.blob());
}

export interface BuddyState {
  greeting: string;
  firstName: string;
  messages: ChatMessage[];
  ai: { configured: boolean; blockedReason: string | null };
}

/** Buddy: the sidebar helper for the people who run the business. */
export const buddyApi = {
  state: () => api.get<BuddyState>('/buddy/state'),
  send: (text: string) => api.post<ChatMessage>('/buddy/message', { text }),
  sendPhotos: (text: string, files: File[]) => {
    const form = new FormData();
    form.set('text', text);
    files.forEach((file) => form.append('files', file));
    return api.upload<ChatMessage>('/buddy/photo-message', form);
  },
  reset: () => api.post<{ ok: boolean }>('/buddy/reset'),
  confirm: (id: string) => api.post<ChatMessage>(`/buddy/actions/${id}/confirm`),
  cancel: (id: string) => api.post<ChatMessage>(`/buddy/actions/${id}/cancel`),
};
