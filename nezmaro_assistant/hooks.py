app_name = "nezmaro_assistant"
app_title = "Nezmaro Assistant"
app_publisher = "ASMY Co."
app_description = "Ask Nezmaro: how-to help, error help and data questions inside the ERP"
app_email = "info@hdgcommunity.com"
app_license = "MIT"
required_apps = ["frappe/erpnext"]

# The whole app: one script and one stylesheet on every desk page.
app_include_js = ["assistant.bundle.js"]
app_include_css = ["assistant.bundle.css"]

# M30: the shop half. One script on the WEBSITE pages, which adds the
# cash-on-delivery Buy-now button the webshop has no notion of. The checkout
# page itself (/order) carries its own styling and skips this script.
web_include_js = ["shop.bundle.js"]

# 0.1.7: the plan's user cap, enforced on the site too. The control plane writes
# `max_users` into site_config; until this hook nothing read it, so users created
# from the desk were never counted. See seats.py.
doc_events = {
    "User": {
        "validate": "nezmaro_assistant.seats.enforce_seat_cap",
    },
}

# 0.1.8: the storefront's browser-drawn words in the shop's own language (a
# message dictionary merged UNDER the page's own), shops only. See storefront.py.
update_website_context = ["nezmaro_assistant.storefront.add_message_dictionary"]

# 0.1.8 (#81): a "Send statement" button on the Customer page -- the month's
# statement of account by email and on WhatsApp. See statement.py.
doctype_js = {"Customer": "public/js/customer_statement.js"}
