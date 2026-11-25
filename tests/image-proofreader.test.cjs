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
  assert.deepEqual(plan.batches.map(b => b.length), [3, 3, 3, 3, 2]);
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


test('sentence corrections strike only the edited word, with exact character coordinates', () => {
  const wrong = 'การให้บริการหลังการขาย การแจ้งเตือนกิจกรรมส่งเสิมการขาย';
  const correct = 'การให้บริการหลังการขาย การแจ้งเตือนกิจกรรมส่งเสริมการขาย';
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong,correct,indices:[0]}]};
  const span = locator.correctionWordSpan(wrong,correct);
  assert.deepEqual(span,{wrong:'เสิม',correct:'เสริม'});
  const output = locator.reanchor(audit.render(report,'test.png').html,
    {width:1000,height:200,lines:[],paddleRegions:[region(wrong,10)]});
  assert.equal(output.located,1);
  const doc = new DOMParser().parseFromString(output.html,'text/html');
  const mark = doc.querySelector('.paddle-region-review');
  const start = wrong.indexOf('เสิม');
  assert.ok(Math.abs(parseFloat(mark.style.left)-(10+start*12)/10)<1e-8);
  assert.equal(parseFloat(mark.style.width),'เสิม'.length*12/10);
  assert.equal(doc.querySelector('.review-spelling-correction').textContent,'→ เสริม');
  assert.equal(doc.querySelector('.correction-panel mark').textContent,'เสิม');
});

test('word spans retain complete Thai tones and missing vowels without neighbouring words', () => {
  for (const [wrong,correct,expected] of [
    ['บริษัทเปิดรับสมัครพนักงนใหม่','บริษัทเปิดรับสมัครพนักงานใหม่',{wrong:'พนักงน',correct:'พนักงาน'}],
    ['แตละทีมมี','แต่ละทีมมี',{wrong:'แตละ',correct:'แต่ละ'}],
    ['ชวงนี้','ช่วงนี้',{wrong:'ชวง',correct:'ช่วง'}],
    ['ฟร!','ฟรี!',{wrong:'ฟร!',correct:'ฟรี!'}],
    ['คำว่า Source Code','คำว่า Source code',{wrong:'Code',correct:'code'}],
  ]) assert.deepEqual(locator.correctionWordSpan(wrong,correct),expected);
});

test('multiword rewrites remain in review without striking a sentence', () => {
  const wrong = 'ข้อมูลบริษัทไหลออกไป', correct = 'เอกสารองค์กรหลุดออกไป';
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong,correct,indices:[0]}]};
  const output = locator.reanchor(audit.render(report,'test.png').html,
    {width:1000,height:200,lines:[],paddleRegions:[region(wrong,10)]});
  assert.equal(output.located,0);
  assert.equal(output.unlocated,1);
  const doc = new DOMParser().parseFromString(output.html,'text/html');
  assert.equal(doc.querySelectorAll('.verified-spelling-mark,.review-spelling-mark').length,0);
  assert.equal(doc.querySelectorAll('.correction-panel li').length,1);
});

test('an independent correct OCR reading suppresses an erroneous suggestion at the same word', () => {
  const wrong = 'บริษัทรับสมัครพนักงนใหม่', correct = 'บริษัทรับสมัครพนักงานใหม่';
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong,correct,indices:[0]}]};
  const read = region(correct,10);
  // Align the independent reading with the primary OCR character boxes.
  const printed = region(wrong,10);
  const start = correct.indexOf('พนักงาน');
  const oldStart = wrong.indexOf('พนักงน');
  for (let i=start;i<start+'พนักงาน'.length;i++) {
    read.characters[i].box=[10+oldStart*12+(i-start)*72/7,10,10+oldStart*12+(i-start+1)*72/7,30];
  }
  const output = locator.reanchor(audit.render(report,'test.png').html,
    {width:1000,height:200,paddleRegions:[printed],lines:[{text:correct,confidence:95,glyphs:read.characters}]});
  assert.equal(output.located,0);
  assert.equal(output.reviewCount,0);
});


