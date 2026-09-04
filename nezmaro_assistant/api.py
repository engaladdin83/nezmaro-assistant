"""The one server call of the app: forward a question to the Nezmaro control
plane with this site's own credentials, and hand the answer back.

Credentials come from site_config.json (written by the control plane at
provisioning): nezmaro_assistant_url, nezmaro_tenant_id,
nezmaro_assistant_token. They never reach the browser. The control plane can
only READ this site (its read-only tool); nothing here writes anything.
"""

import frappe
import requests
from frappe import _

TIMEOUT_SECONDS = 90
RECENT_ERRORS = 3


@frappe.whitelist()
def ask(question, route=None, page_title=None, error_text=None, lang=None):
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
    }
