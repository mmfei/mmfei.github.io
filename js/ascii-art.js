/* figlet.js 1.13.0 (MIT). Fonts are the official FIGlet 2.2.5 files on this site. */
import figlet from "./vendor/figlet-1.13.0/figlet.js";

var FONTS = [
  { name: "Standard", file: "standard.flf" },
  { name: "Big", file: "big.flf" },
  { name: "Slant", file: "slant.flf" },
  { name: "Shadow", file: "shadow.flf" }
];

var input = document.getElementById("aa-text");
var cjkTip = document.getElementById("aa-cjk");
var status = document.getElementById("aa-status");
var ready = false;

figlet.defaults({ fetchFontIfMissing: false });

function card(name) {
  return {
    name: name,
    button: document.querySelector('.aa-copy[data-font="' + name + '"]'),
    pre: document.getElementById("aa-out-" + name.toLowerCase())
  };
}

var cards = FONTS.map(function (font) {
  return card(font.name);
});

function setCopied(button, copied) {
  var label = button.querySelector(".aa-copy-label");
  if (button._timer) {
    clearTimeout(button._timer);
    button._timer = null;
  }
  label.textContent = copied ? "已复制" : "复制";
  button.setAttribute("aria-label", (copied ? "已复制 " : "复制 ") + button.getAttribute("data-font"));
  if (copied) {
    button._timer = setTimeout(function () {
      label.textContent = "复制";
      button.setAttribute("aria-label", "复制 " + button.getAttribute("data-font"));
      button._timer = null;
    }, 1600);
  }
}

function showOutput(entry, text) {
  var next = text || "";
  if (entry.button._text !== next) {
    setCopied(entry.button, false);
  }
  entry.button._text = next;
  entry.pre.textContent = next;
  entry.button.disabled = next.length === 0;
}

function render() {
  var prepared = window.AsciiArt.prepare(input.value);
  if (cjkTip) cjkTip.hidden = !prepared.cjk;
  input.setAttribute("aria-describedby", prepared.cjk ? "aa-local aa-cjk" : "aa-local");
  cards.forEach(function (entry) {
    if (!ready || prepared.empty) {
      showOutput(entry, "");
      return;
    }
    try {
      showOutput(entry, figlet.textSync(prepared.source, { font: entry.name }));
    } catch (err) {
      showOutput(entry, "");
    }
  });
}

function copyExact(button) {
  if (button.disabled || !button._text) return;
  var text = button._text;
  var done = function () {
    if (button._text !== text) return;
    setCopied(button, true);
  };
  var fail = function () { setCopied(button, false); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fail);
    return;
  }
  try {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    var ok = document.execCommand("copy");
    document.body.removeChild(area);
    if (ok) done();
    else fail();
  } catch (err) {
    fail();
  }
}

cards.forEach(function (entry) {
  entry.button.addEventListener("click", function () {
    copyExact(entry.button);
  });
});

input.addEventListener("input", render);

Promise.all(FONTS.map(function (font) {
  return fetch("/fonts/figlet/" + font.file).then(function (response) {
    if (!response.ok) throw new Error(font.file);
    return response.text();
  }).then(function (data) {
    figlet.parseFont(font.name, data);
  });
})).then(function () {
  ready = true;
  if (status) status.textContent = "";
  render();
}).catch(function () {
  ready = false;
  if (status) status.textContent = "字体文件没有载入，请刷新后再试。";
  render();
});

if (document.activeElement !== input) input.focus();
render();