test('correct Source Code is never shortened to Sourc or changed for case styling', () => {
  for (const [wrong,correct,text] of [
    ['Source','Sourc','Source Code'],
    ['Source Code','Sourc Code','Source Code'],
    ['Code','code','Source Code'],
    ['Sourc','Source','Source Code'],
    ['Sourc','Source','SourceCode'],
  ]) {
    const report = {total:1,checked:1,unchecked:[],corrections:[{wrong,correct,indices:[0]}]};
    const output = locator.reanchor(audit.render(report,'test.png').html,
      {width:500,height:200,lines:[],paddleRegions:[region(text,10)]});
    assert.equal(output.reviewCount,0,wrong+' → '+correct);
    assert.equal(output.located,0);
  }
});

test('an unconfirmed Latin OCR reading stays in review without striking the image', () => {
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong:'Sorce',correct:'Source',indices:[0]}]};
  const output = locator.reanchor(audit.render(report,'test.png').html,
    {width:500,height:200,lines:[],paddleRegions:[region('Sorce Code',10)]});
  assert.equal(output.reviewCount,1);
  assert.equal(output.located,0);
  assert.equal(output.unlocated,1);
});

test('a genuine Latin typo confirmed at the same ink can still be marked', () => {
  const text = 'Sorce Code', read = region(text,10);
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong:'Sorce',correct:'Source',indices:[0]}]};
  const output = locator.reanchor(audit.render(report,'test.png').html, {
    width:500,height:200,paddleRegions:[read],lines:[],
    validationLines:[{text,confidence:95,glyphs:read.characters}],
  });
  assert.equal(output.reviewCount,1);
  assert.equal(output.located,1);
});

test('a correct English word read independently overrides a mistaken primary OCR token', () => {
  const primary = region('Sorce Code',10), alternate = region('Source Code',10);
  alternate.characters.slice(0,6).forEach((g,i)=>{g.box=[10+i*10,10,20+i*10,30];});
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong:'Sorce',correct:'Source',indices:[0]}]};
  const output = locator.reanchor(audit.render(report,'test.png').html, {
    width:500,height:200,paddleRegions:[primary],lines:[],
    validationLines:[{text:alternate.text,confidence:95,glyphs:alternate.characters}],
  });
  assert.equal(output.reviewCount,0);
  assert.equal(output.located,0);
});


test('Google Vids product name survives model attempts to singularise Vids', () => {
  for (const text of ['Google Vids','Goegle Vids']) {
    const report = {total:1,checked:1,unchecked:[],corrections:[{wrong:'Vids',correct:'Vid',indices:[0]}]};
    const output = locator.reanchor(audit.render(report,'test.png').html,
      {width:500,height:200,lines:[],paddleRegions:[region(text,10)]});
    const doc = new DOMParser().parseFromString(output.html,'text/html');
    assert.ok(![...doc.querySelectorAll('.correction-panel mark')].some(mark=>mark.textContent==='Vids'));
    if(text==='Google Vids') assert.equal(output.reviewCount,0);
  }
});


test('repetition mark and spacing style never become spelling corrections or image strikes', () => {
  for (const [wrong,correct] of [
    ['อื่นๆ','อื่น ๆ'], ['อื่น','อื่นๆ'], ['อื่นๆ','อื่น'],
    ['ต่างๆ','ต่าง ๆ'], ['มาก','มากๆ'],
    ['ข้อมูลส่วนบุคคลอื่นๆ','ข้อมูลส่วนบุคคลอื่น ๆ'],
  ]) {
    const text = 'ข้อมูลส่วนบุคคล'+wrong;
    const rows = [{...row(text,0),index:0}];
    const parsed = audit.parse({lines:[{id:0,corrections:[{wrong,correct}]}]},rows);
    assert.deepEqual(parsed.corrections,[],wrong+' → '+correct);
    assert.deepEqual(parsed.checked,[0]);
    const report = {total:1,checked:1,unchecked:[],corrections:[{wrong,correct,indices:[0]}]};
    const output = locator.reanchor(audit.render(report,'test.png').html,
      {width:1000,height:200,lines:[],paddleRegions:[region(text,10)]});
    assert.equal(output.reviewCount,0);
    assert.equal(output.located,0);
    assert.deepEqual(audit.parse(response(rows,[],suggestion(wrong,correct)),rows).corrections,[]);
  }
});

