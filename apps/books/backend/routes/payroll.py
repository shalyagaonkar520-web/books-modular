from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query
from fastapi.responses import HTMLResponse
from backend.models import (
    PayrollEmployeeResponse,
    PayrollEmployeeCreate,
    PayslipResponse,
)
from backend.database import (
    get_all_payroll_employees,
    get_payroll_employee_by_id,
    create_payroll_employee,
    disburse_all_payroll,
    generate_employee_payslip,
)

router = APIRouter(prefix="/api/payroll", tags=["Payroll"])


@router.get("/employees", response_model=List[PayrollEmployeeResponse])
def list_employees():
    """List all registered employees in the payroll ledger."""
    return get_all_payroll_employees()


@router.get("/employees/{emp_id}", response_model=PayrollEmployeeResponse)
def get_employee(emp_id: str):
    """Get employee payroll profile and bank details."""
    emp = get_payroll_employee_by_id(emp_id)
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee with ID '{emp_id}' not found"
        )
    return emp


@router.post("/employees", response_model=PayrollEmployeeResponse, status_code=status.HTTP_201_CREATED)
def add_employee(data: PayrollEmployeeCreate):
    """Enroll a new employee into automated payroll calculation."""
    created = create_payroll_employee(data.model_dump(by_alias=True))
    return created


@router.post("/disburse", response_model=List[PayrollEmployeeResponse])
def run_payroll_batch():
    """Execute monthly salary disbursement batch and update payment registers."""
    return disburse_all_payroll()


@router.get("/payslip/{emp_id}", response_model=PayslipResponse)
def get_payslip(emp_id: str, month: str = Query(default="August 2026")):
    """Calculate and return statutory monthly salary payslip breakdown."""
    payslip = generate_employee_payslip(emp_id, month)
    if not payslip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee with ID '{emp_id}' not found for payslip generation"
        )
    return payslip


