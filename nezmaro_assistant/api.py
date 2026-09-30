"""The one server call of the app: forward a question to the Nezmaro control
plane with this site's own credentials, and hand the answer back.

Credentials come from site_config.json (written by the control plane at
provisioning): nezmaro_assistant_url, nezmaro_tenant_id,
nezmaro_assistant_token. They never reach the browser. `ask` only reads;
`act` (0.1.4) hands back a proposal the user confirmed on screen — the control
plane verifies its signature and writes the document with the site's keys.
Since 0.2.5 both send what the asking user's roles may read and create, and
refuse anyone who is not staff: the site's keys must not lend a cashier (or a
shopper) more than their own roles give them.
"""

import frappe
import requests
from frappe import _
from frappe.model.db_query import DatabaseQuery
from frappe.permissions import get_role_permissions

TIMEOUT_SECONDS = 90
RECENT_ERRORS = 3
STAFF = "System User"
# Every doctype the control plane's Ask can read (its READ_DOCTYPES) or create
# (Customer, Item, Sales Invoice). A test holds the two lists together.
ASK_DOCTYPES = (
    "Company",
    "Customer",
    "Supplier",
    "Item",
    "Sales Invoice",
    "Sales Order",
    "Purchase Invoice",
    "Purchase Order",
    "Payment Entry",
    "Delivery Note",
    "Stock Ledger Entry",
    "Employee",
)


def _reads_every_row(doctype):
    """True only when this user's own list of the doctype would be unfiltered.

    Ask reads with the site's service keys, which see every row. Role-level
    read is not enough to lend them: a user can hold read on Employee and still
    be limited to their own record (a User Permission), to documents they made
    (if-owner), to what was shared with them, or by a permission-query hook.
    Frappe's own list query turns each of those into a condition, so an empty
    one means the user already sees every row. Anything that raises is a no."""
    try:
        roles = get_role_permissions(frappe.get_meta(doctype), user=frappe.session.user)
        if not roles.get("read"):
            return False
        query = DatabaseQuery(doctype)
        return not query.build_match_conditions() and not query.conditions
    except Exception:  # noqa: BLE001 — missing doctype, PermissionError, share-only: all a no
        return False


def _may_create(doctype):
    try:
        return bool(frappe.has_permission(doctype, "create"))
    except Exception:  # noqa: BLE001 — a doctype this site lacks is a no
        return False


def _staff_grants():
    """0.2.5: who is asking, in Frappe's own permission terms.

    The control plane answers with this site's SERVICE keys, which can read
    and write everything. It must be told what this user may do, or a cashier
    could ask for the payroll and a shopper could have invoices drafted.
    Website Users (shoppers, portal users) are refused here; staff get the Ask
    doctypes they may read in full and create, and the control plane offers
    nothing outside them."""
    user = frappe.session.user
    if user == "Guest" or frappe.get_cached_value("User", user, "user_type") != STAFF:
        frappe.throw(_("Ask Nezmaro is for staff accounts."), frappe.PermissionError)
    return {
        "user_type": STAFF,
        "can_read": [dt for dt in ASK_DOCTYPES if _reads_every_row(dt)],
        "can_create": [dt for dt in ASK_DOCTYPES if _may_create(dt)],
    }


@frappe.whitelist()
def ask(question, route=None, page_title=None, error_text=None, lang=None):
    grants = _staff_grants()
    question = (question or "").strip()
    if not question:
        frappe.throw(_("Type a question first."))
    url = frappe.conf.get("nezmaro_assistant_url")
    token = frappe.conf.get("nezmaro_assistant_token")
    tenant_id = frappe.conf.get("nezmaro_tenant_id")
    if not (url and token and tenant_id):
        frappe.throw(_("The assistant is not set up for this site yet."))

    # Recent server-side errors help explain a failure the user just hit.
    # Only for System Managers: error logs can carry other users' data.
    recent = []
    if "System Manager" in frappe.get_roles():
        for row in frappe.get_all("Error Log", fields=["error"], order_by="creation desc", limit=RECENT_ERRORS):
            if row.get("error"):
                recent.append(str(row["error"])[:800])

    payload = {
        "tenant_id": tenant_id,
        "token": token,
        "question": question[:4000],
        "lang": lang if lang in ("en", "ar") else None,
        "route": (route or "")[:300] or None,
        "page_title": (page_title or "")[:200] or None,
        "error_text": (error_text or "")[:4000] or None,
        "user": frappe.session.user,
        "recent_errors": recent,
        **grants,
    }
    try:
        response = requests.post(url, json=payload, timeout=TIMEOUT_SECONDS)
    except requests.RequestException:
        frappe.throw(_("The assistant could not be reached. Try again in a moment."))
    if response.status_code == 409:
        frappe.throw(_("The assistant needs an AI provider. Set one up in the Nezmaro control panel (Ask → AI settings)."))
    if response.status_code == 429:
        frappe.throw(_("Too many questions at once. Wait a minute and try again."))
    if response.status_code != 200:
        frappe.throw(_("The assistant is unavailable right now ({0}).").format(response.status_code))
    data = response.json()
    return {
        "answer": data.get("answer", ""),
        "lang": data.get("lang", "en"),
        "links": data.get("links", []),
        "sources": data.get("sources", []),
        "proposals": data.get("proposals", []),
    }


@frappe.whitelist()
def act(action, payload, token):
    """The user pressed the confirm button on a proposal."""
    grants = _staff_grants()
    url = frappe.conf.get("nezmaro_assistant_url")
    site_token = frappe.conf.get("nezmaro_assistant_token")
    tenant_id = frappe.conf.get("nezmaro_tenant_id")
    if not (url and site_token and tenant_id):
        frappe.throw(_("The assistant is not set up for this site yet."))
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    body = {
        "tenant_id": tenant_id,
        "site_token": site_token,
        "action": action,
        "payload": payload,
        "token": token,
        "user": frappe.session.user,
        "user_type": grants["user_type"],
        "can_create": grants["can_create"],
    }
    try:
        response = requests.post(url.rstrip("/") + "/act", json=body, timeout=TIMEOUT_SECONDS)
    except requests.RequestException:
        frappe.throw(_("The assistant could not be reached. Try again in a moment."))
    if response.status_code != 200:
        frappe.throw(_("The assistant is unavailable right now ({0}).").format(response.status_code))
    return response.json()