test('real Thai spelling errors next to a repetition mark remain eligible', () => {
  const rows = [{...row('อืนๆ',0),index:0}];
  assert.deepEqual(audit.parse({lines:[{id:0,corrections:[{wrong:'อืนๆ',correct:'อื่นๆ'}]}]},rows).corrections,
    [{wrong:'อืนๆ',correct:'อื่นๆ',indices:[0]}]);
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong:'อืนๆ',correct:'อื่นๆ',indices:[0]}]};
  const output = locator.reanchor(audit.render(report,'test.png').html,
    {width:500,height:200,lines:[],paddleRegions:[region('อืนๆ',10)]});
  assert.equal(output.located,1);
});


test('a coordinate-matched crop reading of อื่นๆ suppresses the false OCR อืนๆ suggestion', () => {
  const primary = region('ข้อมูลอื่นๆ',10);
  // The first reading omits only mai-ek. A crop reading restores that printed mark.
  const bad = region('ข้อมูลอืนๆ',10);
  const goodStart = primary.text.indexOf('อื่นๆ'), badStart = bad.text.indexOf('อืนๆ');
  const width = 'อืนๆ'.length*12;
  primary.characters.slice(goodStart).forEach((g,i)=>{g.box=[10+badStart*12+i*width/5,10,10+badStart*12+(i+1)*width/5,30];});
  const report = {total:1,checked:1,unchecked:[],corrections:[{wrong:'อืนๆ',correct:'อื่นๆ',indices:[0]}]};
  const output = locator.reanchor(audit.render(report,'test.png').html, {
    width:500,height:200,lines:[],paddleRegions:[bad],
    validationLines:[{text:primary.text,confidence:95,glyphs:primary.characters}],
  });
  assert.equal(output.reviewCount,0);
  assert.equal(output.located,0);
});


test('tone recheck includes ink above first-pass OCR body boxes and maps the correct reading back', async () => {
  const previous = global.document;
  let crop;
  global.document = {createElement:()=>({width:0,height:0,getContext:()=>({drawImage:(_canvas,x,y,w,h)=>{crop=[x,y,x+w,y+h];}})})};
  const text='อนๆ';
  const source={text,confidence:94,glyphs:[
    {start:0,end:1,box:[651,1198,669,1222]},
    {start:1,end:2,box:[673,1198,692,1222]},
    {start:2,end:3,box:[699,1198,716,1237]},
  ]};
  const worker={setParameters:async()=>{},recognize:async()=>({data:{blocks:[{paragraphs:[{lines:[{confidence:91,words:[{symbols:Array.from('อื่นๆ').map((text,i)=>({text,bbox:{x0:i*20,y0:10,x1:i*20+19,y1:50}}))}]}]}]}]}})};
  try {
    const result=await locator.refineThaiMarks(worker,{width:2482,height:3509},[source]);
    assert.ok(crop[1]<=1177,'crop must include the existing upper mark at y=1177, not cut it off');
    assert.equal(result.validationLines[0].text,'อื่นๆ');
    assert.equal(result.validationLines[0].confidence,91);
    assert.ok(result.validationLines[0].glyphs[0].box[1]>=crop[1]);
    assert.deepEqual(result.confirmed,['อื่นๆ']);
  } finally {global.document=previous;}
});


test('equivalent composed and decomposed sara am are not spelling errors', () => {
  for (const [wrong,correct] of [['การนํา','การนำ'],['การนำ','การนํา']]) {
    const rows=[{...row(wrong,0),index:0}];
    assert.deepEqual(audit.parse({lines:[{id:0,corrections:[{wrong,correct}]}]},rows).corrections,[]);
    const report={total:1,checked:1,unchecked:[],corrections:[{wrong,correct,indices:[0]}]};
    const output=locator.reanchor(audit.render(report,'test.png').html,
      {width:500,height:200,lines:[],paddleRegions:[region(wrong,10)]});
    assert.equal(output.reviewCount,0);
    assert.equal(output.located,0);
  }
});

