/**
 * Buy now, cash on delivery (M30) — the website half.
 *
 * The webshop's own buttons assume an account and a payment gateway: with
 * neither, a shopper on a product page can only "Add to Cart", and the cart
 * only offers "Request for Quote". Neither takes an order.
 *
 * This adds the button an Egyptian shop actually needs, next to the engine's:
 * Buy now goes straight to /order with the chosen variant, where a guest gives
 * a name, a number and an address. Nothing here decides a price — the checkout
 * page and the server do that.
 */
(function () {
  var CONFIG_CACHE_KEY = "nz_shop_options";

  // Frappe's translation helper is present on desk pages and usually on
  // website pages; a shop must render its buttons either way.
  var t = typeof window.__ === "function" ? window.__ : function (s) { return s; };

  function shopOptions(then) {
    var cached = null;
    try {
      cached = JSON.parse(sessionStorage.getItem(CONFIG_CACHE_KEY) || "null");
    } catch (e) {
      cached = null;
    }
    if (cached) return then(cached);
    if (!window.frappe || !frappe.call) return then(null);
    frappe.call({
      method: "nezmaro_assistant.checkout.options",
      type: "GET",
      callback: function (r) {
        var options = (r && r.message) || null;
        try {
          sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(options));
        } catch (e) {
          /* a private window without storage is still a shopper */
        }
        then(options);
      },
      error: function () {
        then(null);
      },
    });
  }

  function button(label) {
    var el = document.createElement("button");
    el.type = "button";
    el.className = "btn btn-primary w-100 nz-buy-now";
    el.textContent = label;
    el.style.cssText = "margin-bottom:8px;";
    return el;
  }

  function chosenVariant() {
    // Once the shopper picks a colour and size, the engine's dialog renders an
    // Add-to-Cart carrying the exact variant. That is the code we want.
    var picked = document.querySelector(".modal .btn-add-to-cart[data-item-code]");
    if (picked && picked.dataset.itemCode) return picked.dataset.itemCode;
    return null;
  }

  function pageItemCode() {
    var el = document.querySelector("[data-item-code]");
    return el ? el.getAttribute("data-item-code") : null;
  }

  function hasVariants() {
    return !!document.querySelector(".btn-configure");
  }

  function go(items) {
    window.location.href = "/order?items=" + encodeURIComponent(JSON.stringify(items));
  }

  function hint(afterEl, message) {
    var existing = document.querySelector(".nz-buy-hint");
    if (existing) existing.remove();
    var note = document.createElement("div");
    note.className = "nz-buy-hint";
    note.textContent = message;
    // The app ships no stylesheet on website pages, and an unstyled hint under
    // a button reads as a broken page rather than an instruction.
    note.style.cssText =
      "margin-top:8px;padding:8px 10px;border-radius:8px;background:#fffbeb;" +
      "border:1px solid #fde68a;color:#92400e;font-size:.9rem;";
    afterEl.parentNode.insertBefore(note, afterEl.nextSibling);
  }

  function mountProductPage() {
    var cartBtn = document.querySelector(".btn-add-to-cart, .btn-configure");
    if (!cartBtn || document.querySelector(".nz-buy-now")) return;
    var buy = button(t("Buy now — cash on delivery"));
    buy.addEventListener("click", function () {
      var code = chosenVariant();
      if (!code && hasVariants()) {
        var configure = document.querySelector(".btn-configure");
        if (configure) configure.click();
        hint(buy, t("Choose a colour and size, then press Buy now again."));
        return;
      }
      code = code || pageItemCode();
      if (!code) return;
      go([{ item_code: code, qty: 1 }]);
    });
    cartBtn.parentNode.insertBefore(buy, cartBtn);
  }

  function mountCartPage() {
    var anchor = document.querySelector(".btn-place-order, .btn-request-for-quote, #place-order");
    if (!anchor) {
      var cards = document.querySelectorAll(".cart-payment-addresses .card, .cart-container .card");
      anchor = cards.length ? cards[0].querySelector("button, a") : null;
    }
    if (!anchor || document.querySelector(".nz-buy-now")) return;
    var buy = button(t("Place order — cash on delivery"));
    buy.addEventListener("click", function () {
      buy.disabled = true;
      frappe.call({
        method: "nezmaro_assistant.checkout.cart_lines",
        callback: function (r) {
          var lines = (r && r.message) || [];
          if (!lines.length) {
            buy.disabled = false;
            return hint(buy, t("Your cart is empty."));
          }
          go(lines);
        },
        error: function () {
          buy.disabled = false;
          hint(buy, t("Could not read your cart. Try again."));
        },
      });
    });
    anchor.parentNode.insertBefore(buy, anchor);
  }

  function mount() {
    var path = window.location.pathname;
    if (path.indexOf("/order") === 0) return; // the checkout page itself
    shopOptions(function (options) {
      if (!options || !options.enabled) return;
      if (path === "/cart") mountCartPage();
      else mountProductPage();
    });
  }

  if (window.frappe && frappe.ready) frappe.ready(mount);
  else document.addEventListener("DOMContentLoaded", mount);
})();
