// Nezmaro Apps (0.2.0, icons and app header 0.2.1) — the home screen of big app icons, like Odoo's.
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

  // 0.2.1: one polished icon per workspace, drawn as a set (Recraft V4.1 vector via
  // Higgsfield, 2026-09-26) and shipped as files in public/icons/apps. The ?v= busts the
  // year-long browser cache the host gives /assets. Keyed by workspace NAME, never its
  // title: titles are retitled and translated.
  var ICON_VERSION = "0.2.1";
  var BY_NAME = {
    "Shop": "shop", "Overview": "overview", "Counter": "counter", "Service": "service", "Clinic": "clinic",
    "Healthcare": "healthcare", "Home": "home", "Accounting": "accounting", "Payables": "payables",
    "Receivables": "receivables", "Financial Reports": "reports", "Buying": "buying", "Selling": "selling",
    "Stock": "stock", "Users": "users", "Website": "website", "ERPNext Settings": "settings",
    "Settings": "settings", "CRM": "crm", "Assets": "assets", "Manufacturing": "manufacturing",
    "Quality": "quality", "Projects": "projects", "Support": "support", "Tools": "tools",
    "Integrations": "integrations", "ERPNext Integrations": "integrations", "Build": "build"
  };
  var FALLBACK = ["#3B82F6", "#8B5CF6", "#14B8A6", "#F59E0B", "#F43F5E", "#22C55E", "#F97316"];

  function esc(s) { return $("<div>").text(s == null ? "" : String(s)).html(); }

  function iconUrl(name) {
    var key = BY_NAME[name];
    return key ? "/assets/nezmaro_assistant/icons/apps/" + key + ".svg?v=" + ICON_VERSION : null;
  }

  function iconFor(page, label, cls) {
    var url = iconUrl(page.name);
    if (url) return '<img class="' + (cls || "") + '" src="' + url + '" alt="" aria-hidden="true" draggable="false">';
    // An app we have no drawing for (a tenant's own workspace, a new engine module):
    // its first letter on a colour picked from its name, so it is stable.
    var n = 0, name = String(page.name || "");
    for (var i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) >>> 0;
    var letter = esc((label || name || "?").trim().charAt(0).toUpperCase());
    return '<span class="nz-app-letter ' + (cls || "") + '" style="background:' + FALLBACK[n % FALLBACK.length] + '">' + letter + "</span>";
  }

  function routeFor(page) {
    // The sidebar's own rule (frappe/public/js/frappe/views/workspace/workspace.js).
    var slug = frappe.router.slug(page.title || page.name);
    return "/app/" + (page.public ? slug : "private/" + slug);
  }

  // Every workspace the sidebar gives this user (children and hidden ones included);
  // measured 2026-09-26: this Frappe does not put the list in frappe.boot, so the
  // server call is the path that runs.
  var allPromise = null;
  function loadAll() {
    if (!allPromise) {
      var boot = frappe.boot && frappe.boot.sidebar_pages;
      allPromise = (boot && boot.pages ? Promise.resolve(boot)
        : frappe.xcall("frappe.desk.desktop.get_workspace_sidebar_items"))
        .then(function (r) { return (r && r.pages) || []; })
        .catch(function () { allPromise = null; return []; });
    }
    return allPromise;
  }

  function loadPages() {
    // The launcher: top level only (children sit under their parent, as in the
    // sidebar); hidden ones stay out even for a Workspace Manager.
    return loadAll().then(function (all) {
      var pages = all.filter(function (p) {
        return !p.parent_page && !cint(p.is_hidden) && p.title !== "Welcome Workspace";
      });
      var mine = pages.filter(function (p) { return !p.public; });
      return pages.filter(function (p) { return p.public; }).concat(mine);
    });
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
        '" data-search="' + esc(search) + '"><span class="nz-app-tile">' + iconFor(p, label, "nz-app-img") +
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

  // ---------------------------------------------------------------------------
  // 0.2.1 — the app you are in, Odoo-style: its icon and name beside the logo on
  // every page (a list, a form, a report), and a click takes you back to its desk.
  // The workspace comes from the route on a desk, and from Frappe's own breadcrumb
  // record elsewhere (a Sales Order page carries workspace "Selling").
  function findPage(all, key) {
    if (!key) return null;
    var slug = frappe.router.slug(key);
    for (var i = 0; i < all.length; i++) {
      var p = all[i];
      if (p.name === key || p.title === key || frappe.router.slug(p.title || p.name) === slug) return p;
    }
    return null;
  }

  function currentWorkspaceKey() {
    var route = frappe.get_route ? frappe.get_route() : [];
    if (route[0] === "Workspaces") return route[1] === "private" ? route[2] : route[1];
    var bc = frappe.breadcrumbs && frappe.breadcrumbs.all && frappe.breadcrumbs.current_page
      ? frappe.breadcrumbs.all[frappe.breadcrumbs.current_page()] : null;
    return bc && bc.workspace ? bc.workspace : null;
  }

  function updateAppHead() {
    var brand = $("header.navbar .navbar-brand").first();
    if (!brand.length) return;
    var head = brand.siblings(".nz-apphead");
    if (!head.length) {
      head = $('<a class="nz-apphead" hidden><span class="nz-apphead-icon"></span><span class="nz-apphead-name" dir="auto"></span></a>');
      brand.after(head);
    }
    var key = currentWorkspaceKey();
    loadAll().then(function (all) {
      var page = findPage(all, key);
      if (!page) { head.prop("hidden", true); return; }
      var label = __(page.title || page.name);
      head.attr({ href: routeFor(page), title: label });
      head.find(".nz-apphead-icon").html(iconFor(page, label, "nz-apphead-img"));
      head.find(".nz-apphead-name").text(label);
      head.prop("hidden", false);
    });
  }

  // The sidebar's grey line icons become the same colourful icons, children too
  // (Payables, Receivables and Financial Reports under Accounting). Frappe redraws
  // the sidebar when it likes, so an observer re-applies; a done icon is marked.
  function paintSidebar() {
    $(".sidebar-item-container[item-name]").each(function () {
      var box = $(this).children(".desk-sidebar-item").find(".sidebar-item-icon").first();
      if (!box.length || box.attr("data-nz")) return;
      var url = iconUrl($(this).attr("item-name"));
      if (!url) return; // a workspace with no drawing keeps Frappe's own icon
      box.attr("data-nz", "1").empty().append($('<img class="nz-side-img" alt="" aria-hidden="true" draggable="false">').attr("src", url));
    });
  }
  var paintQueued = false;
  function queuePaint() {
    if (paintQueued) return;
    paintQueued = true;
    // A timer, not requestAnimationFrame: rAF never runs in a background tab
    // (measured on the live desk 2026-09-26), and the sidebar would stay grey.
    setTimeout(function () { paintQueued = false; paintSidebar(); }, 30);
  }
  function watchSidebar() {
    if (!window.MutationObserver || document.body.__nzSidebarWatched) return;
    document.body.__nzSidebarWatched = true;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes.length) { queuePaint(); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });
    queuePaint();
  }

  // A report sets its breadcrumb after the page-change re-reads have run (Stock
  // Balance: later than 600 ms on the live desk), so follow Frappe's own update.
  function hookBreadcrumbs() {
    var bc = frappe.breadcrumbs;
    if (!bc || typeof bc.update !== "function" || bc.__nzHooked) return;
    var original = bc.update;
    bc.update = function () {
      var result = original.apply(this, arguments);
      setTimeout(updateAppHead, 0);
      return result;
    };
    bc.__nzHooked = true;
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
    // The page sets its breadcrumb record while it draws, so read it a moment later.
    setTimeout(updateAppHead, 50);
    setTimeout(updateAppHead, 600);
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
    watchSidebar();
    hookBreadcrumbs();
    updateAppHead();
    setTimeout(function () { if (landing) land(); }, 1500);
  });
  $(function () { setTimeout(function () { addNavbarButton(); watchSidebar(); hookBreadcrumbs(); updateAppHead(); }, 800); });
})();