test('correct การนำ read as การนํา suppresses the OCR การน้ำ suggestion at the same ink', () => {
  const primary=region('การนําเสนอ',10);
  const report={total:1,checked:1,unchecked:[],corrections:[{wrong:'การน้ำ',correct:'การนำ',indices:[0]}]};
  const output=locator.reanchor(audit.render(report,'test.png').html,{
    width:500,height:200,paddleRegions:[region('การน้ำเสนอ',10)],
    lines:[{text:primary.text,confidence:92,glyphs:primary.characters}],
  });
  assert.equal(output.reviewCount,0);
  assert.equal(output.located,0);
});

test('sara am reading matches retain source offsets when one glyph expands into two characters', () => {
  const primary=region('การนำเสนอ',10);
  const report={total:1,checked:1,unchecked:[],corrections:[{wrong:'การน้ำ',correct:'การนํา',indices:[0]}]};
  const output=locator.reanchor(audit.render(report,'test.png').html,{
    width:500,height:200,paddleRegions:[region('การน้ำเสนอ',10)],
    lines:[{text:primary.text,confidence:92,glyphs:primary.characters}],
  });
  assert.equal(output.reviewCount,0);
  assert.equal(output.located,0);
});

test('a correct การนำ at a different location cannot suppress a genuine การน้ำ typo', () => {
  const primary=region('การนําเสนอ',10);
  const report={total:2,checked:2,unchecked:[],corrections:[{wrong:'การน้ำ',correct:'การนำ',indices:[1]}]};
  const output=locator.reanchor(audit.render(report,'test.png').html,{
    width:500,height:200,paddleRegions:[region('การน้ำเสนอ',10),region('การน้ำเสนอ',100)],
    lines:[{text:primary.text,confidence:92,glyphs:primary.characters}],
  });
  assert.equal(output.reviewCount,1);
  assert.equal(output.located,1);
  assert.notEqual(locator.correctionWordSpan('น้ำ','นำ'),null,'normalisation must preserve real tone differences');
});

test('scoped and dictionary flood suggestions share one ink location and southern spelling stays markable', () => {
  const text = 'ทวมภากไต้';
  const report = {total:1,checked:1,unchecked:[],corrections:[
    {wrong:'ทวม',correct:'ท่วม',indices:[0]},
    {wrong:'ทวม',correct:'ท่วม'},
    {wrong:'ภากไต้',correct:'ภาคใต้'},
  ]};
  const output = locator.reanchor(audit.render(report,'test.png').html.replaceAll(' data-ocr-region-indices="undefined"',''), {
    width:500,height:200,lines:[],paddleRegions:[region(text,40)],
  });
  const doc = new DOMParser().parseFromString(output.html,'text/html');
  assert.equal(doc.querySelectorAll('.review-spelling-correction,.verified-spelling-correction').length,2);
  assert.equal(output.located,2);
  assert.equal(output.unlocated,0);
  assert.equal(doc.querySelectorAll('.correction-panel li').length,2);
  assert.deepEqual(locator.correctionWordSpan('ภากไต้','ภาคใต้'),{wrong:'ภากไต้',correct:'ภาคใต้'});
});

test('rendering merges repeated OCR hits and scoped suggestions at the same printed ทวม', () => {
  const text='น้ำทวมภากไต้';
  const source=region(text,260);
  const glyphs=source.characters.map(g=>({text:text.slice(g.start,g.end),box:g.box}));
  const line={text,confidence:96,glyphs};
  const report={total:1,checked:1,unchecked:[],corrections:[{wrong:'น้ำทวม',correct:'น้ำท่วม',indices:[0]}]};
  const html=audit.render(report,'test.png').html.replace('</ul>',suggestion('ทวม','ท่วม')+'</ul>');
  const output=locator.reanchor(html,{width:928,height:514,lines:[line,{...line}],paddleRegions:[source]});
  const doc=new DOMParser().parseFromString(output.html,'text/html');
  const labels=[...doc.querySelectorAll('.verified-spelling-correction,.review-spelling-correction')];
  assert.equal(labels.filter(n=>n.textContent==='→ ท่วม').length,1);
  assert.equal(labels.filter(n=>n.textContent==='→ ภาคใต้').length,1);
  assert.equal(output.located,2);
  assert.equal(output.unlocated,0);
  assert.equal(doc.querySelectorAll('.correction-panel li').length,2);
});

