// Nezmaro Apps (0.2.0) — the home screen of big app icons, like Odoo's.
// A nine-dot button in the navbar on every desk page opens it; it also opens
// by itself when the desk starts at the bare /app (where login lands). It lists
// the workspaces the sidebar already gives this user — the server decides what
// is visible (edition presets hide workspaces, roles restrict them) — so the
// launcher never shows an app the sidebar would not.
(function () {
  if (!window.frappe) return;

  var AR = frappe.boot && frappe.boot.lang === "ar";
  var T = AR
    ? { apps: "التطبيقات", find: "ابحث عن تطبيق…", none: "لا يوجد تطبيق بهذا الاسم",
        morning: "صباح الخير", afternoon: "مساء الخير", evening: "مساء الخير", close: "إغلاق" }
    : { apps: "Apps", find: "Find an app…", none: "No app by that name",
        morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", close: "Close" };
  // Gregorian calendar, Latin digits (the house rule for Arabic dates).
  var LOCALE = AR ? "ar-EG-u-nu-latn" : "en-GB";

  // Each edition's own desk (app/services/edition_desks.py DESKS titles) leads the grid.
  var DESKS = { Overview: 1, Counter: 1, Clinic: 1, Shop: 1, Service: 1 };

  // One flat, multi-colour drawing per app on a 64 grid; no text inside.
  var ICONS = {
    shop: '<rect x="10" y="26" width="44" height="30" rx="4" fill="#3B82F6"/><rect x="26" y="38" width="12" height="18" rx="2" fill="#fff"/><path d="M8 14h48l4 12H4z" fill="#F43F5E"/><path d="M16 14h8l-2 12h-8zM32 14h8l2 12h-8z" fill="#fff" opacity=".85"/><rect x="42" y="34" width="8" height="8" rx="1.5" fill="#FBBF24"/>',
    overview: '<rect x="8" y="8" width="22" height="22" rx="6" fill="#8B5CF6"/><rect x="34" y="8" width="22" height="10" rx="5" fill="#F43F5E"/><rect x="34" y="22" width="22" height="8" rx="4" fill="#F43F5E" opacity=".6"/><rect x="8" y="34" width="22" height="22" rx="6" fill="#3B82F6"/><rect x="34" y="34" width="9" height="22" rx="4" fill="#14B8A6"/><rect x="47" y="42" width="9" height="14" rx="4" fill="#14B8A6" opacity=".7"/>',
    counter: '<rect x="8" y="30" width="48" height="26" rx="5" fill="#3B82F6"/><rect x="14" y="8" width="30" height="18" rx="4" fill="#14B8A6"/><rect x="18" y="12" width="22" height="7" rx="2" fill="#fff" opacity=".85"/><rect x="26" y="26" width="6" height="4" fill="#0F766E"/><g fill="#fff" opacity=".9"><rect x="14" y="36" width="7" height="5" rx="1.5"/><rect x="24" y="36" width="7" height="5" rx="1.5"/><rect x="34" y="36" width="7" height="5" rx="1.5"/><rect x="14" y="45" width="7" height="5" rx="1.5"/><rect x="24" y="45" width="7" height="5" rx="1.5"/></g><rect x="44" y="36" width="7" height="14" rx="2" fill="#F59E0B"/>',
    clinic: '<path d="M32 56S8 42 8 24a12 12 0 0124-4 12 12 0 0124 4c0 18-24 32-24 32z" fill="#F43F5E"/><path d="M28 22h8v8h8v8h-8v8h-8v-8h-8v-8h8z" fill="#fff"/>',
    accounting: '<rect x="8" y="6" width="34" height="48" rx="7" fill="#1E40AF"/><rect x="13" y="11" width="24" height="11" rx="3" fill="#93C5FD"/><g fill="#fff" opacity=".9"><circle cx="17" cy="30" r="3"/><circle cx="25" cy="30" r="3"/><circle cx="33" cy="30" r="3"/><circle cx="17" cy="39" r="3"/><circle cx="25" cy="39" r="3"/><circle cx="17" cy="48" r="3"/></g><circle cx="44" cy="44" r="15" fill="#F59E0B" opacity=".95"/><circle cx="44" cy="44" r="9.5" fill="none" stroke="#fff" stroke-width="3"/>',
    payables: '<rect x="6" y="16" width="44" height="34" rx="7" fill="#F43F5E"/><rect x="32" y="26" width="24" height="14" rx="5" fill="#FDA4AF"/><circle cx="41" cy="33" r="3" fill="#fff"/><path d="M50 8v18M43 19l7 7 7-7" stroke="#1E40AF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    receivables: '<rect x="6" y="16" width="44" height="34" rx="7" fill="#22C55E"/><rect x="32" y="26" width="24" height="14" rx="5" fill="#86EFAC"/><circle cx="41" cy="33" r="3" fill="#fff"/><path d="M50 26V8M43 15l7-7 7 7" stroke="#1E40AF" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    reports: '<circle cx="30" cy="34" r="22" fill="#3B82F6"/><path d="M30 34V12a22 22 0 0122 22z" fill="#F59E0B"/><path d="M30 34h22a22 22 0 01-9 17.8z" fill="#F43F5E"/><circle cx="30" cy="34" r="8" fill="#fff"/>',
    buying: '<path d="M22 22v-4a10 10 0 0120 0v4" stroke="#8B5CF6" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M10 22h44l-4 34H14z" fill="#14B8A6"/><path d="M10 22h44l-1.5 12H11.5z" fill="#0F766E" opacity=".35"/><circle cx="24" cy="30" r="3" fill="#fff"/><circle cx="40" cy="30" r="3" fill="#fff"/>',
    selling: '<rect x="8" y="34" width="12" height="22" rx="3" fill="#F59E0B"/><rect x="26" y="22" width="12" height="34" rx="3" fill="#F43F5E"/><rect x="44" y="10" width="12" height="46" rx="3" fill="#8B5CF6"/><path d="M8 26L24 14l8 6 18-14" stroke="#1E40AF" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>',
    stock: '<path d="M32 6l24 13v26L32 58 8 45V19z" fill="#8B5CF6"/><path d="M32 32L8 19l24-13 24 13z" fill="#F97316"/><path d="M32 32v26L8 45V19z" fill="#F59E0B"/><path d="M20 12.5l24 13v9" stroke="#fff" stroke-width="4" fill="none" opacity=".8"/>',
    users: '<circle cx="24" cy="22" r="10" fill="#3B82F6"/><path d="M6 54a18 18 0 0136 0z" fill="#3B82F6"/><circle cx="43" cy="24" r="8.5" fill="#14B8A6" opacity=".9"/><path d="M28 54a15 15 0 0130 0z" fill="#14B8A6" opacity=".9"/>',
    website: '<rect x="6" y="10" width="52" height="42" rx="7" fill="#8B5CF6"/><rect x="6" y="10" width="52" height="11" rx="5" fill="#6D28D9"/><circle cx="13" cy="15.5" r="2" fill="#fff"/><circle cx="20" cy="15.5" r="2" fill="#fff"/><circle cx="32" cy="37" r="11" fill="#5EEAD4"/><path d="M21 37h22M32 26c5 5 5 17 0 22M32 26c-5 5-5 17 0 22" stroke="#0F766E" stroke-width="2.2" fill="none"/>',
    settings: '<circle cx="32" cy="32" r="19" fill="none" stroke="#64748B" stroke-width="10" stroke-dasharray="7.46 7.46"/><circle cx="32" cy="32" r="16" fill="#64748B"/><circle cx="32" cy="32" r="7" fill="#FBBF24"/>',
    crm: '<circle cx="32" cy="32" r="24" fill="#FDA4AF"/><circle cx="32" cy="32" r="16" fill="#F43F5E"/><circle cx="32" cy="32" r="8" fill="#fff"/><path d="M32 32L54 10" stroke="#1E40AF" stroke-width="4.5" stroke-linecap="round"/><path d="M48 8l7 1 1 7" stroke="#1E40AF" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    assets: '<rect x="10" y="14" width="26" height="42" rx="3" fill="#0F766E"/><rect x="36" y="28" width="18" height="28" rx="3" fill="#14B8A6"/><g fill="#fff" opacity=".85"><rect x="15" y="20" width="6" height="6" rx="1"/><rect x="25" y="20" width="6" height="6" rx="1"/><rect x="15" y="31" width="6" height="6" rx="1"/><rect x="25" y="31" width="6" height="6" rx="1"/><rect x="41" y="34" width="8" height="5" rx="1"/></g><rect x="19" y="44" width="8" height="12" rx="1" fill="#FBBF24"/>',
    manufacturing: '<rect x="42" y="8" width="9" height="22" rx="2" fill="#64748B"/><path d="M6 56V30l14 9v-9l14 9v-9l22 10v16z" fill="#F97316"/><g fill="#fff" opacity=".85"><rect x="12" y="44" width="7" height="6" rx="1"/><rect x="26" y="44" width="7" height="6" rx="1"/><rect x="40" y="44" width="7" height="6" rx="1"/></g>',
    quality: '<circle cx="27" cy="27" r="18" fill="#3B82F6"/><circle cx="27" cy="27" r="12" fill="#DBEAFE"/><path d="M40 40l14 14" stroke="#8B5CF6" stroke-width="8" stroke-linecap="round"/><path d="M21 27l5 5 9-10" stroke="#16A34A" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    projects: '<rect x="6" y="8" width="15" height="48" rx="4" fill="#DBEAFE"/><rect x="25" y="8" width="15" height="48" rx="4" fill="#DBEAFE"/><rect x="44" y="8" width="15" height="48" rx="4" fill="#DBEAFE"/><rect x="8.5" y="12" width="10" height="9" rx="2" fill="#3B82F6"/><rect x="8.5" y="24" width="10" height="9" rx="2" fill="#3B82F6"/><rect x="27.5" y="12" width="10" height="9" rx="2" fill="#F59E0B"/><rect x="46.5" y="12" width="10" height="9" rx="2" fill="#22C55E"/><rect x="46.5" y="24" width="10" height="9" rx="2" fill="#22C55E"/><rect x="46.5" y="36" width="10" height="9" rx="2" fill="#22C55E"/>',
    support: '<path d="M12 34v-4a20 20 0 0140 0v4" stroke="#1E40AF" stroke-width="5" fill="none"/><rect x="6" y="32" width="14" height="20" rx="6" fill="#3B82F6"/><rect x="44" y="32" width="14" height="20" rx="6" fill="#3B82F6"/><path d="M51 52c0 5-6 7-14 7" stroke="#14B8A6" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="34" cy="59" r="4" fill="#14B8A6"/>',
    tools: '<path d="M14 50L38 26" stroke="#64748B" stroke-width="9" stroke-linecap="round"/><path d="M40 8a14 14 0 00-4 16l6 6a14 14 0 0016-4l-8-2-2-8z" fill="#F59E0B"/><path d="M12 12l8 8M20 12l-8 8" stroke="#F43F5E" stroke-width="5" stroke-linecap="round"/><circle cx="46" cy="46" r="10" fill="#14B8A6"/>',
    integrations: '<circle cx="18" cy="18" r="10" fill="#8B5CF6"/><circle cx="46" cy="18" r="10" fill="#F43F5E"/><circle cx="32" cy="46" r="12" fill="#3B82F6"/><path d="M22 26l6 10M42 26l-6 10M28 18h8" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round" opacity=".35"/>',
    build: '<rect x="8" y="34" width="22" height="22" rx="4" fill="#F59E0B"/><rect x="34" y="34" width="22" height="22" rx="4" fill="#3B82F6"/><rect x="21" y="8" width="22" height="22" rx="4" fill="#F43F5E"/><circle cx="19" cy="45" r="3" fill="#fff"/><circle cx="45" cy="45" r="3" fill="#fff"/><circle cx="32" cy="19" r="3" fill="#fff"/>'
  };
  // Workspace NAME (never its title: titles are retitled and translated) -> drawing.
  var BY_NAME = {
    "Shop": "shop", "Overview": "overview", "Counter": "counter", "Service": "counter", "Clinic": "clinic",
    "Healthcare": "clinic", "Home": "overview", "Accounting": "accounting", "Payables": "payables",
    "Receivables": "receivables", "Financial Reports": "reports", "Buying": "buying", "Selling": "selling",
    "Stock": "stock", "Users": "users", "Website": "website", "ERPNext Settings": "settings",
    "Settings": "settings", "CRM": "crm", "Assets": "assets", "Manufacturing": "manufacturing",
    "Quality": "quality", "Projects": "projects", "Support": "support", "Tools": "tools",
    "Integrations": "integrations", "ERPNext Integrations": "integrations", "Build": "build"
  };
  var FALLBACK = ["#3B82F6", "#8B5CF6", "#14B8A6", "#F59E0B", "#F43F5E", "#22C55E", "#F97316"];

  function esc(s) { return $("<div>").text(s == null ? "" : String(s)).html(); }

  function iconFor(page, label) {
    var key = BY_NAME[page.name];
    if (key) return '<svg viewBox="0 0 64 64" aria-hidden="true">' + ICONS[key] + "</svg>";
    // An app we have no drawing for (a tenant's own workspace, a new engine module):
    // its first letter on a colour picked from its name, so it is stable.
    var n = 0, name = String(page.name || "");
    for (var i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) >>> 0;
    var letter = esc((label || name || "?").trim().charAt(0).toUpperCase());
    return '<span class="nz-app-letter" style="background:' + FALLBACK[n % FALLBACK.length] + '">' + letter + "</span>";
  }

  function routeFor(page) {
    // The sidebar's own rule (frappe/public/js/frappe/views/workspace/workspace.js).
    var slug = frappe.router.slug(page.title || page.name);
    return "/app/" + (page.public ? slug : "private/" + slug);
  }

  var pagesPromise = null;
  function loadPages() {
    if (!pagesPromise) {
      var boot = frappe.boot && frappe.boot.sidebar_pages;
      pagesPromise = (boot && boot.pages ? Promise.resolve(boot)
        : frappe.xcall("frappe.desk.desktop.get_workspace_sidebar_items"))
        .then(function (r) {
          // Top level only (children sit under their parent, as in the sidebar);
          // hidden ones stay out even for a Workspace Manager, whose sidebar still has them.
          var pages = ((r && r.pages) || []).filter(function (p) {
            return !p.parent_page && !cint(p.is_hidden) && p.title !== "Welcome Workspace";
          });
          var mine = pages.filter(function (p) { return !p.public; });
          return pages.filter(function (p) { return p.public; }).concat(mine);
        })
        .catch(function () { pagesPromise = null; return []; });
    }
    return pagesPromise;
  }

  function cint(v) { return parseInt(v, 10) || 0; }

  var overlay = null;
  var openedRoute = null;

  function greeting() {
    var h = new Date().getHours();
    var word = h < 12 ? T.morning : h < 17 ? T.afternoon : T.evening;
    var full = (frappe.session && frappe.session.user_fullname) || "";
    var first = full.split(" ")[0];
    return first && first !== "Administrator" ? word + (AR ? "، " : ", ") + first : word;
  }

  function build() {
    overlay = $(
      '<div class="nz-launch" role="dialog" aria-modal="true" hidden>' +
        '<div class="nz-launch-wrap">' +
          '<div class="nz-launch-head">' +
            '<div><div class="nz-launch-greet" dir="auto"></div><div class="nz-launch-date" dir="auto"></div></div>' +
            '<input class="nz-launch-find" type="search" autocomplete="off" dir="auto">' +
          "</div>" +
          '<div class="nz-launch-apps"></div>' +
          '<div class="nz-launch-none" dir="auto" hidden></div>' +
        "</div>" +
      "</div>"
    );
    overlay.attr("aria-label", T.apps);
    overlay.find(".nz-launch-find").attr({ placeholder: T.find, "aria-label": T.find });
    overlay.find(".nz-launch-none").text(T.none);
    overlay.find(".nz-launch-find").on("input", filter).on("keydown", function (e) {
      if (e.key === "Enter") {
        var first = overlay.find(".nz-app:visible").first();
        if (first.length) { e.preventDefault(); first[0].click(); }
      }
    });
    // Frappe's own link handler routes /app/... in place; we only close behind it.
    overlay.on("click", ".nz-app", function () { close(); });
    $("body").append(overlay);
  }

  function filter() {
    var q = String(overlay.find(".nz-launch-find").val() || "").trim().toLowerCase();
    var shown = 0;
    overlay.find(".nz-app").each(function () {
      var hit = !q || String($(this).data("search")).indexOf(q) !== -1;
      $(this).toggle(hit);
      if (hit) shown++;
    });
    overlay.find(".nz-launch-none").prop("hidden", shown > 0);
  }

  function render(pages) {
    var html = pages.map(function (p) {
      var label = __(p.title || p.name);
      var search = (label + " " + (p.title || "") + " " + (p.name || "")).toLowerCase();
      return '<a class="nz-app' + (DESKS[p.name] ? " nz-app-home" : "") + '" href="' + esc(routeFor(p)) +
        '" data-search="' + esc(search) + '"><span class="nz-app-tile">' + iconFor(p, label) +
        '</span><span class="nz-app-name" dir="auto">' + esc(label) + "</span></a>";
    }).join("");
    overlay.find(".nz-launch-apps").html(html);
    filter();
  }

  function placeBelowNavbar() {
    var nav = document.querySelector("header.navbar");
    overlay.css("top", (nav ? nav.getBoundingClientRect().bottom : 0) + "px");
  }

  function open() {
    if (!overlay) build();
    overlay.find(".nz-launch-greet").text(greeting());
    overlay.find(".nz-launch-date").text(new Date().toLocaleDateString(LOCALE,
      { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    overlay.find(".nz-launch-find").val("");
    filter(); // the last search must not linger over the grid until it re-renders
    placeBelowNavbar();
    overlay.prop("hidden", false);
    $("body").addClass("nz-launch-open");
    $(".nz-apps-btn").attr("aria-expanded", "true");
    openedRoute = frappe.get_route_str ? frappe.get_route_str() : "";
    loadPages().then(function (pages) {
      render(pages);
      // Not on a phone: the keyboard would cover the grid it is meant to find.
      if (window.matchMedia("(min-width: 768px)").matches) overlay.find(".nz-launch-find").trigger("focus");
    });
  }

  function close() {
    if (!overlay || overlay.prop("hidden")) return;
    overlay.prop("hidden", true);
    $("body").removeClass("nz-launch-open");
    $(".nz-apps-btn").attr("aria-expanded", "false");
  }

  function isOpen() { return overlay && !overlay.prop("hidden"); }

  var GRID = '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
    [1, 7.5, 14].map(function (y) {
      return [1, 7.5, 14].map(function (x) { return '<rect x="' + x + '" y="' + y + '" width="5" height="5" rx="1.5"/>'; }).join("");
    }).join("") + "</svg>";

  function addNavbarButton() {
    if ($(".nz-apps-nav").length) return;
    var nav = $("header.navbar ul.navbar-nav").not("#navbar-breadcrumbs").last();
    if (!nav.length) return;
    var item = $('<li class="nav-item nz-apps-nav"><a class="nz-apps-btn" href="#" role="button" aria-expanded="false"></a></li>');
    item.find("a").attr({ title: T.apps, "aria-label": T.apps }).append(GRID);
    item.on("click", function (e) { e.preventDefault(); isOpen() ? close() : open(); });
    // Beside Ask Nezmaro when it is there (the two scripts start in either order).
    var ask = nav.children(".nz-ask-nav");
    if (ask.length) ask.after(item); else nav.prepend(item);
  }

  $(document).on("keydown", function (e) { if (e.key === "Escape" && isOpen()) close(); });
  $(window).on("resize", function () { if (isOpen()) placeBelowNavbar(); });

  // The home screen: the desk started at the bare /app, which is where login lands.
  // The router then renders the first workspace; the launcher opens over it once
  // that first page is drawn, so the route change does not close it straight away.
  var landing = /^\/app\/?$/.test(window.location.pathname);
  // Right after that, the desk may settle the first workspace's route once more
  // (/app -> /app/shop); a workspace route inside this window is that, not the user.
  var settleUntil = 0;

  function land() {
    landing = false;
    settleUntil = Date.now() + 2000;
    open();
  }

  $(document).on("page-change", function () {
    addNavbarButton(); // re-add if the navbar is ever rebuilt
    if (landing) { setTimeout(function () { if (landing) land(); }, 60); return; }
    if (!isOpen() || !frappe.get_route_str) return;
    var now = frappe.get_route_str();
    if (now === openedRoute) return;
    var route = frappe.get_route ? frappe.get_route() : [];
    if (Date.now() < settleUntil && route[0] === "Workspaces") { openedRoute = now; return; }
    // Moving anywhere else (a link, the awesome bar, Back) leaves the home screen.
    close();
  });
  $(document).on("app_ready", function () {
    addNavbarButton();
    setTimeout(function () { if (landing) land(); }, 1500);
  });
  $(function () { setTimeout(addNavbarButton, 800); });
})();
