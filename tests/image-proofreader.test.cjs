const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
global.DOMParser = new JSDOM('').window.DOMParser;
const audit = require('../image-proofreader.js');
const locator = require('../ocr-word-locator-v2.js');

const row = (text, i) => ({text, bbox: [10, 10 + i * 40, 800, 40 + i * 40]});
const response = (rows, unchecked = [], items = '') => ({
  html: '<div class="correction-panel"><ul>' + items + '</ul></div>',
  lineCoverage: {total: rows.length, checked: rows.length - unchecked.length, unchecked},
});
const suggestion = (wrong, correct) => '<li><mark>' + wrong + '</mark> → <b>' + correct + '</b></li>';

test('every source region is planned once, including headings and footer text', () => {
  const payload = {regions: Array.from({length: 14}, (_, i) => row('ข้อความ ' + i, i))};
  const plan = audit.plan(payload);
  assert.deepEqual(plan.batches.map(b => b.length), [6, 6, 2]);
  assert.deepEqual(plan.batches.flat().map(r => r.index), Array.from({length: 14}, (_, i) => i));
});

test('partial coverage retries only unchecked source regions, and deduplicates suggestions', async () => {
  const payload = {regions: [row('รับสมัครพนักงนใหม่', 0), row('กำหนดกาน', 1), row('ข้อมูลถูกต้อง', 2)]};
  const calls = [];
  const report = await audit.audit(payload, async rows => {
    calls.push(rows.map(r => r.index));
    return calls.length === 1
      ? response(rows, [1], suggestion('พนักงน', 'พนักงาน'))
      : response(rows, [], suggestion('กำหนดกาน', 'กำหนดการ'));
  });
  assert.deepEqual(calls, [[0, 1, 2], [1]]);
  assert.equal(report.checked, 3);
  assert.equal(report.corrections.length, 2);
});

test('failed requests and absent coverage never turn into a clean result', async () => {
  let requests = 0;
  const report = await audit.audit({regions: [row('ตัวอย่าง', 0)]}, async () => {
    requests++;
    throw Error('service unavailable');
  });
  assert.equal(requests, 2);
  assert.equal(report.checked, 0);
  assert.deepEqual(report.unchecked, [0]);
  assert.equal(audit.render(report, 'test.png').incomplete, true);
  assert.deepEqual(audit.parse({html: '<div></div>'}, [row('ตัวอย่าง', 0)]).checked, []);
});

test('malformed coverage and invented or unchanged model corrections are rejected', () => {
  const rows = [{...row('พนักงน', 0), index: 7}];
  const result = response(rows, [], suggestion('ไม่มีในภาพ', 'ข้อมูล') + suggestion('พนักงน', 'พนักงน'));
  result.lineCoverage.unchecked = [-1];
  assert.deepEqual(audit.parse(result, rows), {corrections: [], checked: []});
});

test('cancellation stops audits instead of returning incomplete work as success', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(audit.audit({regions: [row('ตัวอย่าง', 0)]}, async () => {
    assert.fail('aborted work must not send requests');
  }, {signal: controller.signal}), {name: 'AbortError'});
});

function region(text, y) {
  return {text, box: [10, y, 10 + text.length * 12, y + 20],
    characters: Array.from(text).map((value, i) => ({start: i, end: i + 1,
      box: [10 + i * 12, y, 22 + i * 12, y + 20]}))};
}

test('a novel AI spelling correction is shown without adding it to the spelling dictionary', () => {
  const report = {total: 1, checked: 1, unchecked: [],
    corrections: [{wrong: 'พนักงน', correct: 'พนักงาน', indices: [0]}]};
  assert.equal(locator.canMark('พนักงน', 'พนักงาน', 'พนักงนใหม่'), false);
  const output = locator.reanchor(audit.render(report, 'test.png').html,
    {width: 500, height: 200, lines: [], paddleRegions: [region('พนักงนใหม่', 10)]});
  assert.equal(output.reviewCount, 1);
  assert.equal(output.located, 1);
  assert.equal(output.unlocated, 0);
});

