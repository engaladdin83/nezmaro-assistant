"""A customer's monthly statement of account, by email and on WhatsApp (#81, 0.1.8).

The owner's decisions, 2026-09-13: MONTHLY -- the opening balance brought forward
from before the month, the month's transactions, the ending balance -- and ONE
button on the Customer page that offers email and WhatsApp together.

Built on the engine, not beside it. The numbers are ERPNext's own General Ledger
report for the customer, consolidated by voucher: the same Opening, entries,
Total and Closing rows the desk report shows, drawn in ERPNext's own
statement-of-accounts template with the company's default letter head. One
difference, on purpose: ERPNext's Process Statement Of Accounts SKIPS a customer
with no entries in the period, so a customer who still owes last month's balance
would get nothing at all. Here the opening and closing lines always go out.

Email leaves through this site's own outgoing account. WhatsApp needs the
tenant's Meta token, which only the control plane holds: the finished PDF is
posted there with this site's own token, the way the assistant's calls are.
"""

import base64
import calendar
import re

import frappe
import requests
from frappe import _
from frappe.utils import escape_html, flt, fmt_money, formatdate, getdate, today, validate_email_address

MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")
LEDGER_TEMPLATE = "erpnext/accounts/doctype/process_statement_of_accounts/process_statement_of_accounts.html"
CONSOLIDATED = "Categorize by Voucher (Consolidated)"
MAX_PDF_BYTES = 5 * 1024 * 1024  # what the control plane accepts for WhatsApp
TIMEOUT_SECONDS = 90
_UNSAFE_FILENAME = re.compile(r"[^\w\-]+", re.UNICODE)


def period(month):
    """'2026-08' -> (2026-08-01, 2026-08-31). Refuses a month not yet begun."""
    match = MONTH_RE.match(str(month or "").strip())
    number = int(match.group(2)) if match else 0
    if not match or not 1 <= number <= 12:
        frappe.throw(_("Choose the month of the statement."))
    year = int(match.group(1))
    first = getdate(f"{year:04d}-{number:02d}-01")
    last = getdate(f"{year:04d}-{number:02d}-{calendar.monthrange(year, number)[1]:02d}")
    if first > getdate(today()):
        frappe.throw(_("A statement cannot be for a month that has not started yet."))
    return first, last


def _month_label(first):
    try:
        return formatdate(first, "MMMM yyyy")
    except Exception:
        return f"{first.year:04d}-{first.month:02d}"


def statement(customer, month):
    """The statement's numbers: ERPNext's ledger rows for the month, and its three lines."""
    from erpnext import get_company_currency
    from erpnext.accounts.party import get_party_account_currency
    from erpnext.accounts.report.general_ledger.general_ledger import execute as general_ledger

    if not customer or not frappe.db.exists("Customer", customer):
        frappe.throw(_("Customer {0} does not exist.").format(customer))
    frappe.has_permission("Customer", "read", doc=customer, throw=True)
    # The statement IS the customer's ledger: a user who may not read the ledger
    # may not send it out either.
    frappe.has_permission("GL Entry", "read", throw=True)
    first, last = period(month)
    company = frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default("company")
    if not company:
        frappe.throw(_("Set a default company first."))

    doc = frappe.get_doc("Customer", customer)
    name = doc.customer_name or customer
    currency = get_party_account_currency("Customer", customer, company) or get_company_currency(company)
    filters = frappe._dict(
        company=company,
        from_date=first,
        to_date=last,
        party_type="Customer",
        party=[customer],
        party_name=[name],
        presentation_currency=currency,
        currency=None,
        categorize_by=CONSOLIDATED,
        show_opening_entries=0,
        include_default_book_entries=0,
        tax_id=doc.tax_id or None,
        cost_center=[],
        project=[],
        finance_book=None,
        account=None,
        show_remarks=0,
        show_net_values_in_party_account=0,
    )
    columns, rows = general_ledger(filters)
    # Opening first, Total and Closing last -- ALWAYS, even with no entries in the
    # month. That three-row case is the one the engine's own statement drops.
    if not rows or len(rows) < 3:
        frappe.throw(_("The ledger for {0} could not be read.").format(customer))
    for row in (rows[0], rows[-2], rows[-1]):
        row["account"] = str(row.get("account") or "").replace("'", "")
    closing = flt(rows[-1].get("balance"))
    return frappe._dict(
        customer=customer,
        customer_name=name,
        company=company,
        currency=currency,
        month=f"{first.year:04d}-{first.month:02d}",
        from_date=first,
        to_date=last,
        filters=filters,
        columns=columns,
        rows=rows,
        opening=flt(rows[0].get("balance")),
        closing=closing,
        transactions=len(rows) - 3,
        period_label=_month_label(first),
        closing_text=fmt_money(closing, currency=currency),
    )


def statement_html(data):
    from frappe.www.printview import get_letter_head, get_print_style

    letter_head_name = frappe.db.get_value("Letter Head", {"is_default": 1}, "name")
    letter_head = get_letter_head(frappe._dict(letter_head=letter_head_name), 0) if letter_head_name else None
    body = frappe.render_template(
        LEDGER_TEMPLATE,
        {
            "filters": data.filters,
            "data": data.rows,
            "report": {"report_name": "General Ledger", "columns": data.columns},
            "ageing": None,
            "letter_head": letter_head,
            "terms_and_conditions": None,
        },
    )
    return frappe.render_template(
        "frappe/www/printview.html",
        {"body": body, "css": get_print_style(), "title": _("Statement of account: {0}").format(data.customer_name)},
    )


