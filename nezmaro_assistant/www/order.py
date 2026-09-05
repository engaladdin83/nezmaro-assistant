"""The checkout page's context: what the shopper is buying, and what it costs.

Rendered server-side so the page is complete before any JavaScript runs — on a
phone on mobile data that is the difference between an order and a bounce.
"""

import frappe
from frappe import _

from nezmaro_assistant.checkout import (
    _config,
    _enabled,
    _governorates,
    _parse_lines,
    _rate_for,
    _sellable,
)

no_cache = 1


def get_context(context):
    context.no_cache = 1
    config = _config()
    context.shop_enabled = _enabled(config)
    context.currency = config.get("currency") or "EGP"
    context.note = config.get("note") or ""
    context.whatsapp = config.get("whatsapp") or ""
    context.free_over = config.get("free_over") or 0
    context.governorates = [
        {"name": row.get("name"), "fee": row.get("fee") or 0} for row in _governorates(config)
    ]
    context.lines = []
    context.goods_total = 0
    context.error = ""
    if not context.shop_enabled:
        context.error = _("Online ordering is not switched on for this shop yet.")
        return context

    form = frappe.form_dict
    try:
        lines = _parse_lines(form.get("items"), form.get("item"), form.get("qty"))
        for code, qty in lines:
            item = _sellable(code)
            rate = _rate_for(code, config)
            image = frappe.db.get_value("Item", code, "image")
            context.lines.append(
                {
                    "item_code": code,
                    "item_name": item.item_name or code,
                    "qty": qty,
                    "rate": rate,
                    "amount": rate * qty,
                    "image": image,
                }
            )
            context.goods_total += rate * qty
    except frappe.ValidationError:
        # A bad or stale link should offer the shop, not a stack trace.
        context.error = _("That item is no longer available. Browse the shop and try again.")
        frappe.clear_last_message()
    context.title = _("Complete your order")
    return context
