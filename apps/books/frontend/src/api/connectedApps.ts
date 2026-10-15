/**
 * Connected apps (platform admin): other Rooman apps, or a customer's own
 * system, using an organization's Books through the API with a scoped key and
 * receiving its events by signed webhook. See docs/INTEGRATIONS.md.
 */
import { platformClient } from './platformClient';

export interface ConnectableFeature {
  key: string;
  label: string;
  description: string;
  planKeys: string[];
}

export interface ConnectableEvent {
  type: string;
  /** The feature whose read permission an app needs to receive it. */
  feature: string;
}

export interface ConnectedAppsCatalog {
  features: ConnectableFeature[];
  events: ConnectableEvent[];
}

export interface ConnectedApp {
  id: string;
  organizationId: string;
  name: string;
  /** Start of the key (rbk_xxxxxxxx), to tell keys apart; the key itself is never shown again. */
  keyPrefix: string;
  /** e.g. ["invoices:read", "invoices:write"]. */
  scopes: string[];
  events: string[];
  webhookUrl: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  pendingDeliveries: number;
  failedDeliveries: number;
}

/** Shown once: what the platform admin hands to the app's developer. */
export interface ConnectedAppSecrets {
  connection: ConnectedApp;
  apiKey: string | null;
  webhookSecret: string | null;
}

export interface ConnectedAppInput {
  name: string;
  scopes: string[];
  events: string[];
  webhookUrl: string | null;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'dead';

export interface WebhookDelivery {
  id: string;
  eventId: string;
  eventType: string;
  entityId: string | null;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface WebhookTestResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
}

export const connectedAppsApi = {
  catalog: (signal?: AbortSignal) => platformClient.get<ConnectedAppsCatalog>('/platform/connected-apps/catalog', undefined, signal),
  list: (orgId: string, signal?: AbortSignal) =>
    platformClient.get<ConnectedApp[]>(`/platform/organizations/${orgId}/connected-apps`, undefined, signal),
  create: (orgId: string, body: ConnectedAppInput) =>
    platformClient.post<ConnectedAppSecrets>(`/platform/organizations/${orgId}/connected-apps`, body),
  update: (id: string, body: Partial<ConnectedAppInput>) => platformClient.patch<ConnectedApp>(`/platform/connected-apps/${id}`, body),
  rotateKey: (id: string) => platformClient.post<ConnectedAppSecrets>(`/platform/connected-apps/${id}/rotate-key`),
  rotateSecret: (id: string) => platformClient.post<ConnectedAppSecrets>(`/platform/connected-apps/${id}/rotate-secret`),
  revoke: (id: string) => platformClient.post<ConnectedApp>(`/platform/connected-apps/${id}/revoke`),
  testWebhook: (id: string) => platformClient.post<WebhookTestResult>(`/platform/connected-apps/${id}/test-webhook`),
  deliveries: (id: string, status?: DeliveryStatus, signal?: AbortSignal) =>
    platformClient.get<WebhookDelivery[]>(`/platform/connected-apps/${id}/deliveries`, status ? { status } : undefined, signal),
  resend: (deliveryId: string) => platformClient.post<WebhookDelivery>(`/platform/webhook-deliveries/${deliveryId}/resend`),
};

/** "invoices:write" also gives "invoices:read" (the server adds it too). */
export function withImpliedReads(scopes: Iterable<string>): string[] {
  const out = new Set(scopes);
  [...out].forEach((scope) => {
    if (scope.endsWith(':write')) out.add(scope.replace(/:write$/, ':read'));
  });
  return [...out];
}