def statement_pdf(data):
    from frappe.utils.pdf import get_pdf

    return get_pdf(statement_html(data), {"orientation": "Portrait"})


def filename_for(data):
    stem = _UNSAFE_FILENAME.sub(" ", f"{_('Statement of account')} {data.customer_name} {data.month}")
    return " ".join(stem.split())[:100] + ".pdf"


@frappe.whitelist()
def download_statement(customer, month):
    """The Preview button: the same PDF the customer will get."""
    data = statement(customer, month)
    frappe.local.response.filename = filename_for(data)
    frappe.local.response.filecontent = statement_pdf(data)
    frappe.local.response.type = "download"


# POST only (0.1.9). A bare whitelist also answers GET, and Frappe checks the CSRF
# token only on POST/PUT/DELETE/PATCH: a crafted link opened by a logged-in user
# could have sent a customer's statement to any WhatsApp number (found by the live
# verification, 2026-09-13). The dialog already POSTs through frappe.call.
@frappe.whitelist(methods=["POST"])
def send_statement(customer, month, email=None, mobile=None):
    """The Send button. Each channel answers for itself: an email that went out is
    not undone because WhatsApp was not set up."""
    email = str(email or "").strip()
    mobile = str(mobile or "").strip()
    if not email and not mobile:
        frappe.throw(_("Choose email, WhatsApp or both."))
    data = statement(customer, month)
    pdf = statement_pdf(data)
    filename = filename_for(data)
    results = []
    if email:
        results.append(_by_email(data, email, pdf, filename))
    if mobile:
        results.append(_by_whatsapp(data, mobile, pdf, filename))
    return {
        "results": results,
        "period": data.period_label,
        "closing": data.closing_text,
        "transactions": data.transactions,
    }


def _by_email(data, email, pdf, filename):
    def answer(ok, message):
        return {"channel": "email", "ok": ok, "message": message}

    if not validate_email_address(email):
        return answer(False, _("{0} is not an email address.").format(email))
    if not frappe.db.exists("Email Account", {"enable_outgoing": 1}):
        return answer(
            False,
            _("This ERP has no outgoing email yet. Set it up in the Nezmaro control panel: Marketing, then Your outgoing email."),
        )
    frappe.sendmail(
        recipients=[email],
        subject=_("Statement of account for {0}: {1}").format(data.period_label, data.company),
        message=_(
            "Dear {0},<br><br>Your statement of account for {1} is attached. The balance at the end of the month is {2}.<br><br>{3}"
        ).format(escape_html(data.customer_name), data.period_label, data.closing_text, escape_html(data.company)),
        attachments=[{"fname": filename, "fcontent": pdf}],
        reference_doctype="Customer",
        reference_name=data.customer,
    )
    return answer(True, _("Queued for {0}. It leaves with this ERP's next email run.").format(email))


def _by_whatsapp(data, mobile, pdf, filename):
    def answer(ok, message):
        return {"channel": "whatsapp", "ok": ok, "message": message}

    url = frappe.conf.get("nezmaro_assistant_url")
    token = frappe.conf.get("nezmaro_assistant_token")
    tenant_id = frappe.conf.get("nezmaro_tenant_id")
    if not (url and token and tenant_id):
        return answer(False, _("WhatsApp sending is not set up for this site yet."))
    if len(pdf) > MAX_PDF_BYTES:
        return answer(False, _("The statement is too large to send on WhatsApp."))
    body = {
        "tenant_id": tenant_id,
        "site_token": token,
        "user": frappe.session.user,
        "mobile": mobile[:40],
        "period": str(data.period_label)[:60],
        "balance": str(data.closing_text)[:60],
        "filename": filename[:120],
        "pdf_base64": base64.b64encode(pdf).decode("ascii"),
    }
    try:
        response = requests.post(url.rstrip("/") + "/statement", json=body, timeout=TIMEOUT_SECONDS)
    except requests.RequestException:
        return answer(False, _("The Nezmaro control plane could not be reached. Try again in a moment."))
    if response.status_code == 413:
        return answer(False, _("The statement is too large to send on WhatsApp."))
    if response.status_code != 200:
        return answer(False, _("WhatsApp sending is unavailable right now ({0}).").format(response.status_code))
    reply = response.json() or {}
    return answer(bool(reply.get("ok")), _whatsapp_message(reply.get("code"), reply.get("message"), mobile))


def _whatsapp_message(code, detail, mobile):
    if code == "sent":
        return _("Sent on WhatsApp to {0}.").format(mobile)
    if code == "not_set_up":
        return _("WhatsApp is not set up. Connect it in the Nezmaro control panel: Marketing, then WhatsApp.")
    if code == "bad_number":
        return _("{0} is not a mobile number WhatsApp can reach.").format(mobile)
    if code == "rate_limited":
        return _("Too many statements sent in the last hour. Try again later.")
    if code == "bad_file":
        return _("The statement could not be sent as a PDF.")
    return _("WhatsApp refused the statement: {0}").format(detail or "")
