/* 整份 SRT 的恒定毫秒偏移。只在浏览器里运算，不上传。
   负时间整次拒绝，不截成 0，也不改无法确定的块。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SrtOffset = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var MAX_SAFE = 9007199254740991;
  var MAX_BYTES = 1024 * 1024;
  var MAX_CUES = 10000;
  var STAMP = /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/;
  var DOT_STAMP = /^(\d{2,}):(\d{2}):(\d{2})\.(\d{3})$/;
  var TIMING = /^(\s*)(\S+)(\s*-->\s*)(\S+)(.*)$/;

  var EXAMPLE_SRT = [
    "1",
    "00:00:01,000 --> 00:00:03,200",
    "第一行中文",
    "第二行，保留",
    "",
    "2",
    "00:00:04,000 --> 00:00:05,500",
    "Hello，标点。",
    ""
  ].join("\n");

  function parseOffset(raw) {
    var text = String(raw == null ? "" : raw).trim();
    if (!/^[+-]?\d+$/.test(text)) {
      return { ok: false, error: "偏移只能是整数毫秒，例如 1000、-1000 或 0。" };
    }
    var digits = text.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
    if (digits.length > 16 || (digits.length === 16 && digits > "9007199254740991")) {
      return { ok: false, error: "偏移超出可精确表示的整数毫秒，没有改写字幕。" };
    }
    var ms = Number(text);
    if (!Number.isSafeInteger(ms)) {
      return { ok: false, error: "偏移超出可精确表示的整数毫秒，没有改写字幕。" };
    }
    return { ok: true, ms: ms };
  }

  function pad(value, width) {
    var text = String(value);
    while (text.length < width) {
      text = "0" + text;
    }
    return text;
  }

  function formatTime(ms, hourWidth) {
    if (!Number.isSafeInteger(ms) || ms < 0) {
      return null;
    }
    var hour = Math.floor(ms / 3600000);
    var rest = ms % 3600000;
    var minute = Math.floor(rest / 60000);
    rest = rest % 60000;
    var second = Math.floor(rest / 1000);
    var milli = rest % 1000;
    var width = hourWidth >= 2 ? hourWidth : 2;
    return pad(hour, width) + ":" + pad(minute, 2) + ":" + pad(second, 2) + "," + pad(milli, 3);
  }

  function formatSigned(ms) {
    if (ms >= 0) {
      return formatTime(ms, 2);
    }
    return "-" + formatTime(-ms, 2);
  }

  function describeOffset(ms) {
    var abs = Math.abs(ms);
    var seconds = Math.floor(abs / 1000);
    var milli = abs % 1000;
    var clock = seconds + "." + pad(milli, 3);
    if (ms > 0) {
      return "+" + ms + " 毫秒（晚 " + clock + " 秒）";
    }
    if (ms < 0) {
      return ms + " 毫秒（早 " + clock + " 秒）";
    }
    return "0 毫秒（时间不变）";
  }

  function splitLines(text) {
    var bom = text.charCodeAt(0) === 0xFEFF;
    var body = bom ? text.slice(1) : text;
    var lines = [];
    var sawCrlf = false;
    var sawLf = false;
    var sawCr = false;
    var i = 0;
    while (i < body.length) {
      var j = i;
      while (j < body.length && body.charAt(j) !== "\n" && body.charAt(j) !== "\r") {
        j += 1;
      }
      var ending = "";
      var next = j;
      if (body.charAt(j) === "\r" && body.charAt(j + 1) === "\n") {
        ending = "\r\n";
        sawCrlf = true;
        next = j + 2;
      } else if (body.charAt(j) === "\n") {
        ending = "\n";
        sawLf = true;
        next = j + 1;
      } else if (body.charAt(j) === "\r") {
        ending = "\r";
        sawCr = true;
        next = j + 1;
      }
      lines.push({
        content: body.slice(i, j),
        ending: ending,
        lineNo: lines.length + 1
      });
      if (next === i) {
        break;
      }
      i = next;
    }
    var kinds = (sawCrlf ? 1 : 0) + (sawLf ? 1 : 0) + (sawCr ? 1 : 0);
    var newlineStyle = "none";
    if (kinds > 1) {
      newlineStyle = "mixed";
    } else if (sawCrlf) {
      newlineStyle = "crlf";
    } else if (sawLf) {
      newlineStyle = "lf";
    } else if (sawCr) {
      newlineStyle = "cr";
    }
    return { bom: bom, lines: lines, newlineStyle: newlineStyle };
  }

  function groupBlocks(lines) {
    var leading = [];
    var i = 0;
    while (i < lines.length && lines[i].content === "") {
      leading.push(lines[i]);
      i += 1;
    }
    var blocks = [];
    while (i < lines.length) {
      var cueLines = [];
      while (i < lines.length && lines[i].content !== "") {
        cueLines.push(lines[i]);
        i += 1;
      }
      var trailing = [];
      while (i < lines.length && lines[i].content === "") {
        trailing.push(lines[i]);
        i += 1;
      }
      if (cueLines.length) {
        blocks.push({
          blockNo: blocks.length + 1,
          startLine: cueLines[0].lineNo,
          cueLines: cueLines,
          trailing: trailing
        });
      }
    }
    return { leading: leading, blocks: blocks };
  }

  function stampError(token) {
    if (DOT_STAMP.test(token)) {
      return "使用了点号毫秒。SRT 要用逗号，本工具不自动改写。";
    }
    if (/^\d+:\d+:\d+,\d+$/.test(token) && !STAMP.test(token)) {
      var loose = /^(\d+):(\d+):(\d+),(\d+)$/.exec(token);
      if (loose && loose[1].length < 2) {
        return "小时不足两位。无法确定是否该补零，没有改写。";
      }
      if (loose && (loose[2].length !== 2 || loose[3].length !== 2 || loose[4].length !== 3)) {
        return "分、秒或毫秒的位数不符合 HH:MM:SS,mmm，没有自动进位或截断。";
      }
    }
    return "不是 HH:MM:SS,mmm。小时至少两位，超过 99 小时可以继续加位数。";
  }

  function parseStamp(token) {
    if (DOT_STAMP.test(token)) {
      return { ok: false, code: "dot_millis", message: stampError(token) };
    }
    var match = STAMP.exec(token);
    if (!match) {
      return { ok: false, code: "bad_time", message: stampError(token) };
    }
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    var second = Number(match[3]);
    var milli = Number(match[4]);
    if (minute > 59 || second > 59) {
      return { ok: false, code: "bad_clock", message: "分或秒超过 59，不自动进位。" };
    }
    if (!Number.isSafeInteger(hour) || hour > Math.floor(MAX_SAFE / 3600000)) {
      return { ok: false, code: "overflow", message: "时间超出可精确表示的范围。" };
    }
    var total = hour * 3600000 + minute * 60000 + second * 1000 + milli;
    if (!Number.isSafeInteger(total)) {
      return { ok: false, code: "overflow", message: "时间超出可精确表示的范围。" };
    }
    return { ok: true, ms: total, hourWidth: match[1].length, token: token };
  }

  function parseTiming(line) {
    var match = TIMING.exec(line);
    if (!match || match[3].indexOf("-->") === -1) {
      return { ok: false, errors: [{ code: "bad_timing", message: "没有找到 --> 时间行。" }] };
    }
    var start = parseStamp(match[2]);
    var end = parseStamp(match[4]);
    var errors = [];
    if (!start.ok) {
      errors.push({ code: start.code, message: "开始时间" + start.message });
    }
    if (!end.ok) {
      errors.push({ code: end.code, message: "结束时间" + end.message });
    }
    if (errors.length) {
      return { ok: false, errors: errors };
    }
    return {
      ok: true,
      errors: [],
      startMs: start.ms,
      endMs: end.ms,
      startWidth: start.hourWidth,
      endWidth: end.hourWidth,
      startToken: start.token,
      endToken: end.token,
      lead: match[1],
      arrow: match[3],
      suffix: match[5],
      raw: line
    };
  }

  function blockError(block, lineNo, code, message) {
    return {
      blockNo: block.blockNo,
      lineNo: lineNo,
      code: code,
      message: "第 " + block.blockNo + " 块（第 " + lineNo + " 行）：" + message
    };
  }

  function readCue(block) {
    var errors = [];
    var lines = block.cueLines;
    var head = lines[0];
    if (!/^\d+$/.test(head.content)) {
      errors.push(blockError(block, head.lineNo, "bad_index", "首行不是字幕序号，无法确定要改哪一条。"));
    }
    if (lines.length < 2) {
      errors.push(blockError(block, head.lineNo, "truncated", "缺少时间行。"));
      return { ok: false, errors: errors, blockNo: block.blockNo };
    }
    var timing = parseTiming(lines[1].content);
    if (!timing.ok) {
      timing.errors.forEach(function (item) {
        errors.push(blockError(block, lines[1].lineNo, item.code, item.message));
      });
    }
    if (lines.length < 3) {
      errors.push(blockError(block, lines[lines.length - 1].lineNo, "empty_text", "缺少字幕正文。"));
    }
    if (errors.length || !timing.ok) {
      return { ok: false, errors: errors, blockNo: block.blockNo };
    }
    return {
      ok: true,
      errors: [],
      blockNo: block.blockNo,
      indexLine: head.content,
      indexLineNo: head.lineNo,
      timingLineNo: lines[1].lineNo,
      textLines: lines.slice(2).map(function (line) { return line.content; }),
      cueLines: lines,
      trailing: block.trailing,
      startMs: timing.startMs,
      endMs: timing.endMs,
      startWidth: timing.startWidth,
      endWidth: timing.endWidth,
      startToken: timing.startToken,
      endToken: timing.endToken,
      lead: timing.lead,
      arrow: timing.arrow,
      suffix: timing.suffix,
      timingRaw: timing.raw
    };
  }

  function utf8Bytes(text) {
    var value = String(text == null ? "" : text);
    if (value.length > MAX_BYTES) {
      return value.length;
    }
    return new TextEncoder().encode(value).length;
  }

  function inspect(text) {
    var source = String(text == null ? "" : text);
    if (utf8Bytes(source) > MAX_BYTES) {
      return {
        bom: false,
        newlineStyle: "none",
        leading: [],
        cues: [],
        errors: [{
          blockNo: 0,
          lineNo: 0,
          code: "too_large",
          message: "字幕超过 1 MiB。整次已拒绝，没有改写。"
        }],
        blockCount: 0
      };
    }
    var split = splitLines(source);
    var grouped = groupBlocks(split.lines);
    if (grouped.blocks.length > MAX_CUES) {
      return {
        bom: split.bom,
        newlineStyle: split.newlineStyle,
        leading: grouped.leading,
        cues: [],
        errors: [{
          blockNo: 0,
          lineNo: grouped.blocks[0].startLine,
          code: "too_many",
          message: "字幕共 " + grouped.blocks.length + " 条，超过 10000 条。整次已拒绝，没有改写。"
        }],
        blockCount: grouped.blocks.length
      };
    }
    var cues = [];
    var errors = [];
    grouped.blocks.forEach(function (block) {
      var cue = readCue(block);
      if (!cue.ok) {
        errors = errors.concat(cue.errors);
        return;
      }
      cues.push(cue);
    });
    if (!grouped.blocks.length) {
      errors.push({
        blockNo: 0,
        lineNo: 1,
        code: "empty",
        message: "没有字幕块。请粘贴或选择一份 SRT。"
      });
    }
    return {
      bom: split.bom,
      newlineStyle: split.newlineStyle,
      leading: grouped.leading,
      cues: cues,
      errors: errors,
      blockCount: grouped.blocks.length
    };
  }

  function addWarning(list, blockNo, code, message) {
    list.push({
      blockNo: blockNo,
      code: code,
      message: message
    });
  }

  function collectWarnings(cues) {
    var warnings = [];
    cues.forEach(function (cue, index) {
      if (index > 0 && cue.startMs < cues[index - 1].startMs) {
        addWarning(warnings, cue.blockNo, "out_of_order", "第 " + cue.blockNo + " 块的开始时间早于上一块。文件顺序保持不变，没有重排。");
      }
    });
    for (var i = 0; i < cues.length; i += 1) {
      for (var j = i + 1; j < cues.length; j += 1) {
        var left = cues[i];
        var right = cues[j];
        if (left.startMs < right.endMs && right.startMs < left.endMs) {
          addWarning(warnings, left.blockNo, "overlap", "第 " + left.blockNo + " 块与第 " + right.blockNo + " 块时间重叠。这是两条字幕交叉，不是单条结束不晚于开始。没有合并，也没有改顺序。");
        }
      }
    }
    return warnings;
  }

  function writeLine(line, content) {
    return (content == null ? line.content : content) + line.ending;
  }

  function serialize(doc, cues) {
    var parts = [];
    if (doc.bom) {
      parts.push("\uFEFF");
    }
    doc.leading.forEach(function (line) {
      parts.push(writeLine(line));
    });
    cues.forEach(function (cue) {
      parts.push(writeLine(cue.cueLines[0]));
      var timing = cue.lead + cue.nextStartText + cue.arrow + cue.nextEndText + cue.suffix;
      parts.push(writeLine(cue.cueLines[1], timing));
      cue.cueLines.slice(2).forEach(function (line) {
        parts.push(writeLine(line));
      });
      cue.trailing.forEach(function (line) {
        parts.push(writeLine(line));
      });
    });
    return parts.join("");
  }

  function shiftSrt(text, offsetMs) {
    if (!Number.isSafeInteger(offsetMs)) {
      return {
        ok: false,
        output: null,
        errors: [{ blockNo: 0, lineNo: 0, code: "bad_offset", message: "偏移必须是整数毫秒。整次已拒绝，没有改写字幕。" }],
        warnings: [],
        cues: [],
        meta: null
      };
    }
    var doc = inspect(text);
    var errors = doc.errors.slice();
    var shifted = [];
    doc.cues.forEach(function (cue) {
      var rejected = false;
      if (cue.endMs < cue.startMs) {
        errors.push({
          blockNo: cue.blockNo,
          lineNo: cue.timingLineNo,
          code: "end_before_start",
          message: "第 " + cue.blockNo + " 块（第 " + cue.timingLineNo + " 行）：结束时间早于开始时间。每条都必须开始早于结束。整次已拒绝，没有对调，也没有写出文件。"
        });
        rejected = true;
      } else if (cue.endMs === cue.startMs) {
        errors.push({
          blockNo: cue.blockNo,
          lineNo: cue.timingLineNo,
          code: "end_equals_start",
          message: "第 " + cue.blockNo + " 块（第 " + cue.timingLineNo + " 行）：结束时间等于开始时间。每条都必须开始早于结束。整次已拒绝，没有把结束改晚，也没有写出文件。"
        });
        rejected = true;
      }
      var nextStart = cue.startMs + offsetMs;
      var nextEnd = cue.endMs + offsetMs;
      if (!Number.isSafeInteger(nextStart) || !Number.isSafeInteger(nextEnd)) {
        errors.push(blockError(
          { blockNo: cue.blockNo },
          cue.timingLineNo,
          "overflow",
          "偏移后的时间超出可精确表示的范围。整次已拒绝。"
        ));
        return;
      }
      if (nextStart < 0 || nextEnd < 0) {
        errors.push({
          blockNo: cue.blockNo,
          lineNo: cue.timingLineNo,
          code: "negative",
          message: "第 " + cue.blockNo + " 块（第 " + cue.timingLineNo + " 行）：偏移后时间小于 0（开始 " + formatSigned(nextStart) + "，结束 " + formatSigned(nextEnd) + "）。整次已拒绝，没有把时间截成 0，也没有写出文件。"
        });
        rejected = true;
      }
      if (rejected) {
        return;
      }
      var next = Object.assign({}, cue, {
        startMs: nextStart,
        endMs: nextEnd,
        startToken: formatTime(nextStart, cue.startWidth),
        endToken: formatTime(nextEnd, cue.endWidth),
        nextStartText: formatTime(nextStart, cue.startWidth),
        nextEndText: formatTime(nextEnd, cue.endWidth),
        timingRaw: cue.lead + formatTime(nextStart, cue.startWidth) + cue.arrow + formatTime(nextEnd, cue.endWidth) + cue.suffix
      });
      shifted.push(next);
    });
    var meta = {
      bom: doc.bom,
      newlineStyle: doc.newlineStyle,
      blockCount: doc.blockCount,
      cueCount: doc.cues.length
    };
    if (errors.length || shifted.length !== doc.cues.length) {
      return { ok: false, output: null, errors: errors, warnings: [], cues: [], meta: meta };
    }
    var warnings = collectWarnings(shifted);
    if (doc.newlineStyle === "mixed") {
      warnings.unshift({
        blockNo: 0,
        code: "mixed_newline",
        message: "换行符混用。已按每一行原来的换行保留，没有统一成同一种。"
      });
    }
    return {
      ok: true,
      output: serialize(doc, shifted),
      errors: [],
      warnings: warnings,
      cues: shifted,
      meta: meta
    };
  }

  function verifyShifted(originalText, outputText, offsetMs) {
    if (!Number.isSafeInteger(offsetMs)) {
      return { ok: false, errors: ["偏移不是整数毫秒，回读未通过。"], cueCount: 0, bytes: 0 };
    }
    var source = inspect(originalText);
    var output = inspect(outputText);
    var errors = [];
    if (source.errors.length) {
      errors.push("原文仍有无法确定的块，回读未通过。");
    }
    if (output.errors.length) {
      errors.push("结果里有无法确定的块，回读未通过。");
    }
    if (!errors.length && source.cues.length !== output.cues.length) {
      errors.push("回读条数与原文不一致。");
    }
    if (source.bom !== output.bom) {
      errors.push("回读时 BOM 与原文不一致。");
    }
    var limit = Math.min(source.cues.length, output.cues.length);
    for (var i = 0; i < limit; i += 1) {
      var before = source.cues[i];
      var after = output.cues[i];
      var wantStart = before.startMs + offsetMs;
      var wantEnd = before.endMs + offsetMs;
      if (!Number.isSafeInteger(wantStart) || !Number.isSafeInteger(wantEnd) || wantStart < 0 || wantEnd < 0) {
        errors.push("第 " + before.blockNo + " 块回读发现负时间或溢出，拒绝下载。");
        continue;
      }
      if (before.endMs <= before.startMs || after.endMs <= after.startMs || wantEnd <= wantStart) {
        errors.push("第 " + before.blockNo + " 块回读发现结束不晚于开始，拒绝下载。");
        continue;
      }
      if (after.startMs !== wantStart || after.endMs !== wantEnd) {
        errors.push("第 " + before.blockNo + " 块回读时间与偏移不一致。");
      }
      if (after.indexLine !== before.indexLine) {
        errors.push("第 " + before.blockNo + " 块序号被改动。");
      }
      if (after.textLines.length !== before.textLines.length || after.textLines.join("\n") !== before.textLines.join("\n")) {
        errors.push("第 " + before.blockNo + " 块正文被改动。");
      }
      var expectLine = before.lead + formatTime(wantStart, before.startWidth) + before.arrow + formatTime(wantEnd, before.endWidth) + before.suffix;
      if (after.timingRaw !== expectLine) {
        errors.push("第 " + before.blockNo + " 块时间行与预期不一致。");
      }
    }
    var bytes = 0;
    try {
      var encoded = new TextEncoder().encode(String(outputText == null ? "" : outputText));
      var decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded);
      bytes = encoded.length;
      if (decoded !== String(outputText)) {
        errors.push("UTF-8 回读与结果不一致。");
      }
    } catch (error) {
      errors.push("结果不是合法 UTF-8，回读未通过。");
    }
    if (errors.length) {
      return { ok: false, errors: errors, cueCount: 0, bytes: 0 };
    }
    return { ok: true, errors: [], cueCount: source.cues.length, bytes: bytes };
  }

  return {
    MAX_BYTES: MAX_BYTES,
    MAX_CUES: MAX_CUES,
    EXAMPLE_SRT: EXAMPLE_SRT,
    parseOffset: parseOffset,
    describeOffset: describeOffset,
    formatTime: formatTime,
    inspect: inspect,
    shiftSrt: shiftSrt,
    verifyShifted: verifyShifted
  };
});