test('correction provenance prevents marking the same OCR token at another occurrence', () => {
  const report = {total: 2, checked: 2, unchecked: [],
    corrections: [{wrong: 'พนักงน', correct: 'พนักงาน', indices: [1]}]};
  const output = locator.reanchor(audit.render(report, 'test.png').html,
    {width: 500, height: 200, lines: [], paddleRegions: [region('พนักงน', 10), region('พนักงน', 100)]});
  assert.equal(output.located, 1);
  const doc = new DOMParser().parseFromString(output.html, 'text/html');
  const line = doc.querySelector('.paddle-region-review');
  assert.ok(line);
  assert.ok(parseFloat(line.style.top) >= 50, 'only the second occurrence may be struck');
});

test('line-level model results preserve occurrence IDs and reject hallucinated source words', () => {
  const rows = [{...row('พนักงนใหม่', 0), index: 12}, {...row('ข้อความถูก', 1), index: 18}];
  const parsed = audit.parse({lines: [
    {id: 12, corrections: [{wrong: 'พนักงน', correct: 'พนักงาน'}]},
    {id: 18, corrections: [{wrong: 'ไม่มีในเอกสาร', correct: 'คำใหม่'}]},
  ]}, rows);
  assert.deepEqual(parsed.checked, [12]);
  assert.deepEqual(parsed.corrections, [{wrong: 'พนักงน', correct: 'พนักงาน', indices: [12]}]);
});

test('duplicate result IDs are not accepted as checked coverage', () => {
  const rows = [{...row('ข้อความถูก', 0), index: 2}];
  assert.deepEqual(audit.parse({lines: [{id: 2, corrections: []}, {id: 2, corrections: []}]}, rows).checked, []);
});

test('contextual audits retry omitted lines with their original IDs', async () => {
  const calls = [];
  const report = await audit.audit({regions: [row('พนักงน', 0), row('ข้อมูล', 1)]}, async rows => {
    calls.push(rows.map(r => r.index));
    return {lines: calls.length === 1 ? [{id: 0, corrections: [{wrong: 'พนักงน', correct: 'พนักงาน'}]}]
      : [{id: 1, corrections: []}]};
  });
  assert.deepEqual(calls, [[0, 1], [1]]);
  assert.equal(report.checked, 2);
});

test('benchmark typos are not supplied by the known-typo dictionary', () => {
  for (const row of require('./fixtures/new-work.json').filter(row => row.wrong)) {
    assert.equal(locator.canMark(row.wrong, row.correct, row.text), false, row.wrong);
  }
});

test('correct Thai connective ที่ is preserved, even when a model proposes ล่ะ', () => {
  const text = 'ข้อมูลส่วนบุคคลที่เก็บรวบรวม';
  for (const c of [{wrong: 'ที่', correct: 'ล่ะ'},
                   {wrong: text, correct: 'ข้อมูลส่วนบุคคลล่ะเก็บรวบรวม'}]) {
    const report = {total: 1, checked: 1, unchecked: [], corrections: [{...c, indices: [0]}]};
    const output = locator.reanchor(audit.render(report, 'test.png').html,
      {width: 500, height: 200, lines: [], paddleRegions: [region(text, 10)]});
    assert.equal(output.reviewCount, 0);
    assert.equal(output.located, 0);
  }
});

test('genuinely misspelled connective ไห้ can still be corrected to ให้', () => {
  const report = {total: 1, checked: 1, unchecked: [], corrections: [{wrong: 'ไห้', correct: 'ให้', indices: [0]}]};
  const output = locator.reanchor(audit.render(report, 'test.png').html,
    {width: 500, height: 200, lines: [], paddleRegions: [region('ไห้ข้อมูล', 10)]});
  assert.equal(output.reviewCount, 1);
  assert.equal(output.located, 1);
});

