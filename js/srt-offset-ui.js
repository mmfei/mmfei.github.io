/* 页面只调用本地解析。不上传字幕，不写 localStorage，不发请求。 */
(function () {
  var core = window.SrtOffset;
  var text = document.getElementById("srt-text");
  var fileInput = document.getElementById("srt-file");
  var offsetInput = document.getElementById("srt-offset");
  var minus = document.getElementById("srt-minus");
  var plus = document.getElementById("srt-plus");
  var zero = document.getElementById("srt-zero");
  var example = document.getElementById("srt-example");
  var reset = document.getElementById("srt-reset");
  var generate = document.getElementById("srt-generate");
  var download = document.getElementById("srt-download");
  var status = document.getElementById("srt-status");
  var errors = document.getElementById("srt-errors");
  var warnings = document.getElementById("srt-warnings");
  var summary = document.getElementById("srt-summary");
  var preview = document.getElementById("srt-preview");
  var fileNote = document.getElementById("srt-file-note");

  var state = {
    epoch: 0,
    shown: false,
    verified: null,
    sourceName: "",
    source: "",
    loading: false
  };

  function clearNode(node) {
    node.replaceChildren();
  }

  function addItem(list, message) {
    var item = document.createElement("li");
    item.textContent = message;
    list.appendChild(item);
  }

  function newlineLabel(style) {
    if (style === "crlf") return "CRLF";
    if (style === "lf") return "LF";
    if (style === "cr") return "CR";
    if (style === "mixed") return "混用";
    return "无换行";
  }

  function invalidate() {
    state.epoch += 1;
    var had = state.shown || state.verified;
    state.verified = null;
    state.shown = false;
    download.disabled = true;
    if (!had) {
      return;
    }
    clearNode(errors);
    clearNode(warnings);
    clearNode(preview);
    summary.textContent = "";
    status.textContent = "输入已变化，旧预览和下载已作废。请重新生成。回读通过后才能下载。";
  }

  function setSource(value) {
    state.loading = true;
    state.source = String(value);
    text.value = state.source;
    state.loading = false;
  }

  function setOffset(ms) {
    offsetInput.value = String(ms);
    invalidate();
  }

  function currentOffset() {
    var parsed = core.parseOffset(offsetInput.value);
    return parsed.ok ? parsed.ms : null;
  }

  function nudge(delta) {
    var current = currentOffset();
    var next = current == null ? delta : current + delta;
    if (!Number.isSafeInteger(next)) {
      status.textContent = "再偏移 1000 毫秒会超出可精确表示的范围，没有改数字。";
      return;
    }
    setOffset(next);
  }

  function showMessages(list, items) {
    clearNode(list);
    items.forEach(function (item) {
      addItem(list, item.message || item);
    });
  }

  function renderPreview(before, after, offsetMs) {
    clearNode(preview);
    summary.textContent = "共 " + before.cues.length + " 条。偏移 " + core.describeOffset(offsetMs) + "。下面是回读到的原时间和新时间。";
    before.cues.forEach(function (cue, index) {
      var next = after.cues[index];
      var card = document.createElement("article");
      card.className = "srt-cue";
      var heading = document.createElement("p");
      heading.className = "srt-cue-no";
      heading.textContent = "第 " + cue.blockNo + " 条 · 序号 " + cue.indexLine;
      var start = document.createElement("p");
      start.textContent = "开始 " + cue.startToken + " → " + next.startToken;
      var end = document.createElement("p");
      end.textContent = "结束 " + cue.endToken + " → " + next.endToken;
      var body = document.createElement("pre");
      body.className = "srt-cue-text";
      body.textContent = next.textLines.join("\n");
      card.appendChild(heading);
      card.appendChild(start);
      card.appendChild(end);
      card.appendChild(body);
      preview.appendChild(card);
    });
  }

  function downloadName() {
    var base = state.sourceName || "subtitle.srt";
    base = base.replace(/^.*[\\/]/, "");
    base = base.replace(/\.srt$/i, "");
    base = base.replace(/[^\w.\- \u4e00-\u9fff]+/g, "_");
    if (!base.trim()) {
      base = "subtitle";
    }
    return base.trim() + ".shifted.srt";
  }

  function generatePreview() {
    var epoch = state.epoch + 1;
    state.epoch = epoch;
    state.verified = null;
    state.shown = true;
    download.disabled = true;
    clearNode(errors);
    clearNode(warnings);
    clearNode(preview);
    summary.textContent = "";

    var parsedOffset = core.parseOffset(offsetInput.value);
    if (!parsedOffset.ok) {
      addItem(errors, parsedOffset.error + " 整次已拒绝，没有改写字幕。");
      status.textContent = "偏移无效。下载保持关闭。";
      return;
    }

    var sourceText = state.source;
    var shifted = core.shiftSrt(sourceText, parsedOffset.ms);
    if (!shifted.ok || shifted.output == null) {
      showMessages(errors, shifted.errors);
      status.textContent = "这次没有生成文件。负时间或无法确定的块都会整次拒绝，不会截成 0，也不会只改其中几条。";
      return;
    }

    var check = core.verifyShifted(sourceText, shifted.output, parsedOffset.ms);
    if (!check.ok) {
      check.errors.forEach(function (message) {
        addItem(errors, message);
      });
      status.textContent = "独立回读未通过，下载保持关闭。";
      return;
    }
    if (epoch !== state.epoch) {
      return;
    }

    var before = core.inspect(sourceText);
    var after = core.inspect(shifted.output);
    renderPreview(before, after, parsedOffset.ms);
    showMessages(warnings, shifted.warnings);
    var bomLabel = shifted.meta.bom ? "含 BOM" : "无 BOM";
    status.textContent = "回读通过：" + check.cueCount + " 条，UTF-8，" + bomLabel + "，换行 " + newlineLabel(shifted.meta.newlineStyle) + "，" + check.bytes + " 字节。可以下载。字幕没有上传。";
    state.verified = {
      epoch: epoch,
      output: shifted.output,
      offset: parsedOffset.ms,
      source: sourceText,
      bytes: check.bytes
    };
    download.disabled = false;
  }

  function saveFile() {
    if (!state.verified || state.verified.epoch !== state.epoch) {
      download.disabled = true;
      status.textContent = "预览已作废。请重新生成，回读通过后才能下载。";
      return;
    }
    var again = core.verifyShifted(text.value, state.verified.output, state.verified.offset);
    var current = core.parseOffset(offsetInput.value);
    if (!again.ok || !current.ok || current.ms !== state.verified.offset || state.source !== state.verified.source) {
      invalidate();
      status.textContent = "下载前回读未通过，没有保存文件。";
      return;
    }
    var name = downloadName();
    var blob = new Blob([state.verified.output], { type: "text/plain;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1500);
    status.textContent = "已开始下载 " + name + "（" + again.bytes + " 字节）。文件在本机，没有上传。";
  }

  text.addEventListener("paste", function (event) {
    var data = event.clipboardData && event.clipboardData.getData("text/plain");
    if (typeof data !== "string") {
      return;
    }
    event.preventDefault();
    var start = text.selectionStart || 0;
    var end = text.selectionEnd || 0;
    var shown = text.value;
    setSource(shown.slice(0, start) + data + shown.slice(end));
    var cursor = start + data.length;
    text.setSelectionRange(Math.min(cursor, text.value.length), Math.min(cursor, text.value.length));
    invalidate();
  });
  text.addEventListener("input", function () {
    if (state.loading) {
      return;
    }
    state.source = text.value;
    invalidate();
  });
  offsetInput.addEventListener("input", invalidate);
  offsetInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      generatePreview();
    }
  });
  minus.addEventListener("click", function () { nudge(-1000); });
  plus.addEventListener("click", function () { nudge(1000); });
  zero.addEventListener("click", function () { setOffset(0); });
  example.addEventListener("click", function () {
    setSource(core.EXAMPLE_SRT);
    state.sourceName = "";
    fileInput.value = "";
    fileNote.textContent = "已填入合法示例。示例只在本页，不会上传。";
    invalidate();
  });
  reset.addEventListener("click", function () {
    setSource("");
    state.sourceName = "";
    fileInput.value = "";
    fileNote.textContent = "";
    offsetInput.value = "0";
    invalidate();
    status.textContent = "已重置。字幕文本和偏移都已清空，没有保留上一份结果。";
  });
  generate.addEventListener("click", generatePreview);
  download.addEventListener("click", saveFile);

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      return;
    }
    if (file.size > core.MAX_BYTES) {
      setSource("");
      state.sourceName = "";
      fileNote.textContent = "";
      invalidate();
      status.textContent = "文件超过 1 MiB，没有读入，也没有上传。";
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      status.textContent = "这个文件没有读出来，没有上传，也没有改预览。";
    };
    reader.onload = function () {
      var decoded;
      try {
        decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(reader.result);
      } catch (error) {
        setSource("");
        state.sourceName = "";
        fileNote.textContent = "";
        status.textContent = "文件不是合法的 UTF-8，没有改写，也没有上传。";
        invalidate();
        return;
      }
      setSource(decoded);
      state.sourceName = file.name;
      var bom = decoded.charCodeAt(0) === 0xFEFF ? "含 BOM" : "无 BOM";
      fileNote.textContent = file.name + "，" + file.size + " 字节，按 UTF-8 读入，" + bom + "。尚未改文本时，下载保留原来的换行。文件留在本机，没有上传。";
      invalidate();
    };
    reader.readAsArrayBuffer(file);
  });
})();
