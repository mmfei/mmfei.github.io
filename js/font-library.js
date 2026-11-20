(function () {
  var MAX_ACTIVE = 2;
  var MAX_PICK = 3;
  var SIZE_MIN = 16;
  var SIZE_MAX = 40;
  var LEAD_MIN = 1.2;
  var LEAD_MAX = 2.2;
  var SHORT = "马上开球 Kickoff";
  var LONG = "挑选适合的字体\nHello, 2026.\n中文与 English，标点：，。！？";
  var CAT_ORDER = ["中文手写", "中文无衬线", "西文无衬线", "西文衬线", "西文等宽", "西文手写"];
  var WEIGHT_NAME = {
    100: "Thin",
    200: "ExtraLight",
    300: "Light",
    400: "Regular",
    500: "Medium",
    600: "SemiBold",
    700: "Bold",
    800: "ExtraBold",
    900: "Black"
  };

  var fonts = [];
  var filter = "全部";
  var query = "";
  var picked = [];
  var view = "browse";
  var detailId = null;
  var detailFrom = "browse";
  var savedScroll = 0;
  var returnFocus = null;
  var sizeLocked = false;
  var leadLocked = false;
  var sizePx = 32;
  var lead = 1.4;
  var composing = false;
  var queue = [];
  var active = 0;
  var weightsOpen = false;

  var custom = document.getElementById("fl-custom");
  var browseEl = document.getElementById("fl-browse");
  var list = document.getElementById("fl-list");
  var status = document.getElementById("fl-status");
  var catsEl = document.getElementById("fl-cats");
  var searchRow = document.getElementById("fl-search-row");
  var searchInput = document.getElementById("fl-search");
  var emptyEl = document.getElementById("fl-empty");
  var emptyDetail = document.getElementById("fl-empty-detail");
  var limitEl = document.getElementById("fl-limit");
  var typeEl = document.getElementById("fl-type");
  var detailEl = document.getElementById("fl-detail");
  var compareEl = document.getElementById("fl-compare");

  function setStatus(text) {
    status.textContent = text;
  }

  function autoSize() {
    return window.matchMedia("(max-width: 720px)").matches ? 28 : 32;
  }

  function currentSize() {
    return sizeLocked ? sizePx : autoSize();
  }

  function currentLead() {
    return leadLocked ? lead : 1.4;
  }

  function previewText() {
    if (!custom.value.trim()) return LONG;
    return custom.value;
  }

  function fitInput() {
    custom.style.height = "48px";
    custom.style.height = Math.max(48, custom.scrollHeight) + "px";
  }

  function encodePath(url) {
    return String(url).split("/").map(function (part) {
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

  function foldMissing(buf) {
    var fold = false;
    charsOf(buf).forEach(function (ch) {
      if (ch.codePointAt(0) > 0x7F) fold = true;
    });
    return fold;
  }

  function paint(el, text, font) {
    el.replaceChildren();
    var chars = charsOf(text);
    var buf = "";
    var missing = false;
    function flush() {
      if (!buf) return;
      var span = document.createElement("span");
      if (missing) {
        span.className = "fl-miss";
        span.textContent = foldMissing(buf) ? "中文缺字" : buf;
        span.title = "这些字符不在「" + font.family + "」文件里，显示的不是这款字体。";
      } else {
        span.textContent = buf;
        span.style.fontFamily = '"' + font.face + '"';
        span.style.fontWeight = String(activeWeight(font));
        span.style.fontSynthesis = "none";
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

  function applyMetrics(el) {
    if (sizeLocked) el.style.fontSize = sizePx + "px";
    else el.style.fontSize = "";
    if (leadLocked) el.style.lineHeight = String(lead);
    else el.style.lineHeight = "";
  }

  function clampWeight(font, want) {
    if (!font.variable) return Number(font.staticWeight || 400);
    var min = Number(font.axisMin);
    var max = Number(font.axisMax);
    var value = Number(want);
    if (!isFinite(value)) value = Number(font.axisDefault || 400);
    value = Math.round(value / 100) * 100;
    if (value < min) value = Math.ceil(min / 100) * 100;
    if (value > max) value = Math.floor(max / 100) * 100;
    if (value < min) value = min;
    if (value > max) value = max;
    return value;
  }

  function activeWeight(font) {
    var base = font.previewWeight != null ? font.previewWeight : (font.variable ? (font.axisDefault || 400) : (font.staticWeight || 400));
    return clampWeight(font, base);
  }

  function weightSteps(font) {
    if (!font.variable) return [Number(font.staticWeight || 400)];
    var min = Number(font.axisMin);
    var max = Number(font.axisMax);
    var start = Math.ceil(min / 100) * 100;
    var out = [];
    for (var w = start; w <= max; w += 100) out.push(w);
    if (!out.length) out.push(Math.round(min));
    return out;
  }

  function weightLabel(font) {
    var w = activeWeight(font);
    var name = WEIGHT_NAME[w] || "";
    if (!font.variable) return "固定 " + w + (name ? " · " + name : "");
    return w + (name ? " · " + name : "");
  }

  function shortVersion(font) {
    var v = String(font.version || "").replace(/^Version\s+/i, "");
    var cut = v.search(/[;；（(]/);
    if (cut > 0) v = v.slice(0, cut);
    return v.trim();
  }

  function groupBytes(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function findFont(id) {
    for (var i = 0; i < fonts.length; i++) if (fonts[i].id === id) return fonts[i];
    return null;
  }

  function isPicked(font) {
    return picked.indexOf(font.id) !== -1;
  }

  function fontMatches(font) {
    if (filter !== "全部" && font.category !== filter) return false;
    if (!query) return true;
    var hay = ((font.family || "") + " " + (font.nameZh || "") + " " + (font.id || "")).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function countCategory(cat) {
    var n = 0;
    fonts.forEach(function (font) {
      if (cat === "全部" || font.category === cat) n += 1;
    });
    return n;
  }

  function renderSample(font, el) {
    if (font.state !== "ready") return;
    paint(el, previewText(), font);
    applyMetrics(el);
  }

  function renderCard(font) {
    var ready = font.state === "ready";
    font.els.sample.hidden = !ready;
    font.els.msg.hidden = ready;
    font.els.retry.hidden = font.state !== "failed";
    font.els.source.hidden = font.state !== "failed";
    if (!ready) {
      font.els.msg.textContent = font.state === "failed"
        ? "字体加载失败"
        : (font.state === "loading" ? "正在加载该字体…" : "尚未加载");
    } else {
      renderSample(font, font.els.sample);
    }
    font.els.picked.hidden = !isPicked(font);
  }

  function shownFonts() {
    return fonts.filter(function (font) { return !font.els.card.hidden; });
  }

  function renderAll() {
    fonts.forEach(function (font) {
      if (font.els.card.hidden && view === "browse") return;
      renderCard(font);
    });
    if (view === "detail") renderDetail();
    if (view === "compare") renderCompare();
    updateChrome();
  }

  function updateChrome() {
    var button = document.getElementById("fl-candidates");
    button.textContent = "候选 " + picked.length;
    var current = document.getElementById("fl-filter-current");
    current.textContent = (filter === "全部" ? "全部" : filter) + " " + countCategory(filter);
    current.setAttribute("aria-pressed", filter === "全部" ? "true" : "false");
    var shown = fonts.length ? shownFonts() : [];
    emptyEl.hidden = shown.length !== 0 || !fonts.length;
    list.hidden = shown.length === 0;
    if (!shown.length && fonts.length) {
      var cat = filter === "全部" ? "全部 " + fonts.length : filter + " " + countCategory(filter);
      var typed = searchInput.value.trim();
      emptyDetail.textContent = (typed ? "搜索：" + typed + " · " : "搜索：空 · ") + "分类：" + cat;
    }
    var ready = shown.filter(function (font) { return font.state === "ready"; }).length;
    var loading = shown.filter(function (font) { return font.state === "loading"; }).length;
    var failed = shown.filter(function (font) { return font.state === "failed"; }).length;
    if (!fonts.length) return;
    var waiting = shown.length - ready - loading - failed;
    if (!shown.length) setStatus("没有同时符合名称和分类的字体。");
    else if (failed) setStatus("有 " + failed + " 款没有加载成功，可以在卡片里重试。");
    else if (loading || waiting) setStatus("已就绪 " + ready + " 款。往下滚，继续加载其余字体。");
    else setStatus("这 " + shown.length + " 款都已用各自的字体文件显示。");
    renderType();
  }

  function categoryNames() {
    var names = CAT_ORDER.filter(function (name) {
      return fonts.some(function (font) { return font.category === name; });
    });
    fonts.forEach(function (font) {
      if (names.indexOf(font.category) === -1) names.push(font.category);
    });
    return names;
  }

  function drawFilters() {
    catsEl.replaceChildren();
    ["全部"].concat(categoryNames()).forEach(function (cat) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "fl-quiet";
      button.textContent = (cat === "全部" ? "全部" : cat) + " " + countCategory(cat);
      button.setAttribute("aria-pressed", cat === filter ? "true" : "false");
      button.addEventListener("click", function () {
        filter = cat;
        Array.prototype.forEach.call(catsEl.children, function (el) {
          el.setAttribute("aria-pressed", el === button ? "true" : "false");
        });
        applyFilter();
      });
      catsEl.appendChild(button);
    });
  }

  function applyFilter() {
    fonts.forEach(function (font) {
      font.els.card.hidden = !fontMatches(font);
    });
    renderAll();
    kickVisible();
  }

  function clearSearchOnly() {
    searchInput.value = "";
    query = "";
    searchRow.hidden = false;
    document.getElementById("fl-search-toggle").setAttribute("aria-expanded", "true");
    applyFilter();
    searchInput.focus();
  }

  function resetFilters() {
    searchInput.value = "";
    query = "";
    filter = "全部";
    drawFilters();
    applyFilter();
  }

  function drawCards() {
    list.replaceChildren();
    fonts.forEach(function (font, index) {
      var card = document.createElement("article");
      card.className = "fl-card";
      card.setAttribute("data-testid", "font-card");
      card.setAttribute("data-id", font.id);
      card.style.animationDelay = (Math.min(index, 8) * 40) + "ms";
      var sample = document.createElement("div");
      sample.className = "fl-sample";
      sample.setAttribute("data-testid", "font-sample");
      var msg = document.createElement("p");
      msg.className = "fl-card-msg";
      msg.textContent = "尚未加载";
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "fl-quiet";
      retry.textContent = "重试加载";
      retry.hidden = true;
      retry.addEventListener("click", function () { retryFont(font); });
      var source = document.createElement("a");
      source.className = "fl-quiet";
      source.href = font.source;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "官方来源";
      source.hidden = true;
      var idRow = document.createElement("div");
      idRow.className = "fl-id";
      var family = document.createElement("p");
      family.className = "fl-family";
      family.textContent = font.family;
      var pickedMark = document.createElement("span");
      pickedMark.className = "fl-picked";
      pickedMark.textContent = "已加入";
      pickedMark.hidden = true;
      var more = document.createElement("button");
      more.type = "button";
      more.className = "fl-more";
      more.setAttribute("aria-label", "查看 " + font.family);
      more.setAttribute("data-testid", "font-more");
      var icon = document.createElement("img");
      icon.src = "/img/font-more.svg";
      icon.width = 20;
      icon.height = 20;
      icon.alt = "";
      more.appendChild(icon);
      more.addEventListener("click", function () { openDetail(font, more); });
      idRow.appendChild(family);
      idRow.appendChild(pickedMark);
      idRow.appendChild(more);
      card.appendChild(sample);
      card.appendChild(msg);
      card.appendChild(retry);
      card.appendChild(source);
      card.appendChild(idRow);
      list.appendChild(card);
      font.els = {
        card: card,
        sample: sample,
        msg: msg,
        retry: retry,
        source: source,
        picked: pickedMark
      };
      font.state = "idle";
      font.requested = false;
    });
  }

  function enqueue(font) {
    if (!font || font.requested || (view === "browse" && font.els.card.hidden)) return;
    font.requested = true;
    font.state = "loading";
    renderCard(font);
    queue.push(font);
    pump();
  }

  function retryFont(font) {
    font.requested = false;
    font.state = "idle";
    font.coverageSet = null;
    font.els.card.classList.remove("is-failed", "is-ready");
    enqueue(font);
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
        var spec = String(activeWeight(font)) + " 32px";
        if (!document.fonts.check(spec + ' "' + font.face + '"')) {
          document.fonts.delete(loaded);
          throw new Error("check");
        }
      });
    });
    Promise.all([coverageTask, faceTask]).then(function () {
      font.state = "ready";
      font.els.card.classList.add("is-ready");
      renderAll();
    }).catch(function () {
      font.state = "failed";
      font.els.card.classList.add("is-failed");
      renderAll();
    }).then(function () {
      active -= 1;
      pump();
    });
  }

  function kickVisible() {
    if (view !== "browse") return;
    fonts.forEach(function (font) {
      if (font.requested || font.els.card.hidden) return;
      var rect = font.els.card.getBoundingClientRect();
      if (rect.bottom > -80 && rect.top < window.innerHeight + 80) enqueue(font);
    });
  }

  function downloadZip(font) {
    var button = document.getElementById("fl-download");
    var output = document.getElementById("fl-dl-status");
    var requested = font.id;
    button.disabled = true;
    output.textContent = "正在核对安装包…";
    fetch(font.zip).then(function (response) {
      if (!response.ok) throw new Error("http");
      return response.arrayBuffer();
    }).then(function (buffer) {
      return crypto.subtle.digest("SHA-256", buffer).then(function (digest) {
        var hex = Array.prototype.map.call(new Uint8Array(digest), function (b) {
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
        if (detailId === requested) output.textContent = "已核对，已发起保存。";
      });
    }).catch(function () {
      if (detailId === requested) output.textContent = "校验失败，未保存安装包。";
    }).then(function () {
      if (detailId === requested) button.disabled = false;
    });
  }

  function showLimit() {
    limitEl.hidden = false;
  }

  function togglePick(font) {
    var index = picked.indexOf(font.id);
    if (index !== -1) {
      picked.splice(index, 1);
      limitEl.hidden = true;
    } else if (picked.length >= MAX_PICK) {
      showLimit();
      return false;
    } else {
      picked.push(font.id);
      limitEl.hidden = true;
    }
    renderAll();
    return true;
  }

  function paintViews() {
    browseEl.hidden = view !== "browse";
    typeEl.hidden = view !== "type";
    detailEl.hidden = view !== "detail";
    compareEl.hidden = view !== "compare";
    if (view === "browse") kickVisible();
  }

  function enter(next, focusEl) {
    if (view === "browse" && next !== "browse") {
      savedScroll = window.scrollY;
      returnFocus = focusEl || document.activeElement;
    }
    view = next;
    paintViews();
    if (next === "browse") {
      window.scrollTo(0, savedScroll);
      if (returnFocus && returnFocus.focus) returnFocus.focus();
    } else {
      window.scrollTo(0, 0);
    }
  }

  function backToBrowse() {
    view = "browse";
    paintViews();
    window.scrollTo(0, savedScroll);
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  function renderType() {
    var sizeNow = currentSize();
    var leadNow = currentLead();
    document.getElementById("fl-size-value").textContent = sizeNow + " px";
    document.getElementById("fl-lead-value").textContent = leadNow.toFixed(1);
    document.getElementById("fl-size-dec").disabled = sizeNow <= SIZE_MIN;
    document.getElementById("fl-size-inc").disabled = sizeNow >= SIZE_MAX;
    document.getElementById("fl-lead-dec").disabled = leadNow <= LEAD_MIN + 0.001;
    document.getElementById("fl-lead-inc").disabled = leadNow >= LEAD_MAX - 0.001;
  }

  function stepSize(dir) {
    var next = currentSize() + dir;
    if (next < SIZE_MIN || next > SIZE_MAX) return;
    sizeLocked = true;
    sizePx = next;
    renderAll();
  }

  function stepLead(dir) {
    var next = Math.round((currentLead() + dir) * 10) / 10;
    if (next < LEAD_MIN || next > LEAD_MAX) return;
    leadLocked = true;
    lead = next;
    renderAll();
  }

  function resetType() {
    sizeLocked = false;
    leadLocked = false;
    sizePx = autoSize();
    lead = 1.4;
    fonts.forEach(function (font) { font.previewWeight = null; });
    renderAll();
  }

  function openDetail(font, focusEl) {
    detailId = font.id;
    detailFrom = view === "compare" ? "compare" : "browse";
    weightsOpen = false;
    enqueue(font);
    enter("detail", focusEl);
    renderDetail();
    document.getElementById("fl-detail-close").focus();
  }

  function renderDetail() {
    var font = findFont(detailId);
    if (!font) return;
    document.getElementById("fl-detail-title").textContent = font.family;
    var zh = document.getElementById("fl-detail-zh");
    zh.hidden = !font.nameZh;
    zh.textContent = font.nameZh || "";
    var sample = document.getElementById("fl-detail-sample");
    var msg = document.getElementById("fl-detail-msg");
    var retry = document.getElementById("fl-detail-retry");
    if (font.state === "ready") {
      sample.hidden = false;
      msg.hidden = true;
      retry.hidden = true;
      renderSample(font, sample);
    } else {
      sample.hidden = true;
      msg.hidden = false;
      retry.hidden = font.state !== "failed";
      msg.textContent = font.state === "failed"
        ? "字体加载失败。这里不用系统字体冒充预览。"
        : "正在加载该字体…";
    }
    var pick = document.getElementById("fl-pick");
    if (isPicked(font)) pick.textContent = "移出候选";
    else if (picked.length >= MAX_PICK) pick.textContent = "候选已满";
    else pick.textContent = "加入候选";
    document.getElementById("fl-detail-weight").textContent = weightLabel(font);
    var toggle = document.getElementById("fl-weight-toggle");
    var listEl = document.getElementById("fl-weight-list");
    var note = document.getElementById("fl-weight-note");
    if (font.variable) {
      toggle.hidden = false;
      note.textContent = "可选字重 " + font.axisMin + "–" + font.axisMax + "。不会超出这款文件的轴。";
      listEl.hidden = !weightsOpen;
      listEl.replaceChildren();
      weightSteps(font).forEach(function (w) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "fl-quiet";
        button.textContent = w + (WEIGHT_NAME[w] ? " " + WEIGHT_NAME[w] : "");
        button.setAttribute("aria-pressed", w === activeWeight(font) ? "true" : "false");
        button.addEventListener("click", function () {
          font.previewWeight = w;
          renderAll();
        });
        listEl.appendChild(button);
      });
    } else {
      toggle.hidden = true;
      listEl.hidden = true;
      note.textContent = "这款是静态字重，不会模拟粗体。";
    }
    var download = document.getElementById("fl-download");
    var zipLine = document.getElementById("fl-zip-line");
    download.hidden = !font.zip;
    if (font.zip) {
      var bytes = font.zipBytes ? " · ZIP " + groupBytes(font.zipBytes) + " 字节" : "";
      zipLine.textContent = font.family + " " + shortVersion(font) + bytes;
    } else {
      zipLine.textContent = "这款没有本站安装包。其余字体只预览，并前往官方来源。";
    }
    var source = document.getElementById("fl-source");
    source.href = font.source;
    var license = document.getElementById("fl-license");
    license.href = encodePath(font.licenseFile);
    var rfn = document.getElementById("fl-rfn");
    rfn.hidden = !font.rfn;
    rfn.textContent = font.rfn ? "保留名称：" + font.rfn : "";
  }

  function renderCompare() {
    var box = document.getElementById("fl-compare-list");
    var empty = document.getElementById("fl-compare-empty");
    box.replaceChildren();
    empty.hidden = picked.length !== 0;
    picked.forEach(function (id) {
      var font = findFont(id);
      if (!font) return;
      enqueue(font);
      var card = document.createElement("article");
      card.className = "fl-card";
      var sample = document.createElement("div");
      sample.className = "fl-sample";
      var msg = document.createElement("p");
      msg.className = "fl-card-msg";
      if (font.state === "ready") {
        msg.hidden = true;
        renderSample(font, sample);
      } else {
        sample.hidden = true;
        msg.textContent = font.state === "failed" ? "字体加载失败" : "正在加载该字体…";
      }
      var row = document.createElement("div");
      row.className = "fl-id";
      var family = document.createElement("p");
      family.className = "fl-family";
      family.textContent = font.family;
      var more = document.createElement("button");
      more.type = "button";
      more.className = "fl-more";
      more.setAttribute("aria-label", "查看 " + font.family);
      var icon = document.createElement("img");
      icon.src = "/img/font-more.svg";
      icon.width = 20;
      icon.height = 20;
      icon.alt = "";
      more.appendChild(icon);
      more.addEventListener("click", function () { openDetail(font, more); });
      row.appendChild(family);
      row.appendChild(more);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "fl-quiet";
      remove.textContent = "移除 " + font.family;
      remove.addEventListener("click", function () {
        var at = picked.indexOf(font.id);
        if (at !== -1) picked.splice(at, 1);
        limitEl.hidden = true;
        renderAll();
      });
      card.appendChild(sample);
      card.appendChild(msg);
      card.appendChild(row);
      box.appendChild(card);
      box.appendChild(remove);
    });
  }

  custom.addEventListener("compositionstart", function () { composing = true; });
  custom.addEventListener("compositionend", function () {
    composing = false;
    fitInput();
    renderAll();
  });
  custom.addEventListener("input", function () {
    fitInput();
    if (!composing) renderAll();
  });

  document.getElementById("fl-candidates").addEventListener("click", function () {
    enter("compare", this);
    renderCompare();
    document.getElementById("fl-compare-close").focus();
  });
  document.getElementById("fl-filter-current").addEventListener("click", function () {
    if (filter === "全部") return;
    filter = "全部";
    drawFilters();
    applyFilter();
  });
  document.getElementById("fl-cat-toggle").addEventListener("click", function () {
    var open = catsEl.hidden;
    catsEl.hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.getElementById("fl-search-toggle").addEventListener("click", function () {
    var open = searchRow.hidden;
    searchRow.hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) searchInput.focus();
  });
  searchInput.addEventListener("input", function () {
    query = searchInput.value.trim().toLowerCase();
    applyFilter();
  });
  document.getElementById("fl-search-clear").addEventListener("click", clearSearchOnly);
  document.getElementById("fl-empty-search").addEventListener("click", clearSearchOnly);
  document.getElementById("fl-empty-reset").addEventListener("click", function () {
    resetFilters();
    searchInput.focus();
  });
  document.getElementById("fl-type-open").addEventListener("click", function () {
    enter("type", this);
    renderType();
    document.getElementById("fl-type-close").focus();
  });
  document.getElementById("fl-type-close").addEventListener("click", backToBrowse);
  document.getElementById("fl-size-dec").addEventListener("click", function () { stepSize(-1); });
  document.getElementById("fl-size-inc").addEventListener("click", function () { stepSize(1); });
  document.getElementById("fl-lead-dec").addEventListener("click", function () { stepLead(-0.1); });
  document.getElementById("fl-lead-inc").addEventListener("click", function () { stepLead(0.1); });
  document.getElementById("fl-type-reset").addEventListener("click", resetType);
  document.getElementById("fl-sample-reset").addEventListener("click", function () {
    custom.value = LONG;
    fitInput();
    renderAll();
  });
  document.getElementById("fl-help-open").addEventListener("click", function () {
    var help = document.getElementById("fl-help");
    var open = help.hidden;
    help.hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.getElementById("fl-detail-close").addEventListener("click", function () {
    if (detailFrom === "compare") {
      view = "compare";
      paintViews();
      renderCompare();
      document.getElementById("fl-compare-close").focus();
      return;
    }
    backToBrowse();
  });
  document.getElementById("fl-detail-retry").addEventListener("click", function () {
    var font = findFont(detailId);
    if (font) retryFont(font);
  });
  document.getElementById("fl-pick").addEventListener("click", function () {
    var font = findFont(detailId);
    if (!font) return;
    togglePick(font);
    renderDetail();
  });
  document.getElementById("fl-weight-toggle").addEventListener("click", function () {
    weightsOpen = !weightsOpen;
    this.setAttribute("aria-expanded", weightsOpen ? "true" : "false");
    renderDetail();
  });
  document.getElementById("fl-download").addEventListener("click", function () {
    var font = findFont(detailId);
    if (font && font.zip) downloadZip(font);
  });
  document.getElementById("fl-compare-close").addEventListener("click", backToBrowse);
  document.getElementById("fl-compare-exit").addEventListener("click", backToBrowse);
  document.getElementById("fl-compare-clear").addEventListener("click", function () {
    picked = [];
    limitEl.hidden = true;
    renderAll();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || view === "browse") return;
    if (view === "detail" && detailFrom === "compare") {
      view = "compare";
      paintViews();
      renderCompare();
      return;
    }
    backToBrowse();
  });
  window.addEventListener("scroll", kickVisible, { passive: true });
  window.addEventListener("resize", function () {
    if (!sizeLocked) renderAll();
    kickVisible();
  });

  fitInput();
  fetch("/fonts/library/catalog.json").then(function (response) {
    if (!response.ok) throw new Error("catalog");
    return response.json();
  }).then(function (data) {
    fonts = data.fonts || [];
    drawCards();
    drawFilters();
    renderAll();
    kickVisible();
  }).catch(function () {
    setStatus("字体目录没有读到。字体文件没有加载。");
  });
})();
