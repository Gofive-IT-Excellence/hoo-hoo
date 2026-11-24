// Synthetic OCR comparison; no customer files or credentials.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync:run}=require('node:child_process');
const root=process.env.HOOHOO_REPO || path.resolve(__dirname,'..');
const out=process.env.HOOHOO_BENCHMARK_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(),'hoo-ocr-comparison-')); 
const base=process.env.HOOHOO_TEST_BASE_URL || 'http://127.0.0.1:8080';
fs.mkdirSync(out,{recursive:true});
const fixtures=['Goegle Vids','Nano Banano','Ws','Google Vids','Nano Banana','Source Code'];
const image=path.join(out,'synthetic.png');
const gold=JSON.parse(run('python3',['-c',`
from PIL import Image,ImageDraw,ImageFont
import json,sys
texts=json.loads(sys.argv[1]);im=Image.new('RGB',(1100,650),'white');d=ImageDraw.Draw(im);f=ImageFont.truetype(sys.argv[2],46)
gold=[]
for i,text in enumerate(texts):
 x,y=40,30+i*100;d.text((x,y),text,font=f,fill='black');gold.append({'text':text,'box':list(d.textbbox((x,y),text,font=f))})
im.save(sys.argv[3]);print(json.dumps(gold))
`,JSON.stringify(fixtures),process.env.HOOHOO_TEST_FONT || '/System/Library/Fonts/Supplemental/Tahoma.ttf',image],{encoding:'utf8'}));
function request(route,body,name){if(process.env.HOOHOO_REPLAY_DIR){const dir=process.env.HOOHOO_REPLAY_DIR;const prior=JSON.parse(fs.readFileSync(path.join(dir,name+'-request.json')));if(JSON.stringify(prior)!==JSON.stringify(body))throw Error('Replay request differs: '+name);return {data:JSON.parse(fs.readFileSync(path.join(dir,name+'-response.json'))),seconds:null};}const input=path.join(out,name+'-request.json'),output=path.join(out,name+'-response.json');fs.writeFileSync(input,JSON.stringify(body));const t=Date.now();run('curl',['-fsS','--max-time','180','-H','Content-Type: application/json','--data-binary','@'+input,'-o',output,base+route]);return {data:JSON.parse(fs.readFileSync(output)),seconds:(Date.now()-t)/1000};}
const rect=pts=>[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];
const union=boxes=>[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
function distance(a,b){let r=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let n=[i];for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,r[j]+1,r[j-1]+(a[i-1]!==b[j-1]));r=n;}return r[b.length];}
const normal=t=>t.replace(/\s/g,'');
function metrics(rows){return gold.map(g=>{const hits=rows.filter(r=>Math.abs((r.box[1]+r.box[3]-g.box[1]-g.box[3])/2)<40).sort((a,b)=>a.box[0]-b.box[0]);const text=hits.map(r=>r.text).join(' ');let iou=0;if(hits.length){let b=union(hits.map(r=>r.box));const area=v=>(v[2]-v[0])*(v[3]-v[1]);const intersection=Math.max(0,Math.min(b[2],g.box[2])-Math.max(b[0],g.box[0]))*Math.max(0,Math.min(b[3],g.box[3])-Math.max(b[1],g.box[1]));iou=intersection/(area(b)+area(g.box)-intersection);}return {expected:g.text,read:text,exact:normal(text)===normal(g.text),characterErrors:distance(normal(text),normal(g.text)),bboxIoU:iou,missed:!hits.length};});}
if(process.env.HOOHOO_REPLAY_DIR) fs.copyFileSync(path.join(process.env.HOOHOO_REPLAY_DIR,'synthetic.png'),image);
const ocr=request('/ocr',{base64:fs.readFileSync(image).toString('base64')},'openthai');
const t=Date.now();const tsv=run(process.env.HOOHOO_TESSERACT || 'tesseract',[image,'stdout','-l','eng','--psm','6','tsv'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
fs.writeFileSync(path.join(out,'tesseract.tsv'),tsv);
const reference=tsv.split('\n').slice(1).map(line=>line.split('\t')).filter(p=>p[0]==='5'&&p[11]?.trim()).map(p=>({text:p[11],box:[+p[6],+p[7],+p[6]+ +p[8],+p[7]+ +p[9]]}));
const referenceSeconds=(Date.now()-t)/1000;
const {JSDOM}=require('jsdom');global.DOMParser=new JSDOM('').window.DOMParser;
const audit=require(path.join(root,'image-proofreader.js')),locator=require(path.join(root,'ocr-word-locator-v2.js'));
(async()=>{let batch=0;const regions=ocr.data.words.map(w=>({text:w.text,bbox:rect(w.box).map((v,i)=>v/(i%2?ocr.data.height:ocr.data.width)*1000)}));
const report=await audit.audit({regions},async rows=>request('/proofread',{lines:rows.map(r=>({id:r.index,text:r.text}))},'proofread-'+batch++).data);
const located=locator.reanchor(audit.render(report,'synthetic.png').html,{width:ocr.data.width,height:ocr.data.height,lines:[],paddleRegions:ocr.data.words.map(w=>({text:w.text,box:rect(w.box),characters:w.characters.map(c=>({...c,box:rect(c.box)}))}))});
fs.writeFileSync(path.join(out,'result.html'),located.html);
const doc=new DOMParser().parseFromString(located.html,'text/html');const suggestions=[...doc.querySelectorAll('.correction-panel li')].map(li=>({wrong:li.querySelector('mark')?.textContent,correct:li.querySelector('b')?.textContent,note:li.textContent}));
const correctControls=gold.slice(2).map(g=>g.text);
const falseCorrections=suggestions.filter(s=>correctControls.some(text=>normal(text).includes(normal(s.wrong||''))));
const result={date:new Date().toISOString(),base,replayedFrom:process.env.HOOHOO_REPLAY_DIR || null,fixture:'synthetic Latin labels; Ws is literal Latin, not Thai ฟรี',openthai:{seconds:ocr.seconds,rows:metrics(ocr.data.words.map(w=>({text:w.text,box:rect(w.box)})))},tesseractReference:{seconds:referenceSeconds,version:run(process.env.HOOHOO_TESSERACT||'tesseract',['--version'],{encoding:'utf8'}).split('\n')[0],note:'Reference only; not the previous PaddleOCR production engine',rows:metrics(reference)},proofreading:{checked:report.checked,total:report.total,unchecked:report.unchecked,suggestions,falseCorrections,located:located.located,unlocated:located.unlocated},previousProductionBaseline:null};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));console.log('Artifacts:',out);})().catch(e=>{console.error(e);process.exitCode=1});
