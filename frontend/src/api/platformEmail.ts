/** Outbound email (SMTP) for the whole platform: platform admins only. */
import { platformClient } from './platformClient';
import type { Message, SmtpSettings } from './types';

export interface SmtpSettingsInput {
  host: string;
  port: number;
  username: string;
  /** Omit to keep the stored password (only for the same server and account). */
  password?: string;
  senderName: string;
}

export const platformEmailApi = {
  get: (signal?: AbortSignal) => platformClient.get<SmtpSettings>('/platform/settings/smtp', undefined, signal),
  update: (body: SmtpSettingsInput) => platformClient.put<SmtpSettings>('/platform/settings/smtp', body),
  sendTest: (toEmail: string) => platformClient.post<Message>('/platform/settings/smtp/test', { toEmail }),
};
