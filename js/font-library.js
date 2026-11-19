(function () {
  var MAX_ACTIVE = 2;
  var fonts = [];
  var filter = "全部";
  var query = "";
  var lastSize = 22;
  var lastLead = 1.6;
  var queue = [];
  var active = 0;
  var list = document.getElementById("fl-list");
  var status = document.getElementById("fl-status");
  var countEl = document.getElementById("fl-count");
  var filtersEl = document.getElementById("fl-filters");
  var custom = document.getElementById("fl-custom");
  var sizeInput = document.getElementById("fl-size");
  var leadInput = document.getElementById("fl-leading");
  var weightInput = document.getElementById("fl-weight");
  var searchInput = document.getElementById("fl-search");
  var emptyEl = document.getElementById("fl-empty");
  var defaultText = custom.value;

  function setStatus(text) {
    status.textContent = text;
  }

  function userText() {
    return custom.value;
  }

  function readBounded(input, min, max, last, decimals) {
    var raw = String(input.value).trim();
    var n = Number(raw);
    if (raw === "" || !isFinite(n) || n < min || n > max) return last;
    var stepped = decimals ? Math.round(n * 10) / 10 : Math.round(n);
    if (stepped < min || stepped > max) return last;
    return stepped;
  }

  function currentSize() {
    var n = readBounded(sizeInput, 16, 40, lastSize, false);
    if (n !== lastSize || String(sizeInput.value).trim() !== "") lastSize = n;
    return lastSize;
  }

  function currentLead() {
    var n = readBounded(leadInput, 1.2, 2.2, lastLead, true);
    lastLead = n;
    return lastLead;
  }

  function commitInputs() {
    var sizeOk = readBounded(sizeInput, 16, 40, null, false);
    lastSize = sizeOk == null ? lastSize : sizeOk;
    sizeInput.value = String(lastSize);
    var leadOk = readBounded(leadInput, 1.2, 2.2, null, true);
    lastLead = leadOk == null ? lastLead : leadOk;
    leadInput.value = lastLead.toFixed(1);
  }
  function licenseLine(font) {
    var line = font.sizeLabel + " · ";
    if (font.variable) line += "可变 " + font.axisMin + "–" + font.axisMax;
    else line += "静态 " + font.staticWeight;
    line += " · OFL 1.1，可按条款商用，不可单独售卖字体";
    if (font.rfn) line += "。保留名称：" + font.rfn;
    return line;
  }

  function firstLine(text) {
    var index = text.indexOf("\n");
    return index === -1 ? text : text.slice(0, index);
  }

  function encodePath(url) {
    return url.split("/").map(function (part) {
      return encodeURIComponent(part);
    }).join("/");
  }

  function charsOf(text) {
    var out = [];
    for (var i = 0; i < text.length;) {
      var cp = text.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      out.push(ch);
      i += ch.length;
    }
    return out;
  }

  function isMissing(font, ch) {
    if (ch === " " || ch === "\n" || ch === "\t") return false;
    var cp = ch.codePointAt(0);
    if (!font.coverageSet) return false;
    if (cp > 0xFFFF) return true;
    return !font.coverageSet.has(cp);
  }

  function paint(el, text, font) {
    el.replaceChildren();
    el.style.fontFamily = "inherit";
    var chars = charsOf(text);
    var buf = "";
    var missing = false;
    function flush() {
      if (!buf) return;
      var span = document.createElement("span");
      span.textContent = buf;
      if (missing) {
        span.className = "fl-unsupported";
        span.title = "这个字不在「" + font.family + "」文件里。若还能看见，是系统字体补的，不是这款字体。";
        span.style.fontFamily = "inherit";
      } else {
        span.style.fontFamily = '"' + font.face + '"';
      }
      el.appendChild(span);
      buf = "";
    }
    chars.forEach(function (ch) {
      var miss = isMissing(font, ch);
      if (buf && miss !== missing) flush();
      missing = miss;
      buf += ch;
    });
    flush();
  }

  function setPlain(el, text) {
    el.replaceChildren();
    el.style.fontFamily = "inherit";
    el.textContent = text;
  }

  function clampWeight(font, want) {
    if (!font.variable) return Number(font.staticWeight || 400);
    var min = Number(font.axisMin);
    var max = Number(font.axisMax);
    var value = Number(want);
    if (!isFinite(value)) value = 400;
    value = Math.round(value / 100) * 100;
    if (value < min) value = Math.ceil(min / 100) * 100;
    if (value > max) value = Math.floor(max / 100) * 100;
    if (value < min) value = min;
    if (value > max) value = max;
    return value;
  }

  function weights(font) {
    if (!font.variable) {
      var w = String(font.staticWeight || 400);
      return { title: w, body: w, titleLabel: "静态字重 " + w, bodyLabel: "静态字重 " + w };
    }
    var body = clampWeight(font, weightInput.value);
    var title = clampWeight(font, 700);
    return { title: String(title), body: String(body), titleLabel: "标题 " + title, bodyLabel: "正文 " + body };
  }

  function applyMetrics(font) {
    var size = currentSize();
    var lead = currentLead();
    var w = weights(font);
    font.els.title.style.fontWeight = w.title;
    font.els.title.style.fontSize = Math.round(size * 1.35) + "px";
    font.els.title.style.lineHeight = String(lead);
    font.els.title.style.fontSynthesis = "none";
    font.els.body.style.fontWeight = w.body;
    font.els.body.style.fontSize = size + "px";
    font.els.body.style.lineHeight = String(lead);
    font.els.body.style.fontSynthesis = "none";
    font.els.titleKicker.textContent = w.titleLabel;
    font.els.bodyKicker.textContent = w.bodyLabel;
  }

  function renderFont(font) {
    applyMetrics(font);
    if (font.state !== "ready") {
      var text = font.state === "failed"
        ? "加载失败。不用系统字体代替 " + font.family + "。"
        : (font.state === "loading"
          ? "正在加载 " + font.sizeLabel + "。完成前不显示比较文字。"
          : "滚到这里后加载字体文件。当前还不是 " + font.family + "。");
      setPlain(font.els.title, text);
      setPlain(font.els.body, text);
      return;
    }
    if (font.variable) paint(font.els.title, firstLine(userText()), font);
    paint(font.els.body, userText(), font);
  }

  function renderAll() {
    fonts.forEach(function (font) {
      if (!font.els.card.hidden) renderFont(font);
    });
    var shown = fonts.filter(function (font) { return !font.els.card.hidden; });
    var ready = shown.filter(function (font) { return font.state === "ready"; }).length;
    var loading = shown.filter(function (font) { return font.state === "loading"; }).length;
    var failed = shown.filter(function (font) { return font.state === "failed"; }).length;
    setStatus("命中 " + shown.length + " 款。已加载 " + ready + "，正在加载 " + loading + "，失败 " + failed + "，未滚到 " + (shown.length - ready - loading - failed) + "。");
    if (emptyEl) emptyEl.hidden = shown.length !== 0;
  }

  function drawFilters() {
    var cats = ["全部"];
    fonts.forEach(function (font) {
      if (cats.indexOf(font.category) === -1) cats.push(font.category);
    });
    filtersEl.replaceChildren();
    cats.forEach(function (cat) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = cat === "全部" ? "全部" : cat;
      button.setAttribute("aria-pressed", cat === filter ? "true" : "false");
      button.addEventListener("click", function () {
        filter = cat;
        Array.prototype.forEach.call(filtersEl.children, function (el) {
          el.setAttribute("aria-pressed", el === button ? "true" : "false");
        });
        applyFilter();
      });
      filtersEl.appendChild(button);
    });
  }

  function fontMatches(font) {
    if (filter !== "全部" && font.category !== filter) return false;
    if (!query) return true;
    var hay = ((font.family || "") + " " + (font.nameZh || "") + " " + (font.id || "")).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function applyFilter() {
    fonts.forEach(function (font) {
      font.els.card.hidden = !fontMatches(font);
    });
    renderAll();
    kickVisible();
  }

  function drawCards() {
    list.replaceChildren();
    fonts.forEach(function (font) {
      var card = document.createElement("article");
      card.className = "fl-card";
      card.setAttribute("data-id", font.id);
      var heading = document.createElement("h2");
      heading.textContent = font.nameZh || font.family;
      var english = document.createElement("p");
      english.className = "fl-name-en";
      if (font.nameZh) english.textContent = font.family + (font.version ? " · " + font.version : "");
      else english.textContent = font.version || "";
      if (!english.textContent) english.hidden = true;
      var cardStatus = document.createElement("p");
      cardStatus.className = "fl-card-status";
      cardStatus.textContent = "尚未加载";
      var titleKicker = document.createElement("p");
      titleKicker.className = "fl-kicker";
      var title = document.createElement("div");
      title.className = "fl-sample fl-title";
      var bodyKicker = document.createElement("p");
      bodyKicker.className = "fl-kicker";
      var body = document.createElement("div");
      body.className = "fl-sample fl-body";
      var meta = document.createElement("p");
      meta.className = "fl-meta";
      meta.textContent = licenseLine(font);
      var links = document.createElement("p");
      links.className = "fl-links";
      var license = document.createElement("a");
      license.href = encodePath(font.licenseFile);
      license.textContent = "OFL 原文";
      var source = document.createElement("a");
      source.href = font.source;
      source.textContent = "官方目录";
      links.appendChild(license);
      links.appendChild(source);
      var dlStatus = document.createElement("p");
      dlStatus.className = "fl-dl";
      card.appendChild(heading);
      card.appendChild(english);
      card.appendChild(cardStatus);
      card.appendChild(titleKicker);
      card.appendChild(title);
      card.appendChild(bodyKicker);
      card.appendChild(body);
      card.appendChild(meta);
      if (font.zip) {
        var download = document.createElement("button");
        download.type = "button";
        download.textContent = "下载完整安装包";
        download.addEventListener("click", function () { downloadZip(font, download, dlStatus); });
        card.appendChild(download);
      } else {
        dlStatus.textContent = "仅网页预览。本站没有这款安装包，原文件见官方目录。";
      }
      card.appendChild(dlStatus);
      card.appendChild(links);
      var details = document.createElement("details");
      var summary = document.createElement("summary");
      summary.textContent = "来源与覆盖";
      var detail = document.createElement("p");
      detail.textContent = (font.commercial ? font.commercial + " " : "") + (font.note || "");
      details.appendChild(summary);
      details.appendChild(detail);
      card.appendChild(details);
      list.appendChild(card);
      font.els = { card: card, status: cardStatus, title: title, body: body, titleKicker: titleKicker, bodyKicker: bodyKicker, dl: dlStatus };
      font.state = "idle";
      font.requested = false;
      if (!font.variable) {
        titleKicker.hidden = true;
        title.hidden = true;
      }
    });
  }

  function enqueue(font) {
    if (!font || font.requested || font.els.card.hidden) return;
    font.requested = true;
    font.state = "loading";
    font.els.status.textContent = "正在加载 " + font.sizeLabel;
    renderFont(font);
    queue.push(font);
    pump();
  }

  function pump() {
    while (active < MAX_ACTIVE && queue.length) {
      active += 1;
      loadFont(queue.shift());
    }
  }

  function loadFont(font) {
    var face = new FontFace(font.face, 'url("' + encodePath(font.file) + '")', font.variable ? {
      weight: String(font.axisMin) + " " + String(font.axisMax),
      style: "normal",
      display: "swap"
    } : {
      weight: String(font.staticWeight || 400),
      style: "normal",
      display: "block"
    });
    var coverageTask = fetch(encodePath(font.coverage)).then(function (response) {
      if (!response.ok) throw new Error("coverage");
      return response.arrayBuffer();
    }).then(function (buffer) {
      var view = new Uint16Array(buffer);
      var set = new Set();
      for (var i = 0; i < view.length; i++) set.add(view[i]);
      font.coverageSet = set;
    });
    var faceTask = face.load().then(function (loaded) {
      if (!loaded || loaded.status !== "loaded") throw new Error("status");
      document.fonts.add(loaded);
      return document.fonts.ready.then(function () {
        var spec = font.variable ? "400 32px" : (String(font.staticWeight || 400) + " 32px");
        if (!document.fonts.check(spec + ' "' + font.face + '"')) {
          document.fonts.delete(loaded);
          throw new Error("check");
        }
      });
    });
    Promise.all([coverageTask, faceTask]).then(function () {
      font.state = "ready";
      font.els.card.classList.add("is-ready");
      font.els.status.textContent = "已用这份字体文件。";
      renderAll();
    }).catch(function () {
      font.state = "failed";
      font.els.card.classList.add("is-failed");
      font.els.status.textContent = "加载失败";
      renderAll();
    }).then(function () {
      active -= 1;
      pump();
    });
  }

  function kickVisible() {
    fonts.forEach(function (font) {
      if (font.requested || font.els.card.hidden) return;
      var rect = font.els.card.getBoundingClientRect();
      if (rect.bottom > -80 && rect.top < window.innerHeight + 80) enqueue(font);
    });
  }

  function downloadZip(font, button, output) {
    button.disabled = true;
    output.textContent = "正在核对 " + font.zipName + "。";
    fetch(font.zip).then(function (response) {
      if (!response.ok) throw new Error("http");
      return response.arrayBuffer();
    }).then(function (buffer) {
      return crypto.subtle.digest("SHA-256", buffer).then(function (digest) {
        var hex = Array.from(new Uint8Array(digest)).map(function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
        if (hex !== font.zipSha256) throw new Error("hash");
        var blob = new Blob([buffer], { type: "application/zip" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = font.zipName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        output.textContent = font.zipName + " 的 SHA-256 与页面记录一致。";
      });
    }).catch(function () {
      output.textContent = "下载失败或校验不一致，没有把文件标成成功。";
    }).then(function () {
      button.disabled = false;
    });
  }

  var samples = {
    title: "把句子写清楚",
    body: "字体是否适合长时间阅读，要看一整段中文的灰度和换行，而不是只看几个大字。",
    mix: "2026-11-19  13:20\nHello, 字体 100%。\n标点：，。！？"
  };

  custom.addEventListener("input", renderAll);
  sizeInput.addEventListener("input", renderAll);
  leadInput.addEventListener("input", renderAll);
  weightInput.addEventListener("change", renderAll);
  sizeInput.addEventListener("blur", function () { commitInputs(); renderAll(); });
  leadInput.addEventListener("blur", function () { commitInputs(); renderAll(); });
  searchInput.addEventListener("input", function () {
    query = searchInput.value.trim().toLowerCase();
    applyFilter();
  });
  document.getElementById("fl-search-clear").addEventListener("click", function () {
    searchInput.value = "";
    query = "";
    filter = "全部";
    Array.prototype.forEach.call(filtersEl.children, function (el) {
      el.setAttribute("aria-pressed", el.textContent === "全部" ? "true" : "false");
    });
    applyFilter();
    searchInput.focus();
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-sample]"), function (button) {
    button.addEventListener("click", function () {
      var key = button.getAttribute("data-sample");
      custom.value = key === "default" ? defaultText : samples[key];
      renderAll();
    });
  });
  window.addEventListener("scroll", kickVisible, { passive: true });
  window.addEventListener("resize", kickVisible);

  fetch("/fonts/library/catalog.json").then(function (response) {
    if (!response.ok) throw new Error("catalog");
    return response.json();
  }).then(function (data) {
    fonts = data.fonts || [];
    var hand = fonts.filter(function (font) { return font.category === "中文手写"; }).length;
    countEl.textContent = "已核实并放进目录的字体家族 " + fonts.length + " 个，其中中文手写 " + hand + " 个。同一家族的字重或斜体没有另算。";
    drawCards();
    drawFilters();
    renderAll();
    kickVisible();
  }).catch(function () {
    setStatus("字体目录没有读到。字体文件没有加载。");
  });
})();
