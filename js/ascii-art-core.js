/* 决定哪一段文字可以交给 FIGlet。中文不生成字符画。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AsciiArt = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CJK = /[\u3000-\u303F\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;
  var SUPPLEMENT = /[\u{20000}-\u{3FFFF}]/u;

  function hasCJK(text) {
    if (CJK.test(text)) return true;
    try {
      return SUPPLEMENT.test(text);
    } catch (err) {
      return false;
    }
  }

  function prepare(text) {
    var raw = String(text == null ? "" : text);
    var source = raw.replace(/[^\n\x20-\x7E]/g, "");
    var renderable = /[A-Za-z0-9]/.test(source);
    return {
      cjk: hasCJK(raw),
      source: renderable ? source : "",
      empty: !renderable
    };
  }

  return {
    hasCJK: hasCJK,
    prepare: prepare
  };
});
