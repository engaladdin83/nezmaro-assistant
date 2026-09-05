"""Guest checkout, cash on delivery (M30).

The webshop app ties its cart to a logged-in user, and with no payment gateway
its button reads "Request for Quote" — a shopper cannot place an order at all.
Egyptian online shops sell cash on delivery to people arriving from Instagram
on a phone: a name, a number, an address, done. Making them register, wait for
an email and choose a password costs most of the orders.

So this module takes the order itself. A guest posts an item, a quantity and
their delivery details; the site prices the line from ITS OWN Item Price and
Pricing Rules (never from anything the browser sent), adds the delivery fee for
the governorate, creates the Customer, Address and Contact, and submits a Sales
Order. The shop then sees a normal order with a phone number and an address.

The order is created HERE, on the site, not by calling the control plane: a
shop must keep selling even when the control plane is unreachable. Only the
configuration comes from the control plane, in site_config under
"nezmaro_shop", written at provisioning and whenever the shop's settings change.

Everything a browser sends is treated as hostile: the item must be a published
website item on this site, the rate is looked up, the quantity is bounded, the
phone must be a real Egyptian mobile, and one address cannot order all day.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, nowdate

CONFIG_KEY = "nezmaro_shop"
# Egyptian mobile numbers: 010, 011, 012 and 015, then eight digits.
PHONE_RE = re.compile(r"^01[0125]\d{8}$")
MAX_QTY_PER_LINE = 20
MAX_LINES = 10
MAX_ORDERS_PER_PHONE_PER_HOUR = 5
MAX_ORDERS_PER_IP_PER_HOUR = 15
DEFAULT_LEAD_DAYS = 2
CUSTOMER_GROUP_FALLBACK = "Individual"
TERRITORY_FALLBACK = "All Territories"


# ------------------------------ configuration ------------------------------


def _config() -> dict:
    """The shop's cash-on-delivery settings, as the control plane wrote them.

    `bench set-config` stores a plain string unless told otherwise, so a string
    that parses as JSON is accepted too.
    """
    raw = frappe.conf.get(CONFIG_KEY)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = None
    return raw if isinstance(raw, dict) else {}


def _governorates(config: dict) -> list:
    rows = config.get("governorates") or []
    return [row for row in rows if isinstance(row, dict) and row.get("name")]


def _fee_for(config: dict, governorate: str) -> float:
    for row in _governorates(config):
        if str(row.get("name")).strip().lower() == str(governorate).strip().lower():
            return flt(row.get("fee"))
    return flt(config.get("default_fee"))


def _enabled(config: dict) -> bool:
    return bool(config.get("enabled")) and bool(_governorates(config))


@frappe.whitelist(allow_guest=True)
def options() -> dict:
    """What the checkout form needs to draw itself. No secrets, no documents."""
    config = _config()
    return {
        "enabled": _enabled(config),
        "currency": config.get("currency") or "EGP",
        "governorates": [
            {
                "name": row.get("name"),
                "label_ar": row.get("name_ar") or row.get("name"),
                "fee": flt(row.get("fee")),
            }
            for row in _governorates(config)
        ],
        "free_over": flt(config.get("free_over")),
        "note": config.get("note") or "",
        "whatsapp": config.get("whatsapp") or "",
    }


# ------------------------------ validation ------------------------------


def _clean_phone(phone: str) -> str:
    """Egyptian mobiles arrive as 01x…, +201x… or ٠١x… — all mean one number."""
    digits = str(phone or "")
    arabic = "٠١٢٣٤٥٦٧٨٩"
    digits = "".join(str(arabic.index(ch)) if ch in arabic else ch for ch in digits)
    digits = re.sub(r"\D", "", digits)
    if digits.startswith("0020"):
        digits = digits[4:]
    if digits.startswith("20") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) == 10 and digits.startswith("1"):
        digits = "0" + digits
    if not PHONE_RE.match(digits):
        frappe.throw(_("Enter a valid Egyptian mobile number, for example 01012345678."))
    return digits


def _parse_lines(items, item_code, qty) -> list:
    """Either one Buy-now line, or a small basket. Returns [(code, qty)]."""
    lines = []
    if items:
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except ValueError:
                frappe.throw(_("Your basket could not be read. Try again."))
        for row in items or []:
            if not isinstance(row, dict):
                continue
            code = str(row.get("item_code") or "").strip()
            if code:
                lines.append((code, cint(row.get("qty")) or 1))
    elif item_code:
        lines.append((str(item_code).strip(), cint(qty) or 1))
    if not lines:
        frappe.throw(_("Choose something to order first."))
    if len(lines) > MAX_LINES:
        frappe.throw(_("That is too many different items for one order."))
    for code, line_qty in lines:
        if line_qty < 1 or line_qty > MAX_QTY_PER_LINE:
            frappe.throw(_("Quantity must be between 1 and {0}.").format(MAX_QTY_PER_LINE))
    return lines


def _sellable(item_code: str) -> dict:
    """The item must exist, sell, and be on this shop's website — directly or
    through the template it is a variant of. A code typed into the address bar
    must not be orderable just because it exists in the database."""
    item = frappe.db.get_value(
        "Item",
        item_code,
        ["name", "item_name", "disabled", "is_sales_item", "variant_of", "has_variants", "stock_uom"],
        as_dict=True,
    )
    if not item or item.disabled or not item.is_sales_item:
        frappe.throw(_("{0} is not available.").format(item_code))
    if item.has_variants:
        # A template is a family, not a garment: it has no colour and no size,
        # and the warehouse could not pick one.
        frappe.throw(_("Choose a colour and size first."))
    published = frappe.db.get_value("Website Item", {"item_code": item_code}, "published")
    if not published and item.variant_of:
        published = frappe.db.get_value(
            "Website Item", {"item_code": item.variant_of}, "published"
        )
    if not published:
        frappe.throw(_("{0} is not on sale right now.").format(item.item_name or item_code))
    return item


def _rate_for(item_code: str, config: dict) -> float:
    """The site's own price, with its Pricing Rules applied. Never the browser's."""
    from erpnext.utilities.product import get_price

    price = get_price(
        item_code,
        config.get("price_list") or "Standard Selling",
        config.get("customer_group") or CUSTOMER_GROUP_FALLBACK,
        config.get("company"),
    )
    rate = flt((price or {}).get("price_list_rate"))
    if rate <= 0:
        frappe.throw(_("That item has no price yet. Please contact us to order it."))
    return rate


def _guard_rate_limits(phone: str) -> None:
    """A shop that takes orders without a login has to survive someone leaning
    on the button. Counted in the cache, so it costs no table."""
    cache = frappe.cache()
    for key, limit in (
        (f"nezmaro_cod:phone:{phone}", MAX_ORDERS_PER_PHONE_PER_HOUR),
        (f"nezmaro_cod:ip:{frappe.local.request_ip}", MAX_ORDERS_PER_IP_PER_HOUR),
    ):
        used = cint(cache.get_value(key))
        if used >= limit:
            frappe.throw(
                _("That is a lot of orders in one hour. Please message us on WhatsApp instead.")
            )
        cache.set_value(key, used + 1, expires_in_sec=3600)


# ------------------------------ the parties ------------------------------


def _customer_for(full_name: str, phone: str, config: dict) -> str:
    """One customer per phone number: the same shopper ordering again lands on
    their own record, so the shop sees a history instead of strangers."""
    existing = frappe.db.get_value("Contact", {"mobile_no": phone}, "name")
    if existing:
        link = frappe.db.get_value(
            "Dynamic Link",
            {"parent": existing, "parenttype": "Contact", "link_doctype": "Customer"},
            "link_name",
        )
        if link and frappe.db.exists("Customer", link):
            return link
    group = config.get("customer_group") or CUSTOMER_GROUP_FALLBACK
    if not frappe.db.exists("Customer Group", group):
        group = CUSTOMER_GROUP_FALLBACK
    territory = config.get("territory") or TERRITORY_FALLBACK
    if not frappe.db.exists("Territory", territory):
        territory = TERRITORY_FALLBACK
    doc = frappe.get_doc(
        {
            "doctype": "Customer",
            "customer_name": full_name,
            "customer_type": "Individual",
            "customer_group": group,
            "territory": territory,
            "mobile_no": phone,
        }
    )
    try:
        doc.insert(ignore_permissions=True)
    except frappe.DuplicateEntryError:
        # Two shoppers really can share a name; the number keeps them apart.
        doc = frappe.get_doc(
            {
                "doctype": "Customer",
                "customer_name": f"{full_name} {phone[-4:]}",
                "customer_type": "Individual",
                "customer_group": group,
                "territory": territory,
                "mobile_no": phone,
            }
        )
        doc.insert(ignore_permissions=True)
    return doc.name


def _contact_for(customer: str, full_name: str, phone: str) -> str:
    existing = frappe.db.get_value("Contact", {"mobile_no": phone}, "name")
    if existing:
        return existing
    parts = full_name.split(" ", 1)
    contact = frappe.get_doc(
        {
            "doctype": "Contact",
            "first_name": parts[0][:140] or "Customer",
            "last_name": (parts[1] if len(parts) > 1 else "")[:140],
            "mobile_no": phone,
            "links": [{"link_doctype": "Customer", "link_name": customer}],
        }
    )
    contact.insert(ignore_permissions=True)
    return contact.name


def _address_for(customer: str, full_name: str, phone: str, governorate: str, street: str) -> str:
    address = frappe.get_doc(
        {
            "doctype": "Address",
            "address_title": f"{full_name} {phone[-4:]}"[:140],
            "address_type": "Shipping",
            "address_line1": street[:240],
            "city": governorate[:100],
            "country": "Egypt",
            "phone": phone,
            "is_primary_address": 1,
            "is_shipping_address": 1,
            "links": [{"link_doctype": "Customer", "link_name": customer}],
        }
    )
    address.insert(ignore_permissions=True)
    return address.name


# ------------------------------ the order ------------------------------


@frappe.whitelist(allow_guest=True)
def place_order(
    full_name=None,
    phone=None,
    governorate=None,
    address=None,
    item_code=None,
    qty=None,
    items=None,
    notes=None,
):
    """Take a cash-on-delivery order from someone who has no account."""
    config = _config()
    if not _enabled(config):
        frappe.throw(_("Online ordering is not switched on for this shop yet."))

    full_name = str(full_name or "").strip()
    if len(full_name) < 3:
        frappe.throw(_("Enter the name the courier should ask for."))
    street = str(address or "").strip()
    if len(street) < 10:
        frappe.throw(_("Enter the full address: street, building and flat."))
    governorate = str(governorate or "").strip()
    if not any(
        str(row.get("name")).strip().lower() == governorate.lower() for row in _governorates(config)
    ):
        frappe.throw(_("Choose your governorate from the list."))
    phone = _clean_phone(phone)
    lines = _parse_lines(items, item_code, qty)
    _guard_rate_limits(phone)

    company = config.get("company") or frappe.defaults.get_global_default("company")
    if not company:
        frappe.throw(_("This shop is not configured yet."))

    order_items = []
    goods_total = 0.0
    for code, line_qty in lines:
        item = _sellable(code)
        rate = _rate_for(code, config)
        goods_total += rate * line_qty
        row = {
            "item_code": code,
            "qty": line_qty,
            "rate": rate,
            "delivery_date": add_days(nowdate(), cint(config.get("lead_days")) or DEFAULT_LEAD_DAYS),
        }
        warehouse = config.get("warehouse")
        if warehouse and frappe.db.exists("Warehouse", warehouse):
            row["warehouse"] = warehouse
        order_items.append(row)

    fee = _fee_for(config, governorate)
    free_over = flt(config.get("free_over"))
    if free_over and goods_total >= free_over:
        fee = 0.0

    customer = _customer_for(full_name, phone, config)
    contact = _contact_for(customer, full_name, phone)
    shipping = _address_for(customer, full_name, phone, governorate, street)

    order = frappe.get_doc(
        {
            "doctype": "Sales Order",
            "customer": customer,
            "order_type": "Sales",
            "transaction_date": nowdate(),
            "delivery_date": add_days(nowdate(), cint(config.get("lead_days")) or DEFAULT_LEAD_DAYS),
            "company": company,
            "currency": config.get("currency") or "EGP",
            "selling_price_list": config.get("price_list") or "Standard Selling",
            "customer_address": shipping,
            "shipping_address_name": shipping,
            "contact_person": contact,
            "contact_mobile": phone,
            "items": order_items,
        }
    )
    if notes:
        order.terms = str(notes)[:1000]

    account = config.get("freight_account")
    if fee > 0 and account and frappe.db.exists("Account", account):
        tax_row = {
            "charge_type": "Actual",
            "account_head": account,
            "description": _("Delivery to {0}").format(governorate),
            "tax_amount": fee,
        }
        cost_center = config.get("cost_center")
        if cost_center and frappe.db.exists("Cost Center", cost_center):
            tax_row["cost_center"] = cost_center
        order.append("taxes", tax_row)

    order.flags.ignore_permissions = True
    order.insert(ignore_permissions=True)
    order.submit()
    frappe.db.commit()

    return {
        "order": order.name,
        "total": flt(order.grand_total),
        "goods_total": flt(goods_total),
        "delivery_fee": flt(fee),
        "currency": order.currency,
        "customer": customer,
    }


@frappe.whitelist(allow_guest=True)
def quote(governorate=None, item_code=None, qty=None, items=None) -> dict:
    """What the form shows while the shopper is still typing: the real prices
    and the delivery fee for the governorate they picked. Creates nothing."""
    config = _config()
    if not _enabled(config):
        return {"enabled": False}
    lines = _parse_lines(items, item_code, qty)
    rows = []
    goods_total = 0.0
    for code, line_qty in lines:
        item = _sellable(code)
        rate = _rate_for(code, config)
        goods_total += rate * line_qty
        rows.append(
            {
                "item_code": code,
                "item_name": item.item_name,
                "qty": line_qty,
                "rate": rate,
                "amount": rate * line_qty,
            }
        )
    fee = _fee_for(config, governorate) if governorate else 0.0
    free_over = flt(config.get("free_over"))
    free = bool(free_over and goods_total >= free_over)
    if free:
        fee = 0.0
    return {
        "enabled": True,
        "items": rows,
        "goods_total": goods_total,
        "delivery_fee": fee,
        "free_delivery": free,
        "total": goods_total + fee,
        "currency": config.get("currency") or "EGP",
    }


@frappe.whitelist()
def cart_lines() -> list:
    """The signed-in shopper's webshop cart, as checkout lines.

    The webshop cart exists only for a logged-in user and, with no payment
    gateway, its own button asks for a quotation rather than placing an order.
    This lets that cart hand its contents to the cash-on-delivery checkout.
    """
    try:
        from webshop.webshop.shopping_cart.cart import _get_cart_quotation
    except ImportError:
        return []
    quotation = _get_cart_quotation()
    return [
        {"item_code": row.item_code, "qty": cint(row.qty) or 1}
        for row in (quotation.get("items") or [])
        if row.item_code
    ]
