export interface BusinessEvent {
  id: string;
  source: string;
  rawText: string;
  eventType: string;
  amount: number;
  currency: string;
  extractedData: Record<string, any>;
  confidence: number;
  status: 'auto_processed' | 'needs_review' | 'approved' | 'rejected' | 'overridden';
  reviewReason?: string | null;
  createdAt: string;
}

export interface NeedsAttentionItem {
  id: string;
  type: string;
  severity: 'critical' | 'attention' | 'recommendation' | 'info';
  title: string;
  description: string;
  amount: number;
  targetId?: string | null;
  targetModule: string;
  actions: string[];
}

export interface AutomationMetrics {
  automationScore: number;
  processedTodayCount: number;
  reconciledCount: number;
  categorizedCount: number;
  alertsCount: number;
  activeRulesCount: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  triggerEvent: string;
  conditionField: string;
  operator: string;
  conditionValue: string;
  actionType: string;
  actionValue: string;
  isActive: boolean;
  executionCount: number;
  createdAt: string;
}

export interface BankReconciliation {
  id: string;
  bankTransDate: string;
  bankDescription: string;
  bankAmount: number;
  transType: 'credit' | 'debit';
  matchedEntityType?: string | null;
  matchedEntityId?: string | null;
  matchedEntityName?: string | null;
  confidence: number;
  status: 'auto_reconciled' | 'suggested' | 'confirmed' | 'unmatched' | 'rejected';
  reconciledAt?: string | null;
}

export interface AuditLog {
  id: string;
  eventId?: string | null;
  action: string;
  actor: string;
  rationale: string;
  confidence: number;
  status: string;
  timestamp: string;
}

export interface AssistantQueryResponse {
  intent: string;
  reply: string;
  data?: any;
  actionType?: string | null;
  actionLabel?: string | null;
  actionPayload?: Record<string, any> | null;
}

export interface JournalLine {
  id?: string;
  account: string;
  debit: number;
  credit: number;
  notes?: string | null;
}

export interface JournalEntry {
  id: string;
  eventId?: string | null;
  referenceNo?: string | null;
  date: string;
  description: string;
  source: string;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  createdAt: string;
  lines: JournalLine[];
}

export interface TrialBalanceAccount {
  account: string;
  debit: number;
  credit: number;
  net: number;
}

export interface TrialBalance {
  asOf: string;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  accounts: TrialBalanceAccount[];
}
