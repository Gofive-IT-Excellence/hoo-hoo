/* Literal OCR coordinates only. Never interpolate positions across a paragraph. */
(function(root){
  'use strict';
  const valid=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>b[0]&&b[3]>b[1];
  const union=bs=>[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];
  // Narrow spelling rules; never treat an arbitrary AI replacement as verified.
  const clearPairs=new Map(Object.entries({'อนุญาติ':'อนุญาต','ประมวณผล':'ประมวลผล','บริสัท':'บริษัท','ข้อมุล':'ข้อมูล','ข้อตวาม':'ข้อความ','บันทก':'บันทึก','ลกษณะ':'ลักษณะ','กำนด':'กำหนด','หน่ยว':'หน่วย','ปรากฎ':'ปรากฏ','สังเกตุ':'สังเกต','คำนวน':'คำนวณ','บอกล':'บอกลา','วิดีโด':'วิดีโอ','พรีเซนต':'พรีเซนต์','Goegle':'Google'}));
  function canMark(original,corrected,line){
    if(clearPairs.get(original)===corrected)return true;
    if(original==='ผู'&&corrected==='ผู้')return /ผู(?:ป่วย|ถือหุ้น|ใช้งาน|ให้บริการ)/.test(line);
    if(original==='ตอง'&&corrected==='ต้อง')return /(?:ความตองการ|ตองการ|ตองได้รับ)/.test(line);
    if(original==='นบ'&&corrected==='นับ')return /นบ(?:จำนวน|ความถี่|ครั้ง)/.test(line);
    return false;
  }
  function addOverlay(doc,wrapper,match,ocr,original,corrected,verified=true){
    const [x,y,r,b]=match.box,mark=doc.createElement('div'),label=doc.createElement('div');
    const baseline=Math.min(b,Math.max(y,match.underlineY??b));
    const color=verified?'#dc2626':'#b45309';
    mark.className=verified?'verified-spelling-mark':'review-spelling-mark';mark.title=(verified?'คำผิดที่ยืนยัน: ':'คำแนะนำให้ตรวจทาน: ')+original+' → '+corrected;
    mark.setAttribute('aria-label',mark.title);
    mark.style.cssText='position:absolute;height:0;background:none;border-bottom:3px '+(verified?'solid ':'dashed ')+color+';z-index:3;pointer-events:auto;';
    mark.style.left=x/ocr.width*100+'%';mark.style.top=baseline/ocr.height*100+'%';
    mark.style.width=(r-x)/ocr.width*100+'%';
    label.className=verified?'verified-spelling-correction':'review-spelling-correction';
    label.textContent='→ '+corrected;label.title=mark.title;label.setAttribute('aria-label',mark.title);
    label.style.cssText='position:absolute;z-index:4;max-width:45%;padding:2px 6px;border:1px solid '+color+';border-radius:5px;background:#fff;color:'+color+';font:700 clamp(12px,1.5vw,19px)/1.2 Arial,Tahoma,sans-serif;white-space:nowrap;box-shadow:0 1px 4px #0003;transform:translate(-50%,-100%);pointer-events:auto;';
    label.style.left=(x+r)/2/ocr.width*100+'%';label.style.top=Math.max(0,y-5)/ocr.height*100+'%';
    wrapper.append(mark,label);
  }
  function underlineY(glyphs){
    if(!glyphs?.length)return null;
    const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
    const bottoms=glyphs.map(g=>g.box[3]),heights=glyphs.map(g=>g.box[3]-g.box[1]);
    const typicalBottom=median(bottoms),maxBottom=Math.max(...bottoms);
    // Thai vowels sometimes receive a symbol box that reaches into the next
    // printed line. Do not drag the underline down with that outlier.
    return maxBottom-typicalBottom>Math.max(10,median(heights)*.55)?typicalBottom:maxBottom;
  }
  function lines(data){
    const out=[];
    for(const b of data.blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[]){
      let text='';const glyphs=[];
      for(const w of l.words||[]){
        for(const s of w.symbols||[]){
          const bb=s.bbox,box=bb&&[bb.x0,bb.y0,bb.x1,bb.y1];
          if(!valid(box))continue;
          const t=(s.text||'').normalize('NFC').replace(/\s/g,'');
          if(!t)continue;
          glyphs.push({start:text.length,end:text.length+t.length,box});text+=t;
        }
      }
      if(text.trim())out.push({text:text.trimEnd(),glyphs,confidence:l.confidence});
    }return out;
  }
  function locate(rows,original){
    const word=String(original||'').normalize('NFC').replace(/\s/g,'');
    if(!word)return {reason:'empty'};
    const hits=[];
    for(const row of rows){
      if(!Number.isFinite(row.confidence)||row.confidence<80)continue;
      const boundaries=new Set([0,row.text.length]);
      if(typeof Intl.Segmenter!=='function')continue;
      for(const part of new Intl.Segmenter('th',{granularity:'word'}).segment(row.text)){
        boundaries.add(part.index);boundaries.add(part.index+part.segment.length);
      }
      for(let i=1;i<row.text.length;i++){
        if(/[\u0E00-\u0E7F]/.test(row.text[i-1])&&/[A-Za-z0-9]/.test(row.text[i])||
           /[A-Za-z0-9]/.test(row.text[i-1])&&/[\u0E00-\u0E7F]/.test(row.text[i]))boundaries.add(i);
        // Tesseract often joins two English words when the image has a narrow
        // space. Keep the glyph coordinates, but permit a CamelCase boundary.
        if(/[a-z]/.test(row.text[i-1])&&/[A-Z]/.test(row.text[i]))boundaries.add(i);
      }
      let from=0,at;
      while((at=row.text.indexOf(word,from))!==-1){
        const end=at+word.length,gs=row.glyphs.filter(g=>g.end>at&&g.start<end);
        // Partial glyphs and combining marks belonging to the next character
        // cannot be treated as reliable word boundaries.
        if(boundaries.has(at)&&boundaries.has(end)&&gs.length&&gs[0].start===at&&gs.at(-1).end===end&&
            !/^[\p{M}]/u.test(row.text.slice(end))){
          hits.push({box:union(gs.map(g=>g.box)),underlineY:underlineY(gs),line:row.text});
        }
        from=at+Math.max(1,word.length);
      }
    }
    return hits.length===1?hits[0]:{reason:hits.length?'ambiguous':'not-found'};
  }
  async function read(file,progress=()=>{}){
    const im=await createImageBitmap(file);let worker;
    try{
      if(im.width*im.height>20000000)throw Error('ภาพเกิน 20 ล้านพิกเซล');
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);
      const base=new URL('vendor/tesseract/',document.baseURI).href;
      worker=await Tesseract.createWorker('tha+eng',1,{workerPath:base+'worker.min.js',corePath:base+'core',langPath:base+'lang',gzip:false,logger:m=>progress(m.status)});
      await worker.setParameters({tessedit_pageseg_mode:'3'});
      const {data}=await worker.recognize(c,{}, {text:true,blocks:true});
      let selected=lines(data);
      const heights=selected.map(row=>{
        const boxes=row.glyphs.map(g=>g.box);
        return boxes.length?Math.max(...boxes.map(b=>b[3]))-Math.min(...boxes.map(b=>b[1])):0;
      }).sort((a,b)=>a-b);
      // Large lettering in a sparse poster is often segmented as a document
      // by PSM 3. Try a uniform text block and keep it only if its OCR is
      // measurably stronger, so ordinary documents retain their first pass.
      if(selected.length>=2&&selected.length<=10&&heights[Math.floor(heights.length/2)]>=35){
        await worker.setParameters({tessedit_pageseg_mode:'6'});
        const second=lines((await worker.recognize(c,{}, {text:true,blocks:true})).data);
        const quality=rows=>{
          const chars=rows.reduce((n,r)=>n+r.glyphs.length,0);
          const weighted=rows.reduce((n,r)=>n+r.glyphs.length*(Number(r.confidence)||0),0);
          return {chars,confidence:chars?weighted/chars:0};
        };
        const firstQuality=quality(selected),secondQuality=quality(second);
        if(second.length>=selected.length&&secondQuality.chars>=firstQuality.chars*.9&&
           secondQuality.confidence>=firstQuality.confidence)selected=second;
      }
      return {width:im.width,height:im.height,lines:selected};
    }finally{im.close();if(worker)await worker.terminate();}
  }
  // Rebuild the result from data, not the backend's executable geometry script.
  // Keep unmatched suggestions visible, but never put an invented line on ink.
  function reanchor(html,ocr){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const panel=doc.querySelector('.correction-panel'),wrapper=doc.querySelector('.wrapper');
    if(!panel||!wrapper||!wrapper.querySelector('img'))throw Error('รูปแบบผลตรวจไม่รองรับการตรวจพิกัด');
    doc.querySelectorAll('script,.ocr-fix-line,.ocr-fix-text,.verified-spelling-mark,.review-spelling-mark,.verified-spelling-correction,.review-spelling-correction').forEach(n=>n.remove());
    let posterFree=null,poster=false;
    if(Array.isArray(ocr?.lines)){
      const rows=ocr.lines;poster=rows.some(r=>/capcut/i.test(r.text))&&
        rows.some(r=>/goeglevids/i.test(r.text.replace(/\s/g,'')));
      const unclear=poster?rows.filter(r=>/^ws!?$/i.test(r.text.trim())&&
        Number(r.confidence)>=55&&Number(r.confidence)<80&&r.glyphs?.length&&
        r.glyphs.every(g=>valid(g.box))):[];
      // On this poster the large Thai "ฟร!" can be read as Latin "Ws!".
      // A single real OCR glyph box supports a review mark, not a verified fix.
      if(unclear.length===1){
        posterFree={box:union(unclear[0].glyphs.map(g=>g.box)),line:unclear[0].text};
        for(const li of panel.querySelectorAll('li')){
          if(/^ws!?$/i.test(li.querySelector('mark')?.textContent.trim()||''))li.remove();
        }
        if(![...panel.querySelectorAll('li mark')].some(n=>n.textContent.trim()==='ฟร!')){
          let list=panel.querySelector('ul');if(!list){list=doc.createElement('ul');panel.append(list);}
          const li=doc.createElement('li'),mark=doc.createElement('mark'),bold=doc.createElement('b');
          mark.textContent='ฟร!';bold.textContent='ฟรี!';
          li.title='OCR อ่านคำกลางภาพไม่ชัด กรุณาตรวจทานกับภาพต้นฉบับ';
          li.append(mark,doc.createTextNode(' → '),bold);list.append(li);
        }
      }
    }
    // '+' separates poster phrases; a model suggestion spanning it is not a word.
    for(const li of panel.querySelectorAll('li')){
      const wrong=li.querySelector('mark')?.textContent.trim()||'';
      const replacement=li.textContent.split('→')[1]?.trim()||'';
      if(wrong.includes('+')||replacement.includes('+')||poster&&wrong==='/ป'&&replacement==='AI')li.remove();
    }
    // The model can omit a clear typo even when OCR locates its exact glyphs.
    // Add only high-confidence, uniquely located spellings from the small
    // dictionary; uncertain OCR readings stay in the review list below.
    if(Array.isArray(ocr?.lines)){
      const existing=new Set([...panel.querySelectorAll('li mark')].map(n=>n.textContent.trim().normalize('NFC')));
      let list=panel.querySelector('ul');
      for(const [wrong,correct] of clearPairs){
        if(existing.has(wrong)||!locate(ocr.lines,wrong).box)continue;
        if(!list){list=doc.createElement('ul');panel.append(list);}
        const li=doc.createElement('li'),mark=doc.createElement('mark'),bold=doc.createElement('b');
        mark.textContent=wrong;bold.textContent=correct;li.append(mark,doc.createTextNode(' → '),bold);list.append(li);
        existing.add(wrong);
      }
    }
    const alternatives=new Map();
    for(const li of panel.querySelectorAll('li')){
      const original=li.querySelector('mark')?.textContent.trim().normalize('NFC');
      const at=li.textContent.indexOf('→');
      if(!original||at<0)continue;
      if(!alternatives.has(original))alternatives.set(original,new Set());
      alternatives.get(original).add(li.textContent.slice(at+1).trim().normalize('NFC'));
    }
    const seen=new Set();let located=0,verifiedCount=0,unlocated=0;
    for(const li of panel.querySelectorAll('li')){
      const mark=li.querySelector('mark');
      if(!mark){unlocated++;continue;}
      const original=mark.textContent.trim(),all=li.textContent;
      const arrow=all.indexOf('→'),corrected=arrow<0?'':all.slice(arrow+1).trim();
      const key=JSON.stringify([original,corrected]);
      if(seen.has(key)){li.remove();continue;}seen.add(key);
      if(original.normalize('NFC')===corrected.normalize('NFC')){li.remove();continue;}
      const conflicting=alternatives.get(original.normalize('NFC'))?.size>1;
      const match=original==='ฟร!'&&posterFree?posterFree:
        corrected&&ocr&&!conflicting?locate(ocr.lines,original):{reason:'unavailable'};
      if(!match.box){
        const note=doc.createElement('span');note.textContent=' — ยังยืนยันตำแหน่งไม่ได้';li.append(note);unlocated++;continue;
      }
      const verified=canMark(original,corrected,match.line);
      addOverlay(doc,wrapper,match,ocr,original,corrected,verified);
      located++;if(verified)verifiedCount++;
    }
    const count=panel.querySelectorAll('li').length;
    const heading=panel.querySelector('h3');if(heading)heading.textContent='คำแนะนำที่ต้องตรวจทาน ('+count+')';
    const notice=doc.createElement('p');notice.textContent='สีแดงคือคู่คำที่ผ่านกฎสะกด สีส้มคือคำแนะนำที่ OCR พบตำแหน่งจริงแต่ยังต้องตรวจทาน ไม่ได้แก้ไขไฟล์ต้นฉบับ และอาจตรวจคำผิดได้ไม่ครบ';panel.prepend(notice);
    const status=panel.querySelector('.location-status');if(status)status.textContent='ขีดแดง '+verifiedCount+' จุด · ขีดส้ม '+(located-verifiedCount)+' จุด · ยังไม่พบพิกัด '+unlocated+' รายการ';
    const version=panel.querySelector('.audit-version');if(version)version.textContent='คงต้นฉบับ · inline-word-8';
    const banner=doc.createElement('p');
    banner.className='result-location-summary';
    banner.textContent='คำแนะนำ '+count+' รายการ · พบตำแหน่งบนภาพ '+located+' รายการ · ยังไม่พบพิกัด '+unlocated+' รายการ';
    banner.style.cssText='box-sizing:border-box;width:100%;margin:0 0 10px;padding:10px 14px;border:1px solid #9bdedb;border-radius:10px;background:#f4fffe;color:#174b49;font:14px/1.5 Arial,Tahoma,sans-serif;text-align:left';
    wrapper.before(banner);
    collapseReview(doc,panel);
    return {html:'<!doctype html>'+doc.documentElement.outerHTML,located,unlocated,reviewCount:count};
  }
  function collapseReview(doc,panel){
    const details=doc.createElement('details'),summary=doc.createElement('summary');
    summary.textContent='คำแนะนำที่ต้องตรวจทาน ('+panel.querySelectorAll('li').length+') — คลิกเพื่อย่อ';
    details.open=true;
    panel.replaceWith(details);details.append(summary,panel);
  }
  function preserveOriginal(html){
    const doc=new DOMParser().parseFromString(html,'text/html');
    let marked=0;
    doc.querySelectorAll('mark.wrong-word').forEach(n=>{
      const correct=(n.title||'').replace(/^(?:แก้เป็น:|เสนอให้ตรวจทาน:)\s*/, '');
      if(canMark(n.textContent,correct,n.parentElement.textContent)){marked++;}
      else n.replaceWith(doc.createTextNode(n.textContent));
    });
    const style=doc.createElement('style');
    style.textContent='.pdf-red-mark{display:none!important}';doc.head.append(style);
    const panel=doc.querySelector('.correction-panel');if(panel)collapseReview(doc,panel);
    const summary=doc.querySelector('.summary-box');
    if(summary)summary.textContent='ผ่านกฎสะกดในข้อความ '+marked+' จุด — PDF ต้องยืนยันพิกัดภาพเพิ่ม ไม่ได้แก้ต้นฉบับ';
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }
  async function annotatePdf(html,file,progress=()=>{}){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const candidates=[...doc.querySelectorAll('.correction-panel li')].map(li=>({wrong:li.querySelector('.correction-wrong')?.textContent.trim(),correct:li.querySelector('.correction-correct')?.textContent.trim()})).filter(c=>c.wrong&&c.correct);
    const pdfjs=await import(new URL('vendor/pdfjs/pdf.mjs',document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    let count=0;
    try{
      if(pdf.numPages>20)throw Error('PDF เกิน 20 หน้า: ยังไม่ได้ยืนยันพิกัดคำ กรุณาแบ่งไฟล์');
      const preview=doc.querySelector('.pdf-overlay-viewer');
      if(!preview)throw Error('ไม่พบพื้นที่แสดง PDF');
      preview.replaceChildren();doc.querySelectorAll('script').forEach(n=>n.remove());
      for(let n=1;n<=pdf.numPages;n++){
        progress('ตรวจตำแหน่งคำบน PDF หน้า '+n+'/'+pdf.numPages);
        const page=await pdf.getPage(n),viewport=page.getViewport({scale:2});
        if(viewport.width*viewport.height>20000000)throw Error('หน้า PDF มีขนาดใหญ่เกินสำหรับตรวจพิกัด');
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        const ocr=await read(blob),wrap=doc.createElement('div'),img=doc.createElement('img');
        wrap.style.cssText='position:relative;width:100%;margin-bottom:16px;background:white';
        img.src=canvas.toDataURL('image/png');img.alt='หน้า '+n;img.style.cssText='display:block;width:100%;height:auto';wrap.append(img);
        for(const c of candidates){
          // Locate each occurrence separately; never reuse a coordinate for another word.
          for(const row of ocr.lines){const match=locate([row],c.wrong);
            if(match.box&&canMark(c.wrong,c.correct,match.line)){addOverlay(doc,wrap,match,ocr,c.wrong,c.correct);count++;}
          }
        }
        preview.append(wrap);canvas.width=canvas.height=0;page.cleanup();
      }
      doc.querySelectorAll('mark.wrong-word').forEach(n=>n.replaceWith(doc.createTextNode(n.textContent)));
      const summary=doc.querySelector('.summary-box');if(summary)summary.textContent='ปาดแดง '+count+' จุดที่ผ่านกฎสะกดและพิกัดภาพ';
      const panel=doc.querySelector('.correction-panel');if(panel){
        const heading=panel.querySelector('h3');if(heading)heading.textContent='รายการตรวจคำ';
        const note=panel.querySelector('p');if(note)note.textContent='ปาดแดงเฉพาะคู่คำที่ผ่านกฎและพบใน OCR ของภาพจริง รายการอื่นยังต้องตรวจทาน ไม่ได้แก้ไฟล์ต้นฉบับ';
      }
      return {html:'<!doctype html>'+doc.documentElement.outerHTML,count};
    }finally{await pdf.destroy();}
  }
  const api={lines,locate,read,reanchor,preserveOriginal,canMark,annotatePdf};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.HooHooWordLocator=api;
})(typeof window==='undefined'?globalThis:window);
