/* Literal OCR coordinates only. Never interpolate positions across a paragraph. */
(function(root){
  'use strict';
  const valid=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>b[0]&&b[3]>b[1];
  const union=bs=>[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];
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
      }
      let from=0,at;
      while((at=row.text.indexOf(word,from))!==-1){
        const end=at+word.length,gs=row.glyphs.filter(g=>g.end>at&&g.start<end);
        // Partial glyphs and combining marks belonging to the next character
        // cannot be treated as reliable word boundaries.
        if(boundaries.has(at)&&boundaries.has(end)&&gs.length&&gs[0].start===at&&gs.at(-1).end===end&&
            !/^[\p{M}]/u.test(row.text.slice(end))){
          hits.push({box:union(gs.map(g=>g.box)),line:row.text});
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
      return {width:im.width,height:im.height,lines:lines(data)};
    }finally{im.close();if(worker)await worker.terminate();}
  }
  // Rebuild the result from data, not the backend's executable geometry script.
  // Keep unmatched suggestions visible, but never put an invented line on ink.
  function reanchor(html,ocr){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const panel=doc.querySelector('.correction-panel'),wrapper=doc.querySelector('.wrapper');
    if(!panel||!wrapper||!wrapper.querySelector('img'))throw Error('รูปแบบผลตรวจไม่รองรับการตรวจพิกัด');
    doc.querySelectorAll('script,.ocr-fix-line,.ocr-fix-text').forEach(n=>n.remove());
    const alternatives=new Map();
    for(const li of panel.querySelectorAll('li')){
      const original=li.querySelector('mark')?.textContent.trim().normalize('NFC');
      const at=li.textContent.indexOf('→');
      if(!original||at<0)continue;
      if(!alternatives.has(original))alternatives.set(original,new Set());
      alternatives.get(original).add(li.textContent.slice(at+1).trim().normalize('NFC'));
    }
    const seen=new Set();let located=0,unlocated=0;
    for(const li of panel.querySelectorAll('li')){
      const mark=li.querySelector('mark');
      if(!mark){unlocated++;continue;}
      const original=mark.textContent.trim(),all=li.textContent;
      const arrow=all.indexOf('→'),corrected=arrow<0?'':all.slice(arrow+1).trim();
      const key=JSON.stringify([original,corrected]);
      if(seen.has(key)){li.remove();continue;}seen.add(key);
      if(original.normalize('NFC')===corrected.normalize('NFC')){li.remove();continue;}
      const conflicting=alternatives.get(original.normalize('NFC'))?.size>1;
      const match=corrected&&ocr&&!conflicting?locate(ocr.lines,original):{reason:'unavailable'};
      if(!match.box){
        const note=doc.createElement('span');note.textContent=' — ยังยืนยันตำแหน่งไม่ได้';li.append(note);unlocated++;continue;
      }
      // A matching OCR location is not evidence of a spelling error.
      // Keep the candidate off the original image until semantic verification exists.
      located++;
    }
    const count=panel.querySelectorAll('li').length;
    const heading=panel.querySelector('h3');if(heading)heading.textContent='คำแนะนำที่ต้องตรวจทาน ('+count+')';
    const notice=doc.createElement('p');notice.textContent='พิกัด OCR ไม่ใช่การยืนยันว่าคำนั้นผิด คำแนะนำทั้งหมดต้องตรวจเทียบภาพต้นฉบับ ระบบไม่ได้แก้ไขไฟล์ และอาจตรวจคำผิดได้ไม่ครบ';panel.prepend(notice);
    const status=panel.querySelector('.location-status');if(status)status.textContent='ไม่ทำเครื่องหมายคำผิดบนต้นฉบับ: '+count+' รายการยังไม่ผ่านการยืนยัน';
    const version=panel.querySelector('.audit-version');if(version)version.textContent='คงต้นฉบับ · review-only-3';
    collapseReview(doc,panel);
    return {html:'<!doctype html>'+doc.documentElement.outerHTML,located,unlocated,reviewCount:count};
  }
  function collapseReview(doc,panel){
    const details=doc.createElement('details'),summary=doc.createElement('summary');
    summary.textContent='รายการที่ยังไม่ยืนยัน — เปิดเพื่อตรวจทาน (ไม่ใช่คำผิดที่ยืนยันแล้ว)';
    panel.replaceWith(details);details.append(summary,panel);
  }
  function preserveOriginal(html){
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('mark.wrong-word').forEach(n=>n.replaceWith(doc.createTextNode(n.textContent)));
    const style=doc.createElement('style');
    style.textContent='.pdf-red-mark{display:none!important}';doc.head.append(style);
    const panel=doc.querySelector('.correction-panel');if(panel)collapseReview(doc,panel);
    const summary=doc.querySelector('.summary-box');
    if(summary)summary.textContent='ยังไม่มีคำผิดที่ยืนยันแล้ว — มีรายการให้ตรวจทาน ไม่ได้แก้ต้นฉบับ';
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }
  const api={lines,locate,read,reanchor,preserveOriginal};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.HooHooWordLocator=api;
})(typeof window==='undefined'?globalThis:window);
