(function () {
  var root = document.getElementById("fr");
  if (!root) return;
  var meta = document.getElementById("fr-meta");
  if (!meta) return;
  var checked = meta.getAttribute("data-checked") || "";
  var buttons = root.querySelectorAll("[data-filter]");
  var cards = root.querySelectorAll("[data-category]");

  function apply(key, label) {
    var count = 0;
    Array.prototype.forEach.call(cards, function (card) {
      var show = key === "all" || card.getAttribute("data-category") === key;
      if (show) {
        card.removeAttribute("hidden");
        count += 1;
      } else {
        card.setAttribute("hidden", "");
      }
    });
    Array.prototype.forEach.call(buttons, function (button) {
      var on = button.getAttribute("data-filter") === key;
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    meta.textContent = key === "all"
      ? count + " 条 · 最近核实 " + checked
      : count + " 条 · " + label + " · 最近核实 " + checked;
  }

  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener("click", function () {
      apply(button.getAttribute("data-filter"), button.getAttribute("data-label") || "");
    });
  });
})();