@router.get("/payslip/{emp_id}/html", response_class=HTMLResponse)
def get_payslip_html(emp_id: str, month: str = Query(default="August 2026")):
    """Generate print-ready, official salary payslip document."""
    payslip = generate_employee_payslip(emp_id, month)
    if not payslip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee with ID '{emp_id}' not found"
        )

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Salary Payslip - {payslip['name']} - {payslip['month']}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px; color: #1e293b; background: #fff; }}
        .payslip-card {{ max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 36px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
        .header {{ text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }}
        .company-title {{ font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0; }}
        .company-sub {{ font-size: 13px; color: #475569; }}
        .payslip-title {{ font-size: 16px; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 1px; margin-top: 10px; }}
        .emp-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; font-size: 13px; background: #f8fafc; padding: 16px; border-radius: 6px; border: 1px solid #e2e8f0; }}
        .emp-row {{ display: flex; justify-content: space-between; padding: 3px 0; }}
        .label {{ color: #64748b; font-weight: 500; }}
        .val {{ font-weight: 600; color: #0f172a; }}
        .salary-table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }}
        .salary-table th {{ background: #f1f5f9; padding: 10px; border: 1px solid #cbd5e1; font-weight: 600; }}
        .salary-table td {{ padding: 8px 12px; border: 1px solid #cbd5e1; }}
        .net-box {{ background: #ecfdf5; border: 2px solid #10b981; border-radius: 6px; padding: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }}
        .net-title {{ font-size: 14px; font-weight: 700; color: #065f46; }}
        .net-val {{ font-size: 22px; font-weight: 800; color: #047857; }}
        .words-box {{ font-size: 13px; color: #334155; margin-bottom: 24px; font-style: italic; background: #f8fafc; padding: 10px; border-radius: 4px; }}
        .footer {{ margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #64748b; }}
        .seal {{ text-align: center; border-top: 1px solid #94a3b8; width: 220px; padding-top: 6px; }}
        @media print {{
            body {{ padding: 0; }}
            .payslip-card {{ border: none; box-shadow: none; padding: 0; }}
            .no-print {{ display: none !important; }}
        }}
    </style>
</head>
<body>
    <div class="no-print" style="max-width: 800px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 10px;">
        <button onclick="window.print()" style="padding: 8px 18px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
    </div>
    <div class="payslip-card">
        <div class="header">
            <h1 class="company-title">Zylker Electronics India Pvt Ltd</h1>
            <div class="company-sub">Tech Park Plaza, Outer Ring Road, Bengaluru, Karnataka 560103</div>
            <div class="company-sub">CIN: U72200KA2015PTC081290 | GSTIN: 29AABCU9603R1ZM</div>
            <div class="payslip-title">Salary Payslip &mdash; {payslip['month']}</div>
        </div>

        <div class="emp-grid">
            <div>
                <div class="emp-row"><span class="label">Employee ID:</span><span class="val">{payslip['employeeId']}</span></div>
                <div class="emp-row"><span class="label">Employee Name:</span><span class="val">{payslip['name']}</span></div>
                <div class="emp-row"><span class="label">Designation:</span><span class="val">{payslip['designation']}</span></div>
                <div class="emp-row"><span class="label">Department:</span><span class="val">{payslip['department']}</span></div>
            </div>
            <div>
                <div class="emp-row"><span class="label">Bank Account:</span><span class="val">{payslip['bankAcc']}</span></div>
                <div class="emp-row"><span class="label">PAN Number:</span><span class="val">{payslip['pan']}</span></div>
                <div class="emp-row"><span class="label">PF UAN:</span><span class="val">{payslip['uan']}</span></div>
                <div class="emp-row"><span class="label">Pay Status:</span><span class="val" style="color: #059669;">{payslip['status']}</span></div>
            </div>
        </div>

        <table class="salary-table">
            <thead>
                <tr>
                    <th colspan="2" style="width: 50%; color: #0f766e;">EARNINGS (₹)</th>
                    <th colspan="2" style="width: 50%; color: #991b1b;">DEDUCTIONS (₹)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Basic Salary</td>
                    <td style="text-align: right; font-weight: 600;">₹{payslip['basic']:,.2f}</td>
                    <td>Employee Provident Fund (EPF 12%)</td>
                    <td style="text-align: right; font-weight: 600; color: #dc2626;">₹{payslip['pf']:,.2f}</td>
                </tr>
                <tr>
                    <td>House Rent Allowance (HRA)</td>
                    <td style="text-align: right; font-weight: 600;">₹{payslip['hra']:,.2f}</td>
                    <td>Professional Tax (PT)</td>
                    <td style="text-align: right; font-weight: 600; color: #dc2626;">₹{payslip['pt']:,.2f}</td>
                </tr>
                <tr>
                    <td>Special & Conveyance Allowance</td>
                    <td style="text-align: right; font-weight: 600;">₹{payslip['specialAllowance']:,.2f}</td>
                    <td>Income Tax (TDS / IT)</td>
                    <td style="text-align: right; font-weight: 600; color: #dc2626;">₹{payslip['tds']:,.2f}</td>
                </tr>
                <tr style="background: #f8fafc; font-weight: 700;">
                    <td>Total Gross Earnings</td>
                    <td style="text-align: right; color: #0f766e;">₹{payslip['gross']:,.2f}</td>
                    <td>Total Statutory Deductions</td>
                    <td style="text-align: right; color: #dc2626;">₹{payslip['totalDeductions']:,.2f}</td>
                </tr>
            </tbody>
        </table>

        <div class="net-box">
            <div>
                <div class="net-title">NET PAYABLE AMOUNT</div>
                <div style="font-size: 12px; color: #065f46;">Transferred directly via Corporate IMPS/NEFT</div>
            </div>
            <div class="net-val">₹{payslip['net']:,.2f}</div>
        </div>

        <div class="words-box">
            <strong>In Words:</strong> {payslip['netInWords']}
        </div>

        <div class="footer">
            <div>
                <em>Note: This is a system-generated document under the Zoho Payroll Engine and requires no signature.</em>
            </div>
            <div class="seal">
                <strong>Zylker Electronics India Pvt Ltd</strong><br><br>
                <span>Authorized HR Signatory</span>
            </div>
        </div>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html)
