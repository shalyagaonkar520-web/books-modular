# AI Employee Workspace ("Connect to Mobile")

The owner (an organization admin) invites employees into **workspaces** (Sales, Warehouse, Purchase…).
Each employee gets a private, ChatGPT-style assistant that can only do what their workspace allows, and
can switch to **Manual mode** (the regular screens, filtered to the same permissions).

Owner: **Dashboard → Connect to Mobile** (also *Admin console → Connect to Mobile*).
Employee: invitation email → `/workspace-invite?token=…` → their own login → `/workspace`.

## How it fits the existing app

Nothing was rebuilt. The feature sits on top of:

| Existing piece | Used for |
| --- | --- |
| `org_roles` / custom roles (`services/permissions.py`, `deps.require_roles`) | Every workspace owns a hidden role (named `Workspace: <name>`). Employees are `custom` users on it, so **every existing API** already enforces it. |
| `services/ai.py` client + `ANTHROPIC_API_KEY` | The one Claude client; tests mock `ai.client_factory`. |
| Items, invoices, contacts, purchase-order routers | AI writes call the *same* functions as the screens, so all existing validation, numbering, stock and ledger rules apply. |
| `audit.record`, plans (`plans.check_room_for`), subscription lock | Employee actions are audited; employees count as users of the plan; a locked plan locks them too. |

New code: `backend/workspace_models.py`, `backend/services/workspace/*`, `backend/routers/workspace.py`,
migration `7a3c5e9b1d20`, `frontend/src/pages/workspace/*`, `frontend/src/api/workspace.ts`.
Items gained optional `category` and `brand` columns (needed to categorise products).

## Permissions

A workspace holds `{features: {feature: [view, create, edit, delete, approve, export]}, financial: bool}`.

* **Module level**: only listed features exist for the employee. **Financial data** is a separate switch: reports,
  banking, accounting, GST, payroll, insights, the dashboard, cost prices and margins stay closed without it.
* **Enforced on the server in two places, never in the browser or the prompt**
  1. `deps.require_roles` → `workspace/perms.api_error`: create vs edit vs delete vs approve vs export per request
     (method + path), pickers (items, customers, warehouses…) readable only together with a feature that uses them.
  2. `workspace/tools.execute`: every AI tool call checks feature + action (+ financial) first. The model is only *shown*
     the tools the employee may use, and a tool it names anyway is refused by the same check.
* Permission edits apply **immediately** (no re-login). Moving an employee between workspaces swaps their role at once.
* The AI has **no SQL access**. It can call a fixed registry of backend functions (`tools.REGISTRY`) with plain, validated arguments.
* Tool results are formatted by code and are **never sent back to Claude**, so data (a product name containing
  "ignore your rules…") cannot inject instructions into a second model call.
* Prompt-injection phrases are answered locally without a model call; restricted topics (payroll, profit, bank balance,
  GST, cost price) are refused locally when the workspace lacks the feature.

## Invitations

Owner picks workspace + email → email with a link → employee chooses their own password → account is created in
the owner's organization → signed in and redirected to `/workspace`. Tokens are random, stored only as SHA-256, expire
(`INVITE_EXPIRE_DAYS`, default 3), and work once. Status: **Pending → Accepted → Active**, or **Revoked**
(revoking deactivates the user, kills their refresh tokens and every live access token at once; *Restore* undoes it).
The sign-in ID is the employee's email address. The owner's credentials are never involved.

## Claude API cost control

Order of work for every message (cheapest first):

