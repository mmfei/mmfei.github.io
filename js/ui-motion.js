(function () {
  var root = document.querySelector(".um");
  if (!root) return;

  function tabbables(scope) {
    return Array.prototype.filter.call(
      scope.querySelectorAll("button, [href], input, select, textarea"),
      function (el) {
        return !el.disabled && !el.closest("[hidden]");
      }
    );
  }

  var opener = document.getElementById("um-open");
  var dialog = document.getElementById("um-dialog");
  var closer = document.getElementById("um-close");
  var lastFocus = null;

  var blockedOutside = [];

  function blockOutsideDialog() {
    var node = dialog;
    while (node && node !== document.body && node.parentElement) {
      var parent = node.parentElement;
      Array.prototype.forEach.call(parent.children, function (sibling) {
        if (sibling === node) return;
        var record = { el: sibling, inert: false, hidden: false };
        if (!sibling.hasAttribute("inert")) {
          sibling.setAttribute("inert", "");
          record.inert = true;
        }
        if (!sibling.hasAttribute("aria-hidden")) {
          sibling.setAttribute("aria-hidden", "true");
          record.hidden = true;
        }
        if (record.inert || record.hidden) blockedOutside.push(record);
      });
      node = parent;
    }
  }

  function restoreOutsideDialog() {
    blockedOutside.forEach(function (record) {
      if (record.inert) record.el.removeAttribute("inert");
      if (record.hidden) record.el.removeAttribute("aria-hidden");
    });
    blockedOutside = [];
  }

  function openDialog() {
    var current = document.activeElement;
    lastFocus = current && current !== document.body && current !== document.documentElement ? current : opener;
    dialog.hidden = false;
    restoreOutsideDialog();
    blockOutsideDialog();
    var items = tabbables(dialog);
    (items[0] || closer).focus();
  }

  function closeDialog() {
    dialog.hidden = true;
    restoreOutsideDialog();
    var back = lastFocus && lastFocus.focus ? lastFocus : opener;
    back.focus();
  }

  opener.addEventListener("click", openDialog);
  closer.addEventListener("click", closeDialog);
  document.getElementById("um-ack").addEventListener("click", closeDialog);
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    var items = tabbables(dialog);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  var form = document.getElementById("um-form");
  var note = document.getElementById("um-note");
  var error = document.getElementById("um-error");
  var ok = document.getElementById("um-ok");
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = note.value.trim();
    if (!value) {
      note.setAttribute("aria-invalid", "true");
      error.hidden = false;
      ok.hidden = true;
      note.focus();
      return;
    }
    note.setAttribute("aria-invalid", "false");
    error.hidden = true;
    ok.hidden = false;
    ok.textContent = "已在本页记下：" + value;
  });
  document.getElementById("um-reset").addEventListener("click", function () {
    note.value = "";
    note.setAttribute("aria-invalid", "false");
    error.hidden = true;
    ok.hidden = true;
    note.focus();
  });

  var panels = {
    empty: document.getElementById("um-empty"),
    loading: document.getElementById("um-loading"),
    error: document.getElementById("um-failed"),
    ready: document.getElementById("um-ready")
  };
  function showState(name) {
    Object.keys(panels).forEach(function (key) {
      var on = key === name;
      panels[key].hidden = !on;
      if (key === "loading") panels[key].setAttribute("aria-busy", on ? "true" : "false");
    });
  }
  root.querySelectorAll("[data-um-state]").forEach(function (button) {
    button.addEventListener("click", function () {
      showState(button.getAttribute("data-um-state"));
      root.querySelectorAll("[data-um-state]").forEach(function (peer) {
        peer.setAttribute("aria-pressed", peer === button ? "true" : "false");
      });
    });
  });
  document.getElementById("um-retry").addEventListener("click", function () {
    showState("ready");
  });

  var stage = document.getElementById("um-stage");
  var play = document.getElementById("um-play");
  var pause = document.getElementById("um-pause");
  var duration = document.getElementById("um-duration");
  var easing = document.getElementById("um-easing");
  var code = document.getElementById("um-code");
  var copyStatus = document.getElementById("um-copy-status");
  var reduceBox = document.getElementById("um-reduce");
  var media = window.matchMedia("(prefers-reduced-motion: reduce)");

  function motionCss(ms, easeName) {
    return [
      "<div class=\"dot\"></div>",
      "<style>",
      ".dot {",
      "  width: 40px;",
      "  height: 40px;",
      "  background: #3d3a9a;",
      "  animation: slide " + ms + "ms " + easeName + " infinite alternate;",
      "}",
      "@keyframes slide {",
      "  from { transform: translateX(0); }",
      "  to { transform: translateX(96px); }",
      "}",
      "@media (prefers-reduced-motion: reduce) {",
      "  .dot { animation: none; transform: none; }",
      "}",
      "</style>"
    ].join("\n");
  }

  function syncMotion() {
    var ms = String(duration.value);
    var easeName = easing.value;
    stage.style.setProperty("--um-dur", ms + "ms");
    stage.style.setProperty("--um-ease", easeName);
    duration.setAttribute("aria-valuenow", ms);
    duration.setAttribute("aria-valuetext", ms + " 毫秒");
    code.textContent = motionCss(ms, easeName);
    var reduce = reduceBox.checked || media.matches;
    stage.classList.toggle("is-reduced", reduce);
  }

  function setPlaying(on) {
    var reduce = reduceBox.checked || media.matches;
    stage.classList.toggle("is-playing", on && !reduce);
    play.setAttribute("aria-pressed", on && !reduce ? "true" : "false");
    if (on && reduce) {
      copyStatus.textContent = "已按减少动态跳过位移，示例停在原位。";
    }
  }

  play.addEventListener("click", function () { setPlaying(true); });
  pause.addEventListener("click", function () { setPlaying(false); });
  duration.addEventListener("input", syncMotion);
  easing.addEventListener("change", syncMotion);
  reduceBox.addEventListener("change", function () {
    syncMotion();
    if (reduceBox.checked) setPlaying(false);
  });
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", function () {
      reduceBox.checked = media.matches;
      syncMotion();
      if (media.matches) setPlaying(false);
    });
  }
  reduceBox.checked = media.matches;
  syncMotion();

  function copyText(text) {
    function legacy() {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      document.body.removeChild(area);
      if (!ok) throw new Error("copy failed");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    legacy();
    return Promise.resolve();
  }

  var tablist = document.getElementById("um-tablist");
  var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[role='tab']"));

  function panelOf(tab) {
    return document.getElementById(tab.getAttribute("aria-controls"));
  }

  function selectedTab() {
    return tabs.filter(function (tab) { return tab.getAttribute("aria-selected") === "true"; })[0] || tabs[0];
  }

  function moveTabFocus(tab) {
    tabs.forEach(function (item) { item.tabIndex = item === tab ? 0 : -1; });
    tab.focus();
  }

  function activateTab(tab) {
    tabs.forEach(function (item) {
      var on = item === tab;
      item.setAttribute("aria-selected", on ? "true" : "false");
      item.tabIndex = on ? 0 : -1;
      panelOf(item).hidden = !on;
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      activateTab(tab);
    });
    tab.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Enter" && event.key !== " ") return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        var next = event.key === "ArrowRight" ? index + 1 : index - 1;
        if (next < 0) next = tabs.length - 1;
        if (next >= tabs.length) next = 0;
        moveTabFocus(tabs[next]);
        return;
      }
      event.preventDefault();
      activateTab(tab);
    });
  });
  tablist.addEventListener("focusout", function (event) {
    if (tablist.contains(event.relatedTarget)) return;
    tabs.forEach(function (tab) {
      tab.tabIndex = tab === selectedTab() ? 0 : -1;
    });
  });

  document.getElementById("um-copy").addEventListener("click", function () {
    copyText(code.textContent).then(function () {
      copyStatus.textContent = "已复制";
    }).catch(function () {
      copyStatus.textContent = "未能写入剪贴板，代码仍在上方。";
    });
  });
})();
