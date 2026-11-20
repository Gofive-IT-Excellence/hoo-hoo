/* Audit OCR text in small contextual batches, preserving coverage and source occurrences. */
(function (root) {
  'use strict';
  const compact = value => String(value || '').normalize('NFC').replace(/\s/g, '');
  const validBox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) &&
    b[0] >= 0 && b[1] >= 0 && b[2] <= 1000 && b[3] <= 1000 && b[2] > b[0] && b[3] > b[1];

  function plan(payload) {
    const rows = payload.regions.map((region, index) => ({...region, index}));
    const eligible = rows.filter(row => compact(row.text) && validBox(row.bbox));
    const batches = [];
    let batch = [], chars = 0;
    for (const row of eligible) {
      if (batch.length && (batch.length >= 6 || chars + row.text.length > 900)) {
        batches.push(batch); batch = []; chars = 0;
      }
      batch.push(row); chars += row.text.length;
    }
    if (batch.length) batches.push(batch);
    return {rows, batches};
  }

  function parse(result, rows) {
    if (Array.isArray(result)) result = result[0];
    if (result && Array.isArray(result.lines)) {
      const corrections = [], checked = [];
      const counts = new Map();
      for (const row of result.lines) counts.set(row?.id, (counts.get(row?.id) || 0) + 1);
      for (const line of result.lines) {
        const row = rows.find(row => row.index === line?.id);
        if (!row || counts.get(line.id) !== 1 || !Array.isArray(line.corrections)) continue;
        let valid = true;
        const accepted = [];
        for (const correction of line.corrections) {
          const {wrong, correct} = correction || {};
          if (typeof wrong !== 'string' || typeof correct !== 'string' || !wrong || !correct ||
              !row.text.includes(wrong) || wrong.length > 100 || correct.length > 100) { valid = false; continue; }
          if (compact(wrong) !== compact(correct)) accepted.push({wrong, correct, indices: [row.index]});
        }
        if (valid) { checked.push(row.index); corrections.push(...accepted); }
      }
      return {corrections, checked};
    }
    if (!result || typeof result.html !== 'string') throw Error('บริการไม่ส่งผลตรวจกลับมา');
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const corrections = [];
    for (const li of doc.querySelectorAll('.correction-panel li')) {
      const wrong = li.querySelector('mark')?.textContent.trim();
      const correct = li.querySelector('b')?.textContent.trim();
      if (!wrong || !correct || compact(wrong) === compact(correct)) continue;
      // A model cannot invent a source word or place a crop's correction elsewhere.
      const indices = rows.filter(row => compact(row.text).includes(compact(wrong))).map(row => row.index);
      if (indices.length) corrections.push({wrong, correct, indices});
    }
    const coverage = result.lineCoverage;
    const unchecked = coverage?.unchecked;
    const trusted = coverage?.total === rows.length && Array.isArray(unchecked) &&
      unchecked.every(i => Number.isInteger(i) && i >= 0 && i < rows.length) &&
      new Set(unchecked).size === unchecked.length &&
      coverage.checked === rows.length - unchecked.length;
    // A successful HTTP request is not evidence that every line was checked.
    const checked = trusted ? rows.filter((row, i) => !unchecked.includes(i)).map(row => row.index) : [];
    return {corrections, checked};
  }

  async function audit(payload, request, {signal, onProgress = () => {}} = {}) {
    const {rows, batches} = plan(payload);
    const checked = new Set(), corrections = new Map();
    const failures = [];
    let completed = 0;
    async function submit(batch) {
      signal?.throwIfAborted();
      try {
        const result = parse(await request(batch), batch);
        for (const index of result.checked) checked.add(index);
        for (const correction of result.corrections) {
          const key = JSON.stringify([correction.wrong, correction.correct, correction.indices]);
          corrections.set(key, correction);
        }
      } catch (error) {
        signal?.throwIfAborted();
        failures.push(String(error.message || error));
      }
      onProgress({checked: checked.size, total: rows.length, completed: ++completed});
    }
    async function pool(queue) {
      let cursor = 0;
      await Promise.all(Array.from({length: Math.min(2, queue.length)}, async () => {
        while (cursor < queue.length) await submit(queue[cursor++]);
      }));
    }
    await pool(batches);
    // Retry missing coverage once in smaller groups; never silently mark it complete.
    const pending = rows.filter(row => !checked.has(row.index) && validBox(row.bbox) && compact(row.text));
    const retries = [];
    for (let i = 0; i < pending.length; i += 3) retries.push(pending.slice(i, i + 3));
    await pool(retries);
    return {corrections: [...corrections.values()], total: rows.length,
      checked: checked.size, unchecked: rows.filter(row => !checked.has(row.index)).map(row => row.index), failures};
  }

  function render(report, imageUrl) {
    const doc = new DOMParser().parseFromString('<!doctype html><html><head></head><body></body></html>', 'text/html');
    const style = doc.createElement('style');
    style.textContent = 'body{font:16px Arial,Tahoma,sans-serif;margin:0;padding:12px;color:#172033}.wrapper{position:relative;container-type:inline-size;line-height:0}.wrapper img{display:block;width:100%;height:auto}.correction-panel{margin-top:16px}';
    doc.head.append(style);
    const coverage = doc.createElement('p');
    coverage.textContent = 'AI ตรวจได้ชัด ' + report.checked + ' จาก ' + report.total + ' บรรทัด';
    const wrapper = doc.createElement('div'); wrapper.className = 'wrapper';
    const image = doc.createElement('img'); image.src = imageUrl; wrapper.append(image);
    const panel = doc.createElement('section'); panel.className = 'correction-panel';
    const heading = doc.createElement('h3'); heading.textContent = 'คำแนะนำที่ต้องตรวจทาน';
    const list = doc.createElement('ul');
    for (const correction of report.corrections) {
      const li = doc.createElement('li'), mark = doc.createElement('mark'), bold = doc.createElement('b');
      li.dataset.ocrRegionIndices = JSON.stringify(correction.indices);
      mark.textContent = correction.wrong; bold.textContent = correction.correct;
      li.append(mark, doc.createTextNode(' → '), bold); list.append(li);
    }
    panel.append(heading, list); doc.body.append(coverage, wrapper, panel);
    return {html: '<!doctype html>' + doc.documentElement.outerHTML,
      incomplete: report.checked !== report.total,
      lineCoverage: {total: report.total, checked: report.checked, unchecked: report.unchecked}};
  }

  async function run(file, payload, {signal, onProgress} = {}) {
    const request = async rows => {
      signal?.throwIfAborted();
      const response = await fetch('/proofread', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({lines: rows.map(row => ({id: row.index, text: row.text}))}),
        signal: AbortSignal.any([signal, AbortSignal.timeout(150_000)].filter(Boolean)),
      });
      if (!response.ok) throw Error('บริการตรวจคำผิด HTTP ' + response.status);
      return response.json();
    };
    const report = await audit(payload, request, {signal, onProgress});
    signal?.throwIfAborted();
    const imageUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
    });
    return render(report, imageUrl);
  }
  const api = {plan, parse, audit, render, run};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HooHooImageAudit = api;
})(typeof window === 'undefined' ? globalThis : window);