1. a pending draft/confirmation in the chat ("yes", "cancel", "price 450, GST 18")  → **no AI**
2. greetings, injection phrases, restricted-topic refusals                           → **no AI**
3. everyday requests (today's sales, low stock, pending invoices, category search, customers, POs, bills) matched by
   patterns and answered by backend queries                                          → **no AI**
4. otherwise **one** small Claude call (`claude-haiku-5-5`, ≤500 output tokens, 30 s timeout, short frozen system
   prompt, only the employee's permitted tools, last 6 turns + a rolling local summary). Routing plans are cached.
5. product photos: validated and shrunk locally, cached by image hash (same photo = no second call), local OCR first when
   installed, then one vision call.

Never sent to Claude: the database, the inventory, tool results, emails, other employees' chats.
Controls: org monthly budget, per-employee monthly budget and daily call limit, per-minute rate limit, per-employee and
org-wide AI switches. When AI is limited, quick questions and Manual mode keep working. The owner's **AI usage** tab shows
calls, input/output tokens, estimated cost, by employee / feature / day, and the share of replies answered without AI.

**Key security:** `ANTHROPIC_API_KEY` is read only from the server environment (`.env` is git-ignored). It is never
returned by any endpoint (only `keyConfigured: true/false`), logged, stored in the database, or put in an error message
(Claude errors are logged by class/status only).

## Product photos ("Add this product to my inventory")

Photo → (cache / OCR / vision) → name, brand, variant, barcode, category guess → category mapped onto an **existing**
category (new ones are flagged) → duplicate check (same barcode/SKU = hard stop, similar name = ask) → the assistant asks
for what it must not invent (**selling price, GST rate, opening stock**; the SKU is only a *suggestion* you can overwrite)
→ preview → **Confirm** → created through the normal item service. Several photos are queued one after another.
"Do we have this product?" with a photo searches instead of creating.

## Privacy and audit

Each employee sees only their own chats and photos (404 for anyone else, including the owner's UI — the owner sees
counts and the audit trail, not conversations). Every create/update an employee makes, by hand or through the assistant,
is in the audit log ("AI workspace (<name>): …") and in *Connect to Mobile → Audit history*.

## Tests

`tests/test_workspace.py` (33 tests): invitation security, single use, expiry, resend; per-role API permissions for the
Sales / Warehouse / Support presets including delete, export, financial and live permission changes; chat questions that
cost zero Claude calls; restricted questions and injection attempts; a model asking for a forbidden tool; cache reuse;
budgets, switches and rate limit; preview → confirm for invoices and stock; photo → product end to end, duplicates,
queueing, validation; chat isolation between employees and organizations; revocation; moving an employee.

## Not in this version

* Voice input uses the browser's speech recognition when available (the mic button is a future-ready hook, no server audio).
* Employees get one permission set per workspace; for a different mix, create another workspace.
* The AI can create draft invoices / purchase orders, products, contacts and stock adjustments. Sending, paying, deleting
  and approving stay in Manual mode.
* Without Financial data, purchase-cost fields (`costPrice`, `openingStockRate`, …) are removed from every ordinary API
  response to that employee (a server-side filter) and from AI answers. Stock *valuation* reports are closed with `reports`.

## Buddy (sidebar helper)

Right below the features in the sidebar: "Buddy — Hii boss, what do you wanna do today?" For admin, staff, viewer and custom-role
users (not workspace employees, who have their own chat). Same engine, tools, permission door and cost controls, acting as the
signed-in user with permissions derived from their own role (a viewer's Buddy can only look things up). He can chain steps,
e.g. *add customer → create invoice → email it* from one sentence: Claude returns the steps in one call, Buddy shows them as one
plan, and one **Confirm** runs them in order (each step is permission-checked again when it runs; it stops at the first problem).
If something is missing (an email address, a quantity) he asks one short question instead. Emailing an invoice uses the existing
Gmail/SMTP sender and issues a draft invoice, which the plan card says. His chats live in a hidden per-organization workspace that the
owner's workspace list never shows. API: `/api/buddy/*`.

### Talking to Buddy

* **Voice in:** the mic button uses the browser's speech recognition (Chrome, Edge, Safari); when you stop speaking the words are sent.
  **Voice out:** the speaker toggle reads his replies aloud (browser speech synthesis; remembered per browser). No audio goes to the server.
* **Conversation:** Buddy answers general business questions and chats normally; anything about this business's records or any change still goes
  through the permission-checked tools. Chatty or advice-seeking messages (long, or words like *tip, advice, why, explain*) skip the built-in
  data patterns and go to Claude; short data questions ("today's sales", "best customer", "low stock") are still answered free.