test('render deduplication retains ท่วม labels at genuinely different positions', () => {
  const first=region('ทวม',30),second=region('ทวม',130);
  const line=r=>({text:r.text,confidence:96,glyphs:r.characters.map(g=>({text:r.text.slice(g.start,g.end),box:g.box}))});
  const report={total:2,checked:2,unchecked:[],corrections:[{wrong:'ทวม',correct:'ท่วม',indices:[0]},{wrong:'ทวม',correct:'ท่วม',indices:[1]}]};
  const output=locator.reanchor(audit.render(report,'test.png').html,{width:500,height:250,lines:[line(first),line(second)],paddleRegions:[first,second]});
  const doc=new DOMParser().parseFromString(output.html,'text/html');
  assert.equal(doc.querySelectorAll('.verified-spelling-correction,.review-spelling-correction').length,2);
  assert.equal(output.located,2);
});

test('รด inside สามารด cannot invent a separate รอด correction', () => {
  const report={total:1,checked:1,unchecked:[],corrections:[
    {wrong:'รด',correct:'รอด',indices:[0]},
    {wrong:'สามารด',correct:'สามารถ',indices:[0]},
  ]};
  const output=locator.reanchor(audit.render(report,'test.png').html,{
    width:500,height:200,lines:[],paddleRegions:[region('คณสามารด',30)]
  });
  const doc=new DOMParser().parseFromString(output.html,'text/html');
  assert.equal(doc.querySelectorAll('.correction-panel li').length,2);
  assert.ok([...doc.querySelectorAll('.correction-panel b')].some(n=>n.textContent==='สามารถ'));
  assert.equal(output.located,2);
  assert.equal(output.unlocated,0);
  assert.equal(doc.body.textContent.includes('รอด'),false);
});

test('nested-word filtering respects the source occurrence and preserves other novel corrections', () => {
  const report={total:2,checked:2,unchecked:[],corrections:[
    {wrong:'รด',correct:'รอด',indices:[0]},
    {wrong:'พนักงน',correct:'พนักงาน',indices:[1]},
  ]};
  const output=locator.reanchor(audit.render(report,'test.png').html,{
    width:500,height:200,lines:[],paddleRegions:[region('รด',30),region('สามารดพนักงน',100)]
  });
  assert.equal(output.reviewCount,3);
  assert.equal(output.located,3);
});

test('document text keeps original words, hides the list, and exposes corrections only on hover/focus', async () => {
  const originalFetch=global.fetch;
  global.fetch=async url=>url==='/document/text'
    ? {ok:true,json:async()=>({text:'พนักงน <script>\nพนักงน',regions:[row('พนักงน <script>',0),row('พนักงน',1)]})}
    : {ok:true,status:200,json:async()=>({lines:[{id:0,corrections:[{wrong:'พนักงน',correct:'พนักงาน'}]},{id:1,corrections:[]}]})};
  try {
    const result=await audit.runDocument(new File(['test'],'test.txt'));
    const doc=new DOMParser().parseFromString(result.html,'text/html');
    assert.equal(doc.querySelector('pre').textContent,'พนักงน <script>\nพนักงน');
    assert.equal(doc.querySelectorAll('.document-word').length,1);
    assert.equal(doc.querySelector('.document-word').title,'พนักงาน');
    assert.equal(doc.querySelector('.document-word').dataset.correction,'พนักงาน');
    assert.equal(doc.querySelectorAll('script').length,0);
    assert.match(doc.head.textContent,/\.correction-panel\{display:none!important\}/);
    assert.match(doc.head.textContent,/\.document-word:hover::after/);
    assert.equal(doc.querySelector('.correction-panel').style.getPropertyPriority('display'),'important');
    assert.equal(doc.querySelector('.correction-panel').style.display,'none');
  } finally {global.fetch=originalFetch;}
});

