"""
FastAPI router for Business Automation & Intelligence Engine:
- Universal Event Intake & Normalization
- Needs Attention Exception Queue
- Natural Language Assistant Queries
- Automation Rules & Toggle
- Smart Bank Reconciliation
- Double-Entry General Ledger & Trial Balance (Accountant Mode)
- Audit Trail & Learning Memory
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from backend.models import (
    BusinessEventInput,
    BusinessEventResponse,
    JournalEntryResponse,
    TrialBalanceResponse,
    AutomationRuleModel,
    BankReconciliationResponse,
    AuditLogResponse,
    NeedsAttentionItem,
    AutomationMetricsResponse,
    AssistantQueryRequest,
    AssistantQueryResponse,
)
from backend.database import (
    get_business_events,
    get_general_ledger,
    get_trial_balance,
    get_automation_rules,
    toggle_automation_rule,
    get_bank_reconciliations,
    confirm_bank_match,
    get_audit_logs,
    get_ai_learnings,
    get_ai_insights,
    get_needs_attention_items,
    get_automation_metrics,
)
from backend.services.event_engine import EventEngine
from backend.services.assistant_service import AssistantService

router = APIRouter(prefix="/api/automation", tags=["Automation Engine"])


@router.post("/event/process", response_model=Dict[str, Any])
def process_incoming_business_event(event_input: BusinessEventInput):
    """Processes an incoming business event from text, upload, or API."""
    try:
        result = EventEngine.process_event(
            source=event_input.source,
            raw_text=event_input.raw_text,
            event_data=event_input.extracted_data,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/events", response_model=List[BusinessEventResponse])
def get_recent_events(limit: int = Query(50, ge=1, le=200), status: Optional[str] = None):
    """Retrieves recent business events."""
    return get_business_events(limit=limit, status=status)


@router.get("/attention", response_model=List[NeedsAttentionItem])
def get_attention_exceptions():
    """Returns the prioritized list of exceptions requiring business-owner attention."""
    return get_needs_attention_items()


@router.post("/attention/{item_id}/action")
def take_attention_action(item_id: str, action: str = Query("dismiss")):
    """Handles 1-click user actions on exceptions (confirm, dismiss, approve)."""
    if "bank" in item_id and action == "confirm":
        clean_id = item_id.replace("att-bank-sug-", "").replace("att-bank-", "")
        confirm_bank_match(clean_id)
        return {"status": "success", "message": "Bank match confirmed and settled."}
    return {"status": "success", "message": f"Action '{action}' processed for {item_id}."}


@router.get("/metrics", response_model=AutomationMetricsResponse)
def get_metrics():
    """Returns live automation score and throughput counts."""
    return get_automation_metrics()


@router.get("/rules", response_model=List[AutomationRuleModel])
def list_rules():
    """Lists all configured IF-THEN automation rules."""
    return get_automation_rules()


@router.put("/rules/{rule_id}/toggle", response_model=AutomationRuleModel)
def toggle_rule(rule_id: str, active: bool = Query(True)):
    """Toggles rule active state."""
    updated = toggle_automation_rule(rule_id, active)
    if not updated:
        raise HTTPException(status_code=404, detail="Rule not found")
    return updated


@router.get("/reconciliations", response_model=List[BankReconciliationResponse])
def list_reconciliations(status: Optional[str] = None):
    """Returns bank statement reconciliation candidates."""
    return get_bank_reconciliations(status=status)


@router.post("/reconciliations/{recon_id}/confirm", response_model=BankReconciliationResponse)
def confirm_reconciliation(recon_id: str):
    """Confirms bank statement fuzzy match and marks reconciled."""
    res = confirm_bank_match(recon_id)
    if not res:
        raise HTTPException(status_code=404, detail="Reconciliation record not found")
    return res


@router.get("/audit-trail", response_model=List[AuditLogResponse])
def list_audit_trail(limit: int = Query(50, ge=1, le=200)):
    """Returns explainable audit trail of all automated actions."""
    return get_audit_logs(limit=limit)


@router.get("/learnings")
def list_learnings():
    """Returns organizational categorization memory."""
    return get_ai_learnings()


@router.get("/insights")
def list_insights():
    """Returns proactive AI business insights and anomalies."""
    return get_ai_insights()


@router.post("/assistant/query", response_model=AssistantQueryResponse)
def query_assistant(req: AssistantQueryRequest):
    """Processes natural language questions against live database metrics."""
    return AssistantService.answer_query(req.query)


@router.get("/accountant/ledger", response_model=List[JournalEntryResponse])
def get_general_ledger_entries(limit: int = Query(50, ge=1, le=200)):
    """Accountant Mode: Returns double-entry journal entries."""
    return get_general_ledger(limit=limit)


@router.get("/accountant/trial-balance", response_model=TrialBalanceResponse)
def get_trial_balance_summary():
    """Accountant Mode: Returns balanced trial balance."""
    return get_trial_balance()
