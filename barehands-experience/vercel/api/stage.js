const UPSTREAM = 'https://raw.githubusercontent.com/jaredrhod/barehands/0a097be1d95069f6121326e05985fc1418e9189f/stage.html';
const PART_BASE = 'https://raw.githubusercontent.com/gnosisd/virtualmin/barehands-experience-v1/barehands-experience/experience-parts/';

async function fetchText(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'AELIA-Experience' },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

function tuneCompactPinch(html) {
  // Ioannis compact pinch profile, fitted from the 2026-08-17 P-sample:
  // ratio median ~0.13, f8 ~1.11, back fingers ~0.55-0.67,
  // thumb tRel ~0.61, palm aspect ~2.2-3.0.
  //
  // Upstream Barehands only admits the original OK-sign signature
  // (index curled, back fingers extended). This user naturally clicks
  // with thumb/index together while the back fingers remain curled.
  // Add that as a SECOND admission route; original OK-sign remains intact.
  const oldGate = `const okBack = (backMean - f8v > 0.18 && backMean > 1.30) ||
                       (aspect < 2.0 && tRel > 0.95);`;

  const newGate = `const compactPinch =
          ratio < 0.25 &&
          f8v > 0.92 &&
          (f8v - backMean) > 0.28 &&
          backMean < 0.92 &&
          tRel > 0.45 && tRel < 0.88 &&
          aspect > 1.45 && aspect < 5.5 &&
          !(cur.fp && cur.fp.ph > 0);
        const okBack = (backMean - f8v > 0.18 && backMean > 1.30) ||
                       (aspect < 2.0 && tRel > 0.95) ||
                       compactPinch;`;

  if (!html.includes(oldGate))
    throw new Error('Compact-pinch patch point not found in pinned Barehands');
  html = html.replace(oldGate, newGate);

  // Make the debug HUD tell us when the personal compact route is live.
  const oldDbg = `\\npinch \${ratio.toFixed(2)} \${cur.pinched ? "CLOSED" : "open"}`;
  const newDbg = `\\npinch \${ratio.toFixed(2)} \${cur.pinched ? "CLOSED" : "open"}\${compactPinch ? " COMPACT" : ""}`;
  if (html.includes(oldDbg)) html = html.replace(oldDbg, newDbg);

  return html;
}

module.exports = async (req, res) => {
  try {
    const [html0, ...parts] = await Promise.all([
      fetchText(UPSTREAM),
      fetchText(PART_BASE+'part1.txt'),
      fetchText(PART_BASE+'part2.txt'),
      fetchText(PART_BASE+'part3.txt'),
      fetchText(PART_BASE+'part4.txt'),
      fetchText(PART_BASE+'part5.txt')
    ]);

    let html = tuneCompactPinch(html0);
    const addon = parts.join('');
    const needle = 'if (ROLE === "render") {';
    if (!html.includes(needle))
      throw new Error('Barehands injection point not found');

    html = html.replace(
      needle,
      `\n// ---- AELIA EXPERIENCE EDITION: functionality/visual layer only ----\n${addon}\n\n${needle}`
    );

    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.status(200).send(html);
  } catch(e) {
    console.error(e);
    res.status(500).send(`AELIA Experience stage error: ${e.message}`);
  }
};