test('PDF document preview retains the page and renders red hover targets without permanent correction labels', async () => {
  const dom=new JSDOM('',{url:'https://example.test/'}),previousDocument=global.document;
  global.document=dom.window.document;
  const proto=dom.window.HTMLCanvasElement.prototype;
  proto.getContext=()=>({});proto.toBlob=fn=>fn(new Blob(['page']));proto.toDataURL=()=> 'data:image/png;base64,cGFnZQ==';
  let destroyed=false;
  const page={getViewport:()=>({width:500,height:200}),render:()=>({promise:Promise.resolve()}),cleanup:()=>{}};
  const pdfjs={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>page,destroy:async()=>{destroyed=true;}})})};
  const report={total:1,checked:1,unchecked:[],corrections:[{wrong:'พนักงน',correct:'พนักงาน',indices:[0]}]};
  const input=audit.render(report,'').html.replace('<mark>','<mark class="correction-wrong">').replace('<b>','<b class="correction-correct">').replace('</body>','<pre class="document-original-text">พนักงน</pre><div class="pdf-overlay-viewer"></div></body>');
  const text='พนักงน',r=region(text,30);
  const ocr={width:500,height:200,lines:[{text,confidence:96,glyphs:r.characters.map(g=>({...g,text:text.slice(g.start,g.end)}))}]};
  try {
    const result=await locator.annotatePdf(input,new File(['pdf'],'test.pdf'),()=>{},{hoverOnly:true,pdfjs,readPage:async()=>ocr});
    const doc=new DOMParser().parseFromString(result.html,'text/html');
    assert.equal(result.count,1);
    assert.equal(doc.querySelectorAll('.pdf-overlay-viewer img').length,1);
    assert.equal(doc.querySelector('.document-original-text'),null);
    assert.equal(doc.querySelectorAll('.verified-spelling-correction,.review-spelling-correction').length,0);
    const mark=doc.querySelector('.document-hover-mark');
    assert.equal(mark.title,'พนักงาน');assert.ok(parseFloat(mark.style.height)>0);
    assert.equal(mark.dataset.correction,'พนักงาน');assert.ok(destroyed);
    const fallback=await locator.annotatePdf(input,new File(['pdf'],'test.pdf'),()=>{},
      {hoverOnly:true,pdfjs,readPage:async()=>{throw Error('OCR unavailable');}});
    const fallbackDoc=new DOMParser().parseFromString(fallback.html,'text/html');
    assert.equal(fallbackDoc.querySelectorAll('.pdf-overlay-viewer img').length,1);
    assert.equal(fallbackDoc.querySelector('.document-original-text'),null);
    assert.match(fallbackDoc.body.textContent,/ยังยืนยันพิกัดคำไม่ได้/);

  } finally {global.document=previousDocument;}
});

test('PDF extraction always retains an original PDF viewer rather than a flattened text fallback', async () => {
  const originalFetch=global.fetch;
  global.fetch=async url=>url==='/document/text'
    ? {ok:true,json:async()=>({text:'ข้อความจาก OCR',regions:[row('ข้อความจาก OCR',0)]})}
    : {ok:true,status:200,json:async()=>({lines:[{id:0,corrections:[]}]})};
  try {
    const result=await audit.runDocument(new File(['%PDF-fixture'],'source.pdf',{type:'application/pdf'}));
    const doc=new DOMParser().parseFromString(result.html,'text/html');
    assert.equal(doc.querySelector('.document-original-text'),null);
    assert.equal(doc.querySelector('pre'),null);
    const pdf=doc.querySelector('.pdf-overlay-viewer object');
    assert.equal(pdf.type,'application/pdf');
    assert.equal(atob(pdf.getAttribute('data').split(',')[1]),'%PDF-fixture');
  } finally {global.fetch=originalFetch;}
});

