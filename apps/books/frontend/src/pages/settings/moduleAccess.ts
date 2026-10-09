import { APP_MODULES } from '@/api/appContent';

/**
 * Modules whose changes the server checks per user (backend deps.require_module).
 * The others are view-only pages (dashboards, reports) or payments that are not
 * gated per user, so they are not offered when choosing what someone can edit.
 */
export const EDITABLE_MODULE_KEYS = [
  'items',
  'customers',
  'vendors',
  'invoices',
  'bills',
  'expenses',
  'banking',
  'accounting',
  'timeTracking',
  'documents',
  'payroll',
];

/** The editable modules with their labels, in app order. */
export const EDITABLE_MODULES = APP_MODULES.filter((module) => EDITABLE_MODULE_KEYS.includes(module.key));
