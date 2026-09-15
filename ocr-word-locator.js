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
      let from=0,at;
      while((at=row.text.indexOf(word,from))!==-1){
        const end=at+word.length,gs=row.glyphs.filter(g=>g.end>at&&g.start<end);
        // Partial glyphs and combining marks belonging to the next character
        // cannot be treated as reliable word boundaries.
        if(gs.length&&gs[0].start===at&&gs.at(-1).end===end&&
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
      const [x,y,r,b]=match.box,line=doc.createElement('div'),label=doc.createElement('div');
      line.className='ocr-fix-line';label.className='ocr-fix-text';
      line.style.left=label.style.left=x/ocr.width*100+'%';line.style.top=b/ocr.height*100+'%';line.style.width=(r-x)/ocr.width*100+'%';
      label.style.top=y/ocr.height*100+'%';label.textContent=corrected;
      line.title=label.title=original+' → '+corrected;
      line.dataset.location='native-ocr-symbols';line.dataset.bbox=JSON.stringify(match.box);
      wrapper.append(line,label);located++;
    }
    const count=panel.querySelectorAll('li').length;
    const heading=panel.querySelector('h3');if(heading)heading.textContent='คำแนะนำแก้ไข ('+count+')';
    const status=panel.querySelector('.location-status');if(status)status.textContent='แสดงตำแหน่ง '+located+' จาก '+count+' รายการ'+(unlocated?' · อีก '+unlocated+' รายการต้องตรวจภาพเพิ่มเติม':'');
    const version=panel.querySelector('.audit-version');if(version)version.textContent='พิกัดตัวอักษรจากภาพจริง · word-position-1';
    return {html:'<!doctype html>'+doc.documentElement.outerHTML,located,unlocated};
  }
  const api={lines,locate,read,reanchor};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.HooHooWordLocator=api;
})(typeof window==='undefined'?globalThis:window);
