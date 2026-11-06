(function () {
  // Reads the Yahoo Fantasy Matchup page that is already open in the tab and returns plain data.
  //
  // VERSION 0: written from the layout of Yahoo's app screenshot (player on the left, slot in
  // the middle, player on the right, an "actual" and a "projected" number for each side). It
  // looks for the slot labels and reads the text around them instead of relying on class names,
  // which Yahoo changes often. It has not yet been checked against the real web page. Run
  // scripts/capture.sh on the signed-in page and the result tells us exactly what to adjust.

  var SLOTS = ["QB", "RB", "WR", "TE", "W/R/T", "W/R", "FLEX", "K", "DEF", "D/ST", "BN", "IR"];
  var DECIMAL = /^-?\d+\.\d{1,2}$/;
  var DASH = /^[—–-]{1,2}$/;
  var NAMELIKE = /^[A-Z][A-Za-z.'’-]*\.?\s+[A-Za-z][A-Za-z.'’ -]+$/;
  var INFO = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b|^(Final|Live|Q[1-4]|Half|OT)\b|^\d{1,2}:\d{2}/i;
  var IGNORE_TEAM = /^(team|matchup|players|league|home|all matchups|week \d+|win%|win % presented by|kalshi|projected|actual|total)/i;

  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function tokensOf(root) {
    var out = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      var t = clean(walker.currentNode.nodeValue);
      if (t) out.push({ t: t, node: walker.currentNode });
    }
    return out;
  }

  function isNumeric(t) { return DECIMAL.test(t) || DASH.test(t); }
  function toNumber(t) { return DECIMAL.test(t) ? parseFloat(t) : null; }

  function parseSide(tokens, isLeft) {
    var texts = tokens.map(function (k) { return k.t; });
    var nums = texts.filter(isNumeric);
    var pair = isLeft ? nums.slice(-2) : nums.slice(0, 2);
    var actual = null, projected = null;
    if (pair.length === 2) { actual = toNumber(pair[0]); projected = toNumber(pair[1]); }
    else if (pair.length === 1) { projected = toNumber(pair[0]); }

    var names = texts.filter(function (t) { return NAMELIKE.test(t); });
    var name = names.length ? (isLeft ? names[0] : names[names.length - 1]) : "";

    var team = "";
    texts.forEach(function (t) {
      if (t.indexOf("•") !== -1) {
        var parts = t.split("•");
        team = clean(parts[parts.length - 1]);
      }
    });
    var info = "";
    for (var i = 0; i < texts.length; i++) { if (INFO.test(texts[i])) { info = texts[i]; break; } }

    return { name: name, team: team, info: info, actual: actual, projected: projected };
  }

  var out = { ok: false, version: 0, week: null, teams: [], rows: [], debug: {} };

  var weekMatch = /Week\s+(\d+)/i.exec(document.body.innerText || "");
  if (weekMatch) out.week = parseInt(weekMatch[1], 10);

  var all = tokensOf(document.body);
  var firstRowIndex = -1;
  var seenRows = [];

  all.forEach(function (tok, index) {
    if (SLOTS.indexOf(tok.t) === -1) return;

    var el = tok.node.parentElement;
    for (var depth = 0; el && depth < 8; depth++, el = el.parentElement) {
      var row = tokensOf(el);
      var at = -1;
      for (var i = 0; i < row.length; i++) { if (row[i].node === tok.node) { at = i; break; } }
      if (at === -1) continue;
      var before = row.slice(0, at), after = row.slice(at + 1);
      var numsBefore = before.filter(function (k) { return isNumeric(k.t); }).length;
      var numsAfter = after.filter(function (k) { return isNumeric(k.t); }).length;
      var names = row.filter(function (k) { return NAMELIKE.test(k.t); }).length;
      var otherSlots = row.filter(function (k, j) { return j !== at && SLOTS.indexOf(k.t) !== -1; }).length;
      if (numsBefore >= 1 && numsAfter >= 1 && names >= 2 && otherSlots === 0) {
        if (seenRows.indexOf(el) !== -1) return;
        seenRows.push(el);
        if (firstRowIndex === -1) firstRowIndex = index;
        out.rows.push({ slot: tok.t, left: parseSide(before, true), right: parseSide(after, false) });
        return;
      }
    }
  });

  // Team names and header numbers: best guess from the text above the first row.
  var pre = firstRowIndex === -1 ? [] : all.slice(0, firstRowIndex).map(function (k) { return k.t; });
  var teamNames = pre.filter(function (t) {
    return t.length >= 3 && t.length <= 40 && /[A-Za-z]/.test(t) && !/\d/.test(t) &&
      SLOTS.indexOf(t) === -1 && !IGNORE_TEAM.test(t);
  });
  var headerNumbers = pre.filter(function (t) { return DECIMAL.test(t); }).map(parseFloat);
  out.teams = [
    { name: teamNames[0] || "", total: headerNumbers.length > 0 ? headerNumbers[0] : null },
    { name: teamNames[1] || "", total: headerNumbers.length > 2 ? headerNumbers[2] : null }
  ];

  out.ok = out.rows.length > 0;
  out.debug = {
    url: location.href,
    title: document.title,
    textTokens: all.length,
    rowsFound: out.rows.length,
    headerNumbers: headerNumbers.slice(0, 8),
    preRowText: pre.slice(0, 30)
  };
  return out;
})()
