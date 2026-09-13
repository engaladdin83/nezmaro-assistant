"""Seats: the plan's user cap, held on the site itself.

The control plane writes the plan's cap into this site's site_config as
`max_users` -- at provisioning, and again on every plan change -- and nothing in
Frappe ever read it (measured on frappe 15.113.4: no reference anywhere in the
framework). The control panel's Users page was the only enforcement, so a tenant
admin could create any number of users from the desk. The owner decided on
2026-09-13 that the desk must refuse them too.

What takes a seat is the control panel's rule, applied here to the site's own
data: an enabled System User, except Administrator and Guest, and except an
invited accountant -- a user whose roles are only "Accountant (read)" (plus
"Desk User", which the invite adds on sites that have it). Till staff take a
seat like anyone.

A save is refused only when it would ADD a seat: a new enabled desk user, a
disabled one re-enabled, a website user turned into a desk user, or an
accountant given a real role. Editing someone who already holds a seat is never
refused, so a site that is already over its cap (a downgrade keeps everyone)
keeps working -- it just cannot grow.
"""

import frappe
from frappe import _

NOT_A_SEAT = ("Administrator", "Guest")
ACCOUNTANT_ROLE = "Accountant (read)"
ACCOUNTANT_ONLY_ROLES = frozenset({ACCOUNTANT_ROLE, "Desk User"})


def _role_names(rows) -> set[str]:
    names = set()
    for row in rows or []:
        role = row.get("role") if isinstance(row, dict) else getattr(row, "role", None)
        if role:
            names.add(role)
    return names


def is_invited_accountant(roles) -> bool:
    names = _role_names(roles)
    return ACCOUNTANT_ROLE in names and names <= ACCOUNTANT_ONLY_ROLES


def _takes_a_seat(doc) -> bool:
    return (
        doc.name not in NOT_A_SEAT
        and doc.get("user_type") == "System User"
        and bool(doc.get("enabled"))
        and not is_invited_accountant(doc.get("roles"))
    )


def seats_taken(excluding: str) -> int:
    """Enabled desk users holding a seat now, not counting `excluding`."""
    names = frappe.get_all(
        "User",
        filters={"enabled": 1, "user_type": "System User", "name": ["not in", [*NOT_A_SEAT, excluding]]},
        pluck="name",
    )
    taken = 0
    for name in names:
        roles = frappe.get_all("Has Role", filters={"parent": name, "parenttype": "User"}, pluck="role")
        if not is_invited_accountant([{"role": r} for r in roles]):
            taken += 1
    return taken


def enforce_seat_cap(doc, method=None):
    """doc_events User.validate."""
    cap = frappe.utils.cint(frappe.conf.get("max_users"))
    if cap <= 0:
        return
    flags = frappe.flags
    if flags.in_install or flags.in_migrate or flags.in_patch or flags.in_setup_wizard:
        return
    if not _takes_a_seat(doc):
        return
    before = None if doc.is_new() else doc.get_doc_before_save()
    if before is not None and _takes_a_seat(before):
        return  # already held a seat: an edit, not a new seat
    if seats_taken(excluding=doc.name) >= cap:
        frappe.throw(
            _("User limit reached: your plan allows {0} active users. Deactivate someone, or ask us to move you to a larger plan.").format(cap),
            title=_("User limit reached"),
        )
