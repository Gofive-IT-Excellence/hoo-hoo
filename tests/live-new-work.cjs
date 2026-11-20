// Opt-in benchmark. Generates its own image; never accepts user documents.
// Requires Pillow and a Thai font. See tests/README.md.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict'), {execFileSync} = require('node:child_process');
const {JSDOM} = require('jsdom'); global.DOMParser = new JSDOM('').window.DOMParser;
const audit = require('../image-proofreader.js'), locator = require('../ocr-word-locator-v2.js');
const gold = require('./fixtures/new-work.json');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hoo-new-work-'));
const imagePath = path.join(directory, 'generated.png');
const base = process.env.HOOHOO_TEST_BASE_URL || 'http://127.0.0.1:5059';
const font = process.env.HOOHOO_TEST_FONT || '/System/Library/Fonts/Supplemental/Tahoma.ttf';
execFileSync(process.env.HOOHOO_TEST_PYTHON || 'python3', ['-c', `
from PIL import Image,ImageDraw,ImageFont
import json,sys
rows=json.loads(sys.argv[1]);image=Image.new('RGB',(1350,1250),'white')
draw=ImageDraw.Draw(image);font=ImageFont.truetype(sys.argv[2],38)
for i,row in enumerate(rows):draw.text((40,30+i*100),row['text'],font=font,fill='#172033')
image.save(sys.argv[3])
`, JSON.stringify(gold), font, imagePath]);
const rect = points => [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
  Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
(async () => {
  const form = new FormData(); form.append('fileA', new Blob([fs.readFileSync(imagePath)], {type: 'image/png'}), 'synthetic.png');
  const ocrResponse = await fetch(base + '/ocr', {method: 'POST', body: form, signal: AbortSignal.timeout(180000)});
  assert.ok(ocrResponse.ok, 'OCR request must succeed'); const raw = await ocrResponse.json();
  const payload = {version: 1, engine: 'paddleocr-th', width: raw.width, height: raw.height,
    regions: raw.words.map(w => ({text: w.text, bbox: rect(w.box).map((v, i) => Math.round(v / (i % 2 ? raw.height : raw.width) * 1000)), words: []}))};
  const report = await audit.audit(payload, async rows => {
    const response = await fetch(base + '/proofread', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({lines: rows.map(r => ({id: r.index, text: r.text}))}), signal: AbortSignal.timeout(150000)});
    if (!response.ok) throw Error('Proofreading HTTP ' + response.status);
    return response.json();
  }, {onProgress: p => console.log('coverage', p.checked + '/' + p.total)});
  const ocr = {width: raw.width, height: raw.height, lines: [], paddleRegions: raw.words.map(w => ({text: w.text, box: rect(w.box),
    characters: w.characters.map(c => ({...c, box: rect(c.box)}))}))};
  const output = locator.reanchor(audit.render(report, 'synthetic.png').html, ocr);
  const expected = gold.filter(row => row.wrong);
  const apply = (text, suggestions) => suggestions.reduce((value, c) => value.replace(c.wrong, c.correct), text);
  const found = expected.filter(row => {
    const index = raw.words.findIndex(w => w.text === row.text);
    const corrections = report.corrections.filter(c => c.indices.includes(index));
    return index >= 0 && apply(row.text, corrections) === row.text.replace(row.wrong, row.correct);
  });
  const falsePositives = report.corrections.filter(c => c.indices.some(index => {
    const original = raw.words[index]?.text;
    const target = gold.find(g => g.text === original);
    return !target?.wrong || apply(original, [c]) !== original.replace(target.wrong, target.correct);
  }));
  const summary = {expected: expected.length, found: found.length, missed: expected.filter(e => !found.includes(e)),
    falsePositives, coverage: {checked: report.checked, total: report.total}, located: output.located,
    unlocated: output.unlocated, corrections: report.corrections};
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2)); console.log('Artifacts:', directory);
  assert.equal(report.checked, report.total, 'all OCR regions must be accounted for');
  assert.equal(falsePositives.length, 0, 'correct text must not be changed');
  assert.equal(found.length, expected.length, 'novel typos must be found without dictionary entries');
  assert.equal(output.unlocated, 0, 'all corrections need actual source coordinates');
})().catch(error => {console.error(error); process.exitCode = 1;});
