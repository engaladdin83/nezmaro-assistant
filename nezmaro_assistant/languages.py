"""Languages: a desk user may choose any language for their own account (0.2.6).

A shop keeps only its own Language row enabled (the control plane's
`site_language.apply_site_language`), because Frappe matches a guest's
Accept-Language header against the enabled rows: with English enabled, a phone
set to English gets the Arabic shop in English. Frappe's link search adds
`enabled = 1` for every doctype with an `enabled` check, so the same narrowing
emptied the Language dropdown on the User form -- found live on kami
2026-10-03, where the owner could not choose English for himself.

Saving a disabled language was never refused (`frappe.client.validate_link`
checks only that the row exists) and a signed-in user's language never reads
`enabled`, so this only has to fix the LIST. The User form asks this query
instead of the standard one: every Language row for a desk user, the enabled
ones only for anyone else -- exactly what Frappe would have answered them.
Nothing here enables a row, so the storefront keeps its one language.
"""

import frappe

SEARCH_FIELDS = ("name", "language_name")


@frappe.whitelist()
def search_languages(doctype, txt, searchfield=None, start=0, page_len=20, filters=None, **kwargs):
    if not (frappe.has_permission("Language", "select") or frappe.has_permission("Language", "read")):
        return []

    query_filters = []
    if frappe.get_cached_value("User", frappe.session.user, "user_type") != "System User":
        query_filters.append(["enabled", "=", 1])

    txt = (txt or "").strip()
    or_filters = [[field, "like", f"%{txt}%"] for field in SEARCH_FIELDS] if txt else None

    return frappe.get_all(
        "Language",
        fields=list(SEARCH_FIELDS),
        filters=query_filters,
        or_filters=or_filters,
        order_by="enabled desc, language_name asc",
        start=int(start or 0),
        page_length=int(page_len or 20),
        as_list=True,
    )
