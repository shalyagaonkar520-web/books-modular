/**
 * The ten cards on the hero ring, each a small illustration of something
 * Rooman One does. Pure HTML/CSS (no images), in 130 x 300 design pixels;
 * the ring shows roughly the top two thirds of each card. Figures are
 * illustrative sample values, not customer data.
 */

export type CardKind = 'invoice' | 'gst' | 'upi' | 'booking' | 'payroll' | 'eway' | 'reports' | 'customer' | 'payment' | 'subscription';

export const CARD_ORDER: CardKind[] = ['invoice', 'gst', 'upi', 'booking', 'payroll', 'eway', 'reports', 'customer', 'payment', 'subscription'];

/** A deterministic 21 x 21 QR-like pattern with the three finder squares. */
function qrSvg(): string {
  const n = 21;
  let cells = '';
  let seed = 7;
  const finder = (x: number, y: number) => x < 7 && y < 7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y)) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 100 < 48) cells += `M${x} ${y}h1v1h-1z`;
    }
  }
  const eye = (x: number, y: number) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return (
    `<svg viewBox="0 0 ${n} ${n}" width="78" height="78" shape-rendering="crispEdges">` +
    `<path fill="#0f172a" fill-rule="evenodd" d="${eye(0, 0)}${eye(14, 0)}${eye(0, 14)}"/>` +
    `<path fill="#0f172a" d="${cells}"/></svg>`
  );
}