test('จังหวัด is not highlighted merely to remove a trailing dot or form punctuation', () => {
  for (const [wrong,correct] of [['จังหวัด.','จังหวัด'],['วันที่..','วันที่:'],['ลงชื่อ...','ลงชื่อ.']]) {
    assert.equal(locator.correctionWordSpan(wrong,correct),null);
    const parsed=audit.parse({lines:[{id:0,corrections:[{wrong,correct}]}]},[{...row(wrong,0),index:0}]);
    assert.deepEqual(parsed.corrections,[]);
  }
  const parsed=audit.parse({lines:[{id:0,corrections:[{wrong:'จังหวด.',correct:'จังหวัด'}]}]},[{...row('จังหวด.',0),index:0}]);
  assert.equal(parsed.corrections.length,1);
  const html=audit.render({total:1,checked:1,unchecked:[],corrections:[{wrong:'จังหวัด.',correct:'จังหวัด',indices:[0]}]},'test.png').html.replace('<mark>','<mark class="correction-wrong">').replace('<b>','<b class="correction-correct">');
  const output=locator.reanchor(html,{width:500,height:200,lines:[],paddleRegions:[region('จังหวัด.',30)]});
  assert.equal(output.located,0);assert.equal(output.reviewCount,0);
});

test('correct address reading prevents mixed-script สาทR and partial กรุงเทพฯ corrections', () => {
  for (const alias of ['R','S']) {
    const primary=region('เขตสาท'+alias+' กรุงเทพฯ',30),printed=region('เขตสาทร กรุงเทพฯ',30);
    const report={total:1,checked:1,unchecked:[],corrections:[
      {wrong:'สาท'+alias,correct:'สาทส',indices:[0]},
      {wrong:'เทพฯ',correct:'เทวฯ',indices:[0]},
    ]};
    const output=locator.reanchor(audit.render(report,'test.png').html,{
      width:500,height:200,paddleRegions:[primary],
      lines:[{text:printed.text,confidence:95,glyphs:printed.characters}],
    });
    assert.equal(output.located,0);assert.equal(output.reviewCount,0);
  }
});

test('omitted invoice header and total typos are added from exact independent OCR glyphs', () => {
  const rows=[region('รายล่ะเอียดสินค้า / บริการ',30),region('จำนวนเงินทังหมด:',100)];
  const report={total:2,checked:2,unchecked:[],corrections:[]};
  const output=locator.reanchor(audit.render(report,'test.png').html,{
    width:800,height:200,paddleRegions:rows,
    lines:rows.map(r=>({text:r.text,confidence:95,glyphs:r.characters})),
  });
  const doc=new DOMParser().parseFromString(output.html,'text/html');
  const labels=[...doc.querySelectorAll('.verified-spelling-correction,.review-spelling-correction')].map(n=>n.textContent);
  assert.deepEqual(labels,['→ รายละเอียด','→ ทั้งหมด']);
  assert.equal(output.located,2);assert.equal(output.unlocated,0);
});

test('correct รายละเอียด and ทั้งหมด do not gain invoice spelling corrections', () => {
  const rows=[region('รายละเอียดสินค้า / บริการ',30),region('จำนวนเงินทั้งหมด:',100)];
  const out=locator.reanchor(audit.render({total:2,checked:2,unchecked:[],corrections:[]},'test.png').html,{
    width:800,height:200,paddleRegions:rows,lines:rows.map(r=>({text:r.text,confidence:95,glyphs:r.characters})),
  });
  assert.equal(out.located,0);assert.equal(out.reviewCount,0);
});


test('correct นามสกุล form label is never converted into a spelling correction', () => {
  for (const wrong of ['นามสกุล','นามสกุล.','...นามสกุล...']) {
    for (const correct of ['นานสกุล','นามสกุล:']) {
      assert.equal(locator.correctionWordSpan(wrong,correct),null);
      const rows=[{...row(wrong,0),index:0}];
      assert.deepEqual(audit.parse({lines:[{id:0,corrections:[{wrong,correct}]}]},rows).corrections,[]);
      assert.deepEqual(audit.parse(response(rows,[],suggestion(wrong,correct)),rows).corrections,[]);
    }
  }
  const wrong='นานสกุล',correct='นามสกุล';
  assert.deepEqual(locator.correctionWordSpan(wrong,correct),{wrong,correct});
  assert.equal(audit.parse({lines:[{id:0,corrections:[{wrong,correct}]}]},[{...row(wrong,0),index:0}]).corrections.length,1);
});
