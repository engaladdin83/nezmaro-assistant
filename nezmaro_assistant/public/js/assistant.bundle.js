// Ask Nezmaro — the in-ERP assistant panel. Loaded on every desk page.
// Adds an "Ask" item to the navbar, remembers the last message the ERP showed
// the user (so "Explain this" works), and talks only to this site's own
// whitelisted method; the site forwards to Nezmaro with its own credentials.
(function () {
  if (!window.frappe) return;

  var lastMessage = "";
  function remember(msg) {
    try {
      var text = typeof msg === "string" ? msg : (msg && (msg.message || msg.msg)) || "";
      if (Array.isArray(msg)) text = msg.map(function (m) { return typeof m === "string" ? m : (m.message || ""); }).join("\n");
      text = String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) lastMessage = text.slice(0, 4000);
    } catch (e) { /* never break the page for the assistant's sake */ }
  }
  // Wrap msgprint once: every validation message and traceback passes here.
  var originalMsgprint = frappe.msgprint;
  frappe.msgprint = function (msg) {
    remember(msg);
    return originalMsgprint.apply(this, arguments);
  };

  var dialog = null;
  var log = null;

  function addMessage(kind, text, links, sources) {
    var box = $('<div class="nz-msg"></div>').addClass("nz-" + kind);
    if (/[؀-ۿ]/.test(text)) box.attr("dir", "rtl");
    box.text(text);
    if (links && links.length) {
      var row = $('<div class="nz-links"></div>');
      links.forEach(function (l) {
        row.append($("<a></a>").attr({ href: l.url, target: "_blank", rel: "noopener" }).text(l.label));
      });
      box.append(row);
    }
    if (sources && sources.length) {
      box.append($('<div class="nz-sources"></div>').text(__("From the manual: ") + sources.join(" · ")));
    }
    log.append(box);
    log.scrollTop(log[0].scrollHeight);
  }

  function ask(question, errorText) {
    if (!question) return;
    addMessage("you", question);
    dialog.set_value("question", "");
    dialog.get_primary_btn().prop("disabled", true);
    var lang = (frappe.boot && frappe.boot.lang === "ar") ? "ar" : null;
    frappe.call({
      method: "nezmaro_assistant.api.ask",
      args: {
        question: question,
        route: frappe.get_route_str ? frappe.get_route_str() : "",
        page_title: document.title,
        error_text: errorText || null,
        lang: lang
      },
      freeze: false,
      callback: function (r) {
        var m = r.message || {};
        addMessage("bot", m.answer || __("No answer came back."), m.links, m.sources);
      },
      error: function () {
        addMessage("bot", __("Sorry — the assistant is unavailable right now."));
      },
      always: function () {
        dialog.get_primary_btn().prop("disabled", false);
      }
    });
  }

  function open() {
    if (!dialog) {
      dialog = new frappe.ui.Dialog({
        title: __("Ask Nezmaro"),
        size: "large",
        fields: [
          { fieldtype: "HTML", fieldname: "log" },
          { fieldtype: "Small Text", fieldname: "question", label: __("Your question"),
            description: __("How do I add a customer? Where is the statement of account? Or ask about your numbers.") }
        ],
        primary_action_label: __("Ask"),
        primary_action: function () {
          ask((dialog.get_value("question") || "").trim(), null);
        },
        secondary_action_label: __("Explain the last message"),
        secondary_action: function () {
          if (!lastMessage) { frappe.show_alert({ message: __("No message to explain yet."), indicator: "orange" }); return; }
          ask(__("What does this message mean and how do I fix it?"), lastMessage);
        }
      });
      log = $('<div class="nz-log"></div>');
      dialog.fields_dict.log.$wrapper.append(log);
      dialog.$wrapper.find("textarea").on("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); dialog.get_primary_btn().click(); }
      });
    }
    dialog.show();
    setTimeout(function () { dialog.fields_dict.question.$input && dialog.fields_dict.question.$input.focus(); }, 200);
  }

  function addNavbarButton() {
    if ($(".nz-ask-nav").length) return;
    // The header holds TWO .navbar-nav lists: #navbar-breadcrumbs on the left,
    // which Frappe empties on every route change (an item put there vanishes
    // at once), and the icon cluster on the right (bell, help, user). Ours
    // goes first in the right-hand list.
    var nav = $("header .navbar ul.navbar-nav").not("#navbar-breadcrumbs").last();
    if (!nav.length) return;
    var item = $('<li class="nav-item nz-ask-nav"><a class="nav-link" href="#" title="' + __("Ask Nezmaro") + '">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"></path></svg>' +
      '<span class="nz-ask-label">' + __("Ask") + "</span></a></li>");
    item.on("click", function (e) { e.preventDefault(); open(); });
    nav.prepend(item);
  }

  $(document).on("app_ready", addNavbarButton);
  $(document).on("page-change", addNavbarButton); // re-add if the navbar is ever rebuilt
  $(function () { setTimeout(addNavbarButton, 800); });
})();