export function creative(kind: CardKind): string {
  switch (kind) {
    case 'invoice':
      return (
        '<div class="fill" style="background:#fff"></div>' +
        '<div class="cv" style="top:16px;font-size:4px;letter-spacing:.18em;color:#64748b">TAX INVOICE</div>' +
        '<div class="cv t-big" style="top:24px;font-size:13px">INV-000123</div>' +
        '<div class="cv" style="top:40px;font-size:4.6px;color:#64748b">Bill to <b style="color:#0f172a">Ravi Kumar</b></div>' +
        '<div class="cv" style="top:54px;font-size:4.8px;color:#334155">' +
        '<div class="kv"><span>Consultation</span><span>₹1,000.00</span></div>' +
        '<div class="kv"><span>CGST 9%</span><span>₹90.00</span></div>' +
        '<div class="kv"><span>SGST 9%</span><span>₹90.00</span></div>' +
        '<div class="kv" style="font-weight:700;color:#0f172a;border:0"><span>Total</span><span>₹1,180.00</span></div></div>' +
        '<div class="abs" style="left:10px;top:108px;transform:rotate(-8deg);border:1.4px solid #059669;color:#059669;border-radius:4px;padding:2px 7px;font-size:7px;font-weight:800;letter-spacing:.12em">PAID</div>' +
        '<div class="cv" style="top:140px;font-size:4.2px;color:#94a3b8">UPI · ref 4021 7788 1290</div>'
      );
    case 'gst':
      return (
        '<div class="fill" style="background:linear-gradient(165deg,#1d4ed8,#1e3a8a 70%,#172554)"></div>' +
        '<div class="cv" style="top:18px;font-size:4.2px;letter-spacing:.2em;color:rgba(255,255,255,.7)">COMPLIANCE</div>' +
        '<div class="cv t-big" style="top:30px;font-size:34px;color:#fff">GST</div>' +
        '<div class="cv t-big" style="top:62px;font-size:11px;color:#93c5fd">Ready to file</div>' +
        '<div class="cv" style="top:84px;font-size:5px;color:#fff;line-height:2">' +
        '<div><span class="pill" style="background:rgba(255,255,255,.14)">GSTR-1</span> <span class="pill" style="background:rgba(255,255,255,.14)">GSTR-3B</span></div>' +
        '<div style="color:rgba(255,255,255,.75)">HSN summary · e-invoice ready</div></div>' +
        '<div class="cv" style="top:126px;font-size:4.4px;color:rgba(255,255,255,.6)">Every amendment logged, nothing deleted</div>'
      );
    case 'upi':
      return (
        '<div class="fill" style="background:#f8fafc"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:#64748b;text-align:center">SCAN TO PAY</div>' +
        '<div class="abs" style="left:26px;top:28px;padding:6px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(15,23,42,.12)">' +
        qrSvg() +
        '</div>' +
        '<div class="cv t-big" style="top:122px;font-size:12px;text-align:center;transform:none">₹1,180.00</div>' +
        '<div class="cv" style="top:137px;font-size:4.6px;color:#64748b;text-align:center">UPI QR on every invoice</div>'
      );
    case 'booking':
      return (
        '<div class="fill" style="background:linear-gradient(170deg,#ecfdf5,#d1fae5)"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:#047857">BOOKINGS</div>' +
        '<div class="cv t-serif" style="top:26px;font-size:15px;color:#065f46">Book a slot</div>' +
        '<div class="cv" style="top:48px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:5px;text-align:center">' +
        ['9:30', '10:00', '10:30', '11:00', '11:30', '12:00']
          .map(
            (t, i) =>
              `<span style="padding:4px 0;border-radius:4px;${i === 2 ? 'background:#059669;color:#fff;font-weight:700' : 'background:#fff;color:#065f46'}">${t}</span>`,
          )
          .join('') +
        '</div>' +
        '<div class="cv" style="top:88px"><div style="padding:6px;border-radius:6px;background:#fff;font-size:4.8px;color:#065f46">' +
        '<b style="display:block;font-size:5.6px">Hair spa · 45 min</b>Thu 10:30 AM · with Priya</div></div>' +
        '<div class="cv" style="top:122px;font-size:4.4px;color:#047857">Paid online · invoiced in Books</div>'
      );
    case 'payroll':
      return (
        '<div class="fill" style="background:linear-gradient(180deg,#0f172a,#1e293b)"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:#94a3b8">PAYSLIP · SEP</div>' +
        '<div class="cv" style="top:28px;font-size:4.8px;color:#cbd5e1">Net pay</div>' +
        '<div class="cv t-big" style="top:35px;font-size:16px;color:#fff">₹42,500</div>' +
        '<div class="cv" style="top:60px;font-size:4.6px;color:#cbd5e1">' +
        '<div class="kv" style="border-color:rgba(255,255,255,.1)"><span>Basic</span><span>₹30,000</span></div>' +
        '<div class="kv" style="border-color:rgba(255,255,255,.1)"><span>HRA</span><span>₹12,000</span></div>' +
        '<div class="kv" style="border-color:rgba(255,255,255,.1)"><span>Allowances</span><span>₹4,300</span></div>' +
        '<div class="kv" style="border:0;color:#fca5a5"><span>PF + PT</span><span>−₹3,800</span></div></div>' +
        '<div class="cv" style="top:118px;font-size:4.4px;color:#94a3b8">Staff see it in their own portal</div>'
      );
    case 'eway':
      return (
        '<div class="fill" style="background:linear-gradient(160deg,#f97316,#ea580c 60%,#c2410c)"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:rgba(255,255,255,.8)">LOGISTICS</div>' +
        '<div class="cv t-big" style="top:28px;font-size:17px;color:#fff">e-Way Bill</div>' +
        '<svg class="abs" style="left:10px;top:52px" width="110" height="44" viewBox="0 0 110 44" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round">' +
        '<path d="M4 8h58v24H4z" fill="rgba(255,255,255,.18)"/><path d="M62 16h20l12 10v6H62z" fill="rgba(255,255,255,.18)"/>' +
        '<circle cx="20" cy="36" r="5" fill="#ea580c"/><circle cx="80" cy="36" r="5" fill="#ea580c"/></svg>' +
        '<div class="cv" style="top:104px;font-size:5px;color:#fff;line-height:1.7"><b>EWB 3415 2209 8812</b><br>Valid till 11 Oct · 1,200 km</div>'
      );
    case 'reports':
      return (
        '<div class="fill" style="background:#0b1220"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:#64748b">REPORTS</div>' +
        '<div class="cv t-big" style="top:26px;font-size:12px;color:#fff">Profit &amp; Loss</div>' +
        '<svg class="abs" style="left:10px;top:48px" width="110" height="60" viewBox="0 0 110 60">' +
        [22, 30, 26, 38, 34, 46, 52]
          .map((h, i) => `<rect x="${i * 15 + 2}" y="${58 - h}" width="9" height="${h}" rx="2" fill="${i === 6 ? '#38bdf8' : '#1e3a5f'}"/>`)
          .join('') +
        '</svg>' +
        '<div class="cv" style="top:114px;font-size:4.8px;color:#94a3b8">Net profit <b style="color:#34d399">▲ 18%</b> vs last quarter</div>' +
        '<div class="cv" style="top:126px;font-size:4.4px;color:#64748b">Balance sheet · cash flow · ageing</div>'
      );
    case 'customer':
      return (
        '<div class="fill" style="background:linear-gradient(165deg,#7c3aed,#5b21b6)"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:rgba(255,255,255,.75)">CUSTOMER 360</div>' +
        '<div class="abs" style="left:10px;top:30px;width:28px;height:28px;border-radius:50%;background:#fff;color:#6d28d9;display:grid;place-items:center;font-size:9px;font-weight:800">RK</div>' +
        '<div class="abs" style="left:44px;top:33px;font-size:7px;font-weight:700;color:#fff">Ravi Kumar<br><span style="font-size:4.6px;font-weight:400;opacity:.8">ravi@kumartraders.in</span></div>' +
        '<div class="cv" style="top:68px;font-size:4.8px;color:#fff;line-height:2.1">' +
        '<div class="kv" style="border-color:rgba(255,255,255,.2)"><span>Invoices</span><b>12</b></div>' +
        '<div class="kv" style="border-color:rgba(255,255,255,.2)"><span>Bookings</span><b>5</b></div>' +
        '<div class="kv" style="border:0"><span>Outstanding</span><b>₹0.00</b></div></div>' +
        '<div class="cv" style="top:124px;font-size:4.4px;color:rgba(255,255,255,.75)">One record, seen by every app</div>'
      );
    case 'payment':
      return (
        '<div class="fill" style="background:linear-gradient(170deg,#0c4a6e,#082f49)"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:#7dd3fc">RAZORPAY</div>' +
        '<div class="abs" style="left:10px;top:30px;width:22px;height:22px;border-radius:50%;background:#22c55e;display:grid;place-items:center">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L19 7"/></svg></div>' +
        '<div class="cv" style="top:58px;font-size:5px;color:#bae6fd">Payment received</div>' +
        '<div class="cv t-big" style="top:66px;font-size:16px;color:#fff">₹2,360</div>' +
        '<div class="cv" style="top:88px;font-size:4.6px;color:#e0f2fe;line-height:1.8">Auto-applied to INV-000118 and INV-000123, oldest first</div>' +
        '<div class="cv" style="top:118px;font-size:4.4px;color:#7dd3fc">Synced with your Razorpay account</div>'
      );
    case 'subscription':
      return (
        '<div class="fill" style="background:linear-gradient(165deg,#e11d48,#9f1239)"></div>' +
        '<div class="cv" style="top:16px;font-size:4.2px;letter-spacing:.18em;color:rgba(255,255,255,.8)">BILLING</div>' +
        '<div class="cv t-serif" style="top:28px;font-size:15px;color:#fff">Renewed</div>' +
        '<div class="cv" style="top:50px"><div style="padding:7px;border-radius:7px;background:rgba(255,255,255,.14);font-size:4.8px;color:#fff;line-height:1.8">' +
        '<b style="font-size:6px">Gold plan · monthly</b><br>₹999 charged · next on 9 Nov</div></div>' +
        '<div class="cv" style="top:90px;font-size:4.6px;color:#fecdd3;line-height:1.8">Reminders and retries handled for you</div>' +
        '<div class="cv" style="top:120px;font-size:4.4px;color:rgba(255,255,255,.7)">Coming to Rooman One</div>'
      );
  }
}
