"""The shop's own words, in the shop's language, on every website page (0.1.8).

Webshop draws the product list, the variant dialog and the cart in JavaScript,
so no Translation record reaches them: an Arabic shop still said OFF, Search for
Products and Select Variant, and every colour name stayed English. Kami Closet
worked around it with a dictionary written into its own head_html (2026-09-06);
this is that fix for every shop, without touching the tenant's settings.

Measured 2026-09-13: webshop ships no Arabic at all, and Frappe's own ar.po covers
7 of webshop's 45 browser strings. The Arabic for them now ships with this app
(translations/ar.csv); a tenant's own Translation records still win over it.

How: an update_website_context hook adds one small script to the page head. Once
the page has loaded -- a head script resets window.frappe outright, so anything
assigned earlier is dropped -- it MERGES the dictionary UNDER whatever the page
already holds. A tenant's own dictionary, whenever it is assigned, keeps its
wording.
"""

import json

import frappe

CACHE_SECONDS = 600

# The strings the storefront draws in the browser: webshop's shop-facing
# scripts (desk-only files left out), Frappe's own controls on those pages, and
# what a live Arabic shop turned out to need. "Nex" is webshop's own typo.
STOREFRONT_MESSAGES = (
    "Add to Cart",
    "Add to Quote",
    "Available on backorder",
    "Cannot find a matching Item. Please select some other value for {0}.",
    "Cart is Empty",
    "Categories",
    "Clear",
    "Clear Values",
    "Clear values",
    "Confirm",
    "Continue Selection",
    "Discounts",
    "Enter value betweeen {0} and {1}",
    "Explore",
    "Go to Cart",
    "Go to Quote",
    "In stock",
    "Loading...",
    "Nex",
    "Next",
    "No products found",
    "No searches yet.",
    "Note",
    "OFF",
    "Out of stock",
    "Pay Remaining",
    "Prev",
    "Recent",
    "Review Submitted",
    "Search for Products",
    "Select Variant",
    "Select Variant for {0}",
    "Something went wrong. Please refresh or contact us.",
    "Sorry, something went wrong. Please refresh.",
    "Submit",
    "Submitting Review ...",
    "Thank you for submitting your review",
    "Value must be between {0} and {1}",
    "Write a Review",
    "{0} item found.",
    "{0} items found.",
)

# What public/js/shop.bundle.js draws (the Buy-now half of this app).
SHOP_MESSAGES = (
    "Buy now — cash on delivery",
    "Choose a colour and size, then press Buy now again.",
    "Could not read your cart. Try again.",
    "Place order — cash on delivery",
    "Your cart is empty.",
)


def _attribute_words():
    """Attribute names and values reach __() through the variant dialog. They
    are the tenant's own data, translated by the tenant's own records."""
    try:
        names = frappe.get_all("Item Attribute", pluck="name")
        values = frappe.get_all("Item Attribute Value", pluck="attribute_value")
    except Exception:
        return []
    return [str(word) for word in [*names, *values] if word]


def message_dictionary(lang):
    """{English: translated} for everything the storefront draws, in `lang`.
    Only strings that actually translate are included."""
    if not lang or str(lang).lower().startswith("en"):
        return {}
    cache_key = f"nezmaro_storefront_messages:{lang}"
    cached = frappe.cache().get_value(cache_key)
    if cached is not None:
        return cached
    messages = {}
    for key in dict.fromkeys([*STOREFRONT_MESSAGES, *SHOP_MESSAGES, *_attribute_words()]):
        translated = frappe._(key, lang=lang)
        if translated and translated != key:
            messages[key] = translated
    frappe.cache().set_value(cache_key, messages, expires_in_sec=CACHE_SECONDS)
    return messages


def dictionary_script(messages):
    payload = json.dumps(messages, ensure_ascii=False, sort_keys=True).replace("</", "<\\/")
    return (
        "<script>window.addEventListener('DOMContentLoaded',function(){"
        "window.frappe=window.frappe||{};"
        f"frappe._messages=Object.assign({{}},{payload},frappe._messages||{{}});"
        "});</script>"
    )


def add_message_dictionary(context):
    """update_website_context: shops only, and only when the page is not in English."""
    if "webshop" not in frappe.get_installed_apps():
        return None
    messages = message_dictionary(getattr(frappe.local, "lang", None) or "en")
    if not messages:
        return None
    return {"head_include": (context.get("head_include") or "") + dictionary_script(messages)}