test('สินเชื่อ appears once when two OCR readings refer to the same printed word', () => {
  const primaryText = 'ประกันสนเชื่อเช่าซื้อ';
  const paddle = region('ประกันสนเซีือเช่าซื้อ',10);
  const primary = region(primaryText,10);
  const report = {total: 1, checked: 1, unchecked: [], corrections: [
    {wrong: 'สนเชื่อ', correct: 'สินเชื่อ', indices: [0]},
    {wrong: 'สนเซีือ', correct: 'สินเชื่อ', indices: [0]},
  ]};
  const output = locator.reanchor(audit.render(report,'test.png').html, {
    width: 500, height: 200, paddleRegions: [paddle],
    lines: [{text: primaryText, confidence: 95, glyphs: primary.characters}],
  });
  const doc = new DOMParser().parseFromString(output.html,'text/html');
  assert.equal(output.reviewCount,1);
  assert.equal(output.located,1);
  assert.equal(doc.querySelectorAll('.verified-spelling-correction,.review-spelling-correction').length,1);
  assert.equal(doc.querySelectorAll('.correction-panel li').length,1);
});

test('identical replacement words at different source positions are retained', () => {
  const text = 'ประกันสนเชื่อเช่าซื้อ';
  const report = {total: 2, checked: 2, unchecked: [], corrections: [
    {wrong: 'สนเชื่อ', correct: 'สินเชื่อ', indices: [0]},
    {wrong: 'สนเชื่อ', correct: 'สินเชื่อ', indices: [1]},
  ]};
  const output = locator.reanchor(audit.render(report,'test.png').html, {
    width: 500, height: 200, lines: [], paddleRegions: [region(text,10),region(text,100)],
  });
  assert.equal(output.reviewCount,2);
  assert.equal(output.located,2);
});

test('ได้ is not marked by matching ได before its existing tone mark', () => {
  const report = {total: 1, checked: 1, unchecked: [], corrections: [{wrong: 'ได', correct: 'ได้', indices: [0]}]};
  const output = locator.reanchor(audit.render(report,'test.png').html, {
    width:500,height:200,lines:[],paddleRegions:[region('ได้เลย',10)]
  });
  assert.equal(output.located,0);
  assert.equal(output.reviewCount,0);
  const parsed = audit.parse({lines:[{id:0,corrections:[{wrong:'ได',correct:'ได้'}]}]},
    [{...row('ได้เลย',0),index:0}]);
  assert.deepEqual(parsed.corrections,[]);
});

test('a genuinely missing tone mark remains eligible for correction', () => {
  const parsed = audit.parse({lines:[{id:0,corrections:[{wrong:'ได',correct:'ได้'}]}]},
    [{...row('ไดเลย',0),index:0}]);
  assert.equal(parsed.corrections.length,1);
});

test('local model batches never overlap when one document has many regions', async () => {
  let active = 0, peak = 0;
  const result = await audit.audit({regions:Array.from({length:14}, (_,i)=>row('ข้อมูล '+i,i))}, async rows => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve=>setImmediate(resolve));
    active--;
    return {lines:rows.map(row=>({id:row.index, corrections:[]}))};
  });
  assert.equal(peak, 1);
  assert.equal(result.checked, 14);
});

test('document audits use only local extraction and proofreading and escape source HTML', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(url);
    if (url === '/document/text') return {ok:true,json:async()=>({text:'ข้อมูล <script>bad()</script>',regions:[row('ข้อมูล <script>bad()</script>',0)]})};
    assert.equal(url, '/proofread');
    const {lines} = JSON.parse(options.body);
    return {ok:true,status:200,json:async()=>({lines:lines.map(line=>({id:line.id,corrections:[]}))})};
  };
  try {
    const result = await audit.runDocument(new File(['ข้อมูล'], 'test.txt'));
    assert.deepEqual(calls, ['/document/text','/proofread']);
    assert.equal(result.incomplete, false);
    const doc = new DOMParser().parseFromString(result.html,'text/html');
    assert.equal(doc.querySelectorAll('script').length,0);
    assert.equal(doc.querySelector('pre').textContent,'ข้อมูล <script>bad()</script>');
  } finally { global.fetch = originalFetch; }
});
