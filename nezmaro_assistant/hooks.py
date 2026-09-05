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
