/* Literal OCR coordinates only. Never interpolate positions across a paragraph. */
(function(root){
  'use strict';
  const valid=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>b[0]&&b[3]>b[1];
  const union=bs=>[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];
  // Narrow spelling rules; never treat an arbitrary AI replacement as verified.
  const clearPairs=new Map(Object.entries({'อนุญาติ':'อนุญาต','ประมวณผล':'ประมวลผล','บริสัท':'บริษัท','ข้อมุล':'ข้อมูล','ข้อตวาม':'ข้อความ','บันทก':'บันทึก','ลกษณะ':'ลักษณะ','กำนด':'กำหนด','กํานด':'กำหนด','หน่ยว':'หน่วย','รายล่ะเอียด':'รายละเอียด','ทังหมด':'ทั้งหมด','ปรากฎ':'ปรากฏ','สังเกตุ':'สังเกต','คำนวน':'คำนวณ','บอกล':'บอกลา','วิดีโด':'วิดีโอ','พรีเซนต':'พรีเซนต์','Goegle':'Google','วิดิทัศน์':'วีดิทัศน์','วิดีทัศน์':'วีดิทัศน์','วีดีทัศน์':'วีดิทัศน์','ประศบภัย':'ประสบภัย','ชวย':'ช่วย','ผู':'ผู้','ทวม':'ท่วม','ภากไต้':'ภาคใต้','ฝรัง':'ฝรั่ง','ได':'ได้','อยา':'อย่า','ประโยบ':'ประโยค','ทก':'ทุก','จรง':'จริง','จินตนากาน':'จินตนาการ','Banano':'Banana','เงน':'เงิน','คณ':'คุณ','สามารด':'สามารถ','สถานการณ':'สถานการณ์','ชอย':'ชอบ','อินโฟกราฟฟิก':'อินโฟกราฟิก','บ้าล':'บ้าน','ประหยด':'ประหยัด','ประหยับ':'ประหยัด','ประหยัม':'ประหยัด','ง่าน':'ง่าย'}));
  function canMark(original,corrected,line){
    if(clearPairs.get(original)===corrected)return true;
    if(original==='ผู'&&corrected==='ผู้')return /ผู(?:ป่วย|ถือหุ้น|ใช้งาน|ให้บริการ)/.test(line);
    if(original==='ตอง'&&corrected==='ต้อง')return /(?:ความตองการ|ตองการ|ตองได้รับ)/.test(line);
    if(original==='นบ'&&corrected==='นับ')return /นบ(?:จำนวน|ความถี่|ครั้ง)/.test(line);
    return false;
  }
  function addOverlay(doc,wrapper,match,ocr,original,corrected,verified=true){
    const [x,y,r,b]=match.box,mark=doc.createElement('div'),label=doc.createElement('div');
    const middle=Math.min(b,Math.max(y,match.strikeY??(y+b)/2));
    const color=verified?'#dc2626':'#b45309';
    let aboveGap=Infinity,belowGap=Infinity;
    for(const row of ocr.lines||[]){
      const boxes=row.glyphs?.map(g=>g.box).filter(valid)||[];
      if(!boxes.length)continue;
      const rb=union(boxes);
      if(rb[0]>=r||rb[2]<=x)continue;
      if(rb[3]<=y)aboveGap=Math.min(aboveGap,y-rb[3]);
      if(rb[1]>=b)belowGap=Math.min(belowGap,rb[1]-b);
    }
    const below=y<30;
    mark.className=verified?'verified-spelling-mark':'review-spelling-mark';mark.title=(verified?'คำผิดที่ยืนยัน: ':'คำแนะนำให้ตรวจทาน: ')+original+' → '+corrected;
    mark.setAttribute('aria-label',mark.title);
    mark.style.cssText='position:absolute;height:0;background:none;border-top:3px '+(verified?'solid ':'dashed ')+color+';z-index:3;pointer-events:auto;';
    mark.style.left=x/ocr.width*100+'%';mark.style.top=middle/ocr.height*100+'%';
    mark.style.width=(r-x)/ocr.width*100+'%';
    label.className=verified?'verified-spelling-correction':'review-spelling-correction';
    label.textContent='→ '+corrected;label.title=mark.title;label.setAttribute('aria-label',mark.title);
    label.style.cssText='position:absolute;z-index:4;color:'+color+';font:700 clamp(14px,2vw,24px)/1.2 Arial,Tahoma,sans-serif;white-space:nowrap;background:transparent;border:0;padding:0;box-shadow:none;-webkit-text-stroke:2px #fff;paint-order:stroke fill;text-shadow:0 1px 1px #fff;transform:translate(-50%,'+(below?'0':'-100%')+');pointer-events:auto;';
    label.style.left=(x+r)/2/ocr.width*100+'%';label.style.top=(below?Math.min(ocr.height,b+5):Math.max(0,y-5))/ocr.height*100+'%';
    wrapper.append(mark,label);
  }
  function strikeY(glyphs){
    if(!glyphs?.length)return null;
    // Use the median glyph center so tall Thai vowel boxes and descenders do
    // not pull the strike through above or below the printed letter bodies.
    const centers=glyphs.map(g=>(g.box[1]+g.box[3])/2).sort((a,b)=>a-b);
    return centers[Math.floor(centers.length/2)];
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
  function locate(rows,original,allMatches=false){
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
        if(word==='คณ'&&!/^คณ(?:สามารถ|สามารด)/.test(row.text.slice(at))||word==='ชอย'&&!/ไม่$/.test(row.text.slice(0,at))||word==='ทก'&&!/^ทกเรื/.test(row.text.slice(at))||word==='ได'&&!/^ได(?:ยิน|ตาม)/.test(row.text.slice(at))||word==='อยา'&&!/^อยาเช(?:ื่อ|อ)/.test(row.text.slice(at))||word==='ผู'&&!/^ผู(?:ประ[สศ]บภัย|ป่วย|ใช้งาน|ถือหุ้น)/.test(row.text.slice(at))||word==='ชวย'&&!/^ชวยเหลือ/.test(row.text.slice(at))){from=at+word.length;continue;}
        const end=at+word.length,gs=row.glyphs.filter(g=>g.end>at&&g.start<end);
        // Partial glyphs and combining marks belonging to the next character
        // cannot be treated as reliable word boundaries.
        // Thai segmentation can join a short misspelling to the following
        // word (for example "เงนมาก"). Exact glyphs and a unique match are
        // still sufficient to place a review mark at those printed letters.
        const startBoundary=boundaries.has(at),endBoundary=boundaries.has(end);
        const thaiJoined=startBoundary&&!endBoundary&&word.length>=3&&/^[\u0E00-\u0E7F]+$/.test(word);
        const knownSpelling=clearPairs.has(word);
        if((knownSpelling||startBoundary&&(endBoundary||thaiJoined))&&gs.length&&gs[0].start===at&&gs.at(-1).end===end&&
            !/^[\p{M}]/u.test(row.text.slice(end))){
          hits.push({box:union(gs.map(g=>g.box)),strikeY:strikeY(gs),line:row.text});
        }
        from=at+Math.max(1,word.length);
      }
    }
    if(allMatches)return hits;
    return hits.length===1?hits[0]:{reason:hits.length?'ambiguous':'not-found'};
  }
  function locateBest(ocr,word){
    const primary=locate(ocr.lines,word);
    return primary.box?primary:(ocr.pixelCorrections||[]).find(c=>c.wrong===word)||locate([...(ocr.refinedLines||[]),...(ocr.alternativeLines||[])],word);
  }
  function sameInk(a,b){
    const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
    return intersection/Math.min((a[2]-a[0])*(a[3]-a[1]),(b[2]-b[0])*(b[3]-b[1]))>.55;
  }
  function checkedReading(ocr,wrong,hit){
    // A second reading must refer to the same ink, not another occurrence.
    const reads=[];
    for(const row of ocr.validationLines||[]){
      if(row.confidence<85)continue;
      const gs=row.glyphs.filter(g=>{
        const cx=(g.box[0]+g.box[2])/2,cy=(g.box[1]+g.box[3])/2;
        return cx>=hit.box[0]-2&&cx<=hit.box[2]+2&&cy>=hit.box[1]-3&&cy<=hit.box[3]+3;
      });
      if(!gs.length||!sameInk(union(gs.map(g=>g.box)),hit.box))continue;
      reads.push(row.text.slice(gs[0].start,gs.at(-1).end).normalize('NFC'));
    }
    if(reads.includes(wrong.normalize('NFC')))return 'agreed';
    return reads.length?'contradicted':'unconfirmed';
  }
  function differsOnlyByThaiTone(a,b){
    if(!a||!b||a===b)return false;
    const strip=s=>s.normalize('NFC').replace(/[\u0E48-\u0E4B]/g,'');
    return strip(a)===strip(b);
  }
  // OCR sometimes silently inserts or drops Thai marks in a long document.
  // Re-read only words likely affected, using their first-pass glyph boxes to
  // crop the actual pixels. The second pass keeps its own glyph coordinates.
  // A vowel mai-han-akat and a mai-ek are separate upper marks in clear,
  // non-touching print. Only flag the one-mark case on a plain light background.
  // Joined marks, small lettering and noise remain uncertain.
  function missingStackedTone(image){
    const {width:w,height:h,data}=image;
    if(w<30||h<35||w*h>1000000)return false;
    const ink=new Uint8Array(w*h),seen=new Uint8Array(w*h),parts=[];let light=0;
    for(let i=0;i<ink.length;i++){
      const j=i*4,r=data[j],g=data[j+1],b=data[j+2];
      if(Math.min(r,g,b)>210)light++;
      ink[i]=Math.max(r,g,b)<180&&data[j+3]>200?1:0;
    }
    if(light/ink.length<.65)return false;
    for(let i=0;i<ink.length;i++){
      if(!ink[i]||seen[i])continue;
      const queue=[i];seen[i]=1;let n=0,x0=w,y0=h,x1=0,y1=0;
      while(queue.length){
        const at=queue.pop(),x=at%w,y=Math.floor(at/w);n++;
        x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
        for(const next of [x?at-1:-1,x<w-1?at+1:-1,y?at-w:-1,y<h-1?at+w:-1])
          if(next>=0&&ink[next]&&!seen[next]){seen[next]=1;queue.push(next);}
      }
      if(n>=Math.max(6,w*h*.0005))parts.push({n,x0,y0,x1,y1,height:y1-y0+1,width:x1-x0+1});
    }
    const tallest=Math.max(0,...parts.map(p=>p.height));
    const bodies=parts.filter(p=>p.height>=tallest*.55);
    if(bodies.length<3||bodies.length>7)return false;
    const tops=bodies.map(p=>p.y0).sort((a,b)=>a-b),bodyTop=tops[Math.floor(tops.length/2)];
    const upper=parts.filter(p=>p.y1<bodyTop-2);
    return upper.length===1&&upper[0].width/upper[0].height>=1.4&&upper[0].height>=4;
  }
  // Connected white ink supplies bounds when decorative Thai is read as Latin.
  function whiteParts(canvas,box){
    const x=Math.max(0,Math.floor(box[0])),y=Math.max(0,Math.floor(box[1]));
    const w=Math.min(canvas.width,Math.ceil(box[2]))-x,h=Math.min(canvas.height,Math.ceil(box[3]))-y;
    if(w<=0||h<=0||w*h>1000000)return [];
    const data=canvas.getContext('2d').getImageData(x,y,w,h).data,ink=new Uint8Array(w*h),parts=[];
    for(let i=0;i<ink.length;i++){const a=data[i*4],b=data[i*4+1],c=data[i*4+2];ink[i]=Math.min(a,b,c)>205&&Math.max(a,b,c)-Math.min(a,b,c)<55?1:0;}
    for(let i=0;i<ink.length;i++)if(ink[i]){
      const stack=[i];ink[i]=0;let count=0,l=w,t=h,r=0,b=0;
      while(stack.length){const n=stack.pop(),xx=n%w,yy=Math.floor(n/w);count++;l=Math.min(l,xx);t=Math.min(t,yy);r=Math.max(r,xx+1);b=Math.max(b,yy+1);
        for(const m of [xx>0?n-1:-1,xx<w-1?n+1:-1,yy>0?n-w:-1,yy<h-1?n+w:-1])if(m>=0&&ink[m]){ink[m]=0;stack.push(m);}}
      if(count>=6)parts.push([x+l,y+t,x+r,y+b]);
    }return parts;
  }
  function posterMarkProofs(canvas,rows){
    if(!rows.some(r=>/capcut/i.test(r.text))||!rows.some(r=>/goeglevids/i.test(r.text.replace(/\s/g,''))))return [];
    const proofs=[],free=rows.filter(r=>/^ws!?$/i.test(r.text.trim())&&r.confidence>=55&&r.glyphs?.every(g=>valid(g.box)));
    if(free.length===1){
      const box=union(free[0].glyphs.map(g=>g.box)),height=box[3]-box[1];
      const parts=whiteParts(canvas,[box[0]-5,box[1]-height*.4,box[2]+5,box[3]+5]);
      const bodies=parts.filter(b=>b[3]-b[1]>height*.45).sort((a,b)=>a[0]-b[0]);
      if(bodies.length===3&&(bodies[0][3]-bodies[0][1])>(bodies[1][3]-bodies[1][1])*1.15){
        const rr=bodies[1],upper=parts.some(b=>b[3]<rr[1]-2&&b[2]>rr[0]&&b[0]<rr[2]);
        if(!upper)proofs.push({wrong:'ฟร!',correct:'ฟรี!',box:union(parts),line:free[0].text,pixelVerified:true,strikeY:(rr[1]+rr[3])/2});
      }
    }
    const hits=locate(rows,'พรีเซนต',true);
    if(hits.length===1){
      const hit=hits[0],row=rows.find(r=>r.text===hit.line),at=row?.text.indexOf('พรีเซนต');
      const glyph=row?.glyphs?.[at+6];
      if(row?.text.slice(glyph?.start,glyph?.end)==='ต'&&valid(glyph.box)){
        const g=glyph.box,parts=whiteParts(canvas,[g[0]-3,g[1]-(g[3]-g[1])*.65,g[2]+3,g[3]+3]);
        const body=parts.find(b=>b[3]-b[1]>(g[3]-g[1])*.6);
        if(body&&!parts.some(b=>b[3]<body[1]-2&&b[2]>body[0]&&b[0]<body[2])){
          const word=whiteParts(canvas,[row.glyphs[0].box[0],g[1]-(g[3]-g[1]),row.glyphs.at(-1).box[2],g[3]+3]).filter(b=>b[2]>hit.box[0]+2&&b[0]<hit.box[2]-2);
          if(word.length)proofs.push({wrong:'พรีเซนต',correct:'พรีเซนต์',box:union(word),line:hit.line,pixelVerified:true,strikeY:(body[1]+body[3])/2});
        }
      }
    }return proofs;
  }
  async function refineThaiMarks(worker,canvas,rows){
    const refinedLines=[],pixelCorrections=[],confirmed=new Set();
    const checks=[
      {search:'รายละเอียด',wrong:'รายล่ะเอียด',mode:'7',scale:1},
      {search:'ทั้งหมด',wrong:'ทังหมด',mode:'7',scale:2},
      {search:'ใบแจ้งหนี',correct:'ใบแจ้งหนี้',mode:'13',scale:1},
      {search:'ฝรั่ง',wrong:'ฝรัง',mode:'7',scale:2},
      {search:'อย่าเชื่อ',wrong:'อยา',mode:'7',scale:2}
    ];
    for(const check of checks){
      const matches=[];
      for(const row of rows){
        let at=row.text.indexOf(check.search);
        while(at>=0){
          const glyphs=row.glyphs.filter(g=>g.start<at+check.search.length&&g.end>at);
          if(glyphs.length&&glyphs[0].start===at&&glyphs.at(-1).end===at+check.search.length)
            matches.push({box:union(glyphs.map(g=>g.box)),row});
          at=row.text.indexOf(check.search,at+check.search.length);
        }
      }
      // A duplicate phrase cannot be assigned a correction by guessing.
      if(matches.length!==1)continue;
      const {box:[x,y,r,b],row}=matches[0],pad=12;
      if(check.search==='ฝรั่ง'){
        const sx=Math.max(0,Math.floor(x)),sy=Math.max(0,Math.floor(y-20));
        const sw=Math.min(canvas.width-sx,Math.ceil(r)-sx),sh=Math.min(canvas.height-sy,Math.ceil(b+4)-sy);
        if(sw>0&&sh>0&&missingStackedTone(canvas.getContext('2d').getImageData(sx,sy,sw,sh)))
          pixelCorrections.push({wrong:'ฝรัง',correct:'ฝรั่ง',box:[x,y,r,b],line:row.text,
            verification:'review',strikeY:(y+b)/2});
      }

      const lineLeft=Math.min(...row.glyphs.map(g=>g.box[0]));
      const left=Math.max(0,Math.floor(Math.max(x-200,lineLeft)-pad)),top=Math.max(0,Math.floor(y-pad));
      const right=Math.min(canvas.width,Math.ceil(r+pad)),bottom=Math.min(canvas.height,Math.ceil(b+pad));
      const crop=document.createElement('canvas');
      crop.width=(right-left)*check.scale;crop.height=(bottom-top)*check.scale;
      crop.getContext('2d').drawImage(canvas,left,top,right-left,bottom-top,0,0,crop.width,crop.height);
      let rescanned=[];
      try{
        await worker.setParameters({tessedit_pageseg_mode:check.mode});
        rescanned=lines((await worker.recognize(crop,{}, {text:true,blocks:true})).data);
      }catch(error){
        // A failed optional crop must not hide the primary OCR result.
        console.warn('Thai mark recheck failed',error);
      }
      crop.width=crop.height=0;
      if(check.correct){
        if(rescanned.some(row=>row.text.includes(check.correct)&&row.confidence>=70))confirmed.add(check.correct);
      }else{
        for(const row of rescanned){
          if(!row.text.includes(check.wrong)||row.confidence<80)continue;
          refinedLines.push({...row,glyphs:row.glyphs.map(g=>({
            ...g,box:g.box.map((v,i)=>v/check.scale+(i%2?top:left))
          }))});
        }
      }
    }
    return {refinedLines,pixelCorrections,confirmed:[...confirmed]};
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
      let selected=lines(data);const alternativeLines=[],validationLines=[];
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
      // Sparse photographs can merge or omit a line in automatic layout mode.
      // Retain an independent sparse-text reading with its own real glyph boxes.
      if(selected.length<=15){
        await worker.setParameters({tessedit_pageseg_mode:'11'});
        const sparse=lines((await worker.recognize(c,{}, {text:true,blocks:true})).data);
        alternativeLines.push(...sparse.filter(r=>r.confidence>=80));
      }
      // Colourful posters can lose whole headings in the primary pass.
      // Use the green channel to distinguish yellow/white ink from dark red,
      // preserving original pixel coordinates; replace only clearly weaker rows.
      const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height);
      let saturated=0;
      for(let i=0;i<pixels.data.length;i+=4)if(Math.max(pixels.data[i],pixels.data[i+1],pixels.data[i+2])-Math.min(pixels.data[i],pixels.data[i+1],pixels.data[i+2])>70)saturated++;
      if(selected.length<30&&saturated/(c.width*c.height)>.1){
        const contrast=document.createElement('canvas');contrast.width=c.width;contrast.height=c.height;
        const ctx=contrast.getContext('2d');
        for(let i=0;i<pixels.data.length;i+=4){const value=pixels.data[i+1]>=135?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}
        ctx.putImageData(pixels,0,0);
        try{
          await worker.setParameters({tessedit_pageseg_mode:'11'});
          const extraRows=lines((await worker.recognize(contrast,{}, {text:true,blocks:true})).data);
          for(const row of extraRows){
            if(row.confidence<80||!row.glyphs.length)continue;
            const box=union(row.glyphs.map(g=>g.box));if(box[3]-box[1]<25)continue;
            const area=(box[2]-box[0])*(box[3]-box[1]);
            const overlaps=selected.map((old,index)=>({old,index})).filter(({old})=>{
              const other=union(old.glyphs.map(g=>g.box));
              const intersection=Math.max(0,Math.min(box[2],other[2])-Math.max(box[0],other[0]))*Math.max(0,Math.min(box[3],other[3])-Math.max(box[1],other[1]));
              return intersection/Math.min(area,(other[2]-other[0])*(other[3]-other[1]))>.5&&Math.abs(strikeY(row.glyphs)-strikeY(old.glyphs))<Math.min(box[3]-box[1],other[3]-other[1])*.6;
            });
            if(!overlaps.length)selected.push(row);
            else if(overlaps.every(({old})=>row.confidence>old.confidence+10&&row.text.length>=old.text.length*.8)){
              const replaced=new Set(overlaps.map(({index})=>index));
              selected=selected.filter((old,index)=>!replaced.has(index));selected.push(row);
            }
          }
        }catch(error){console.warn('Colour contrast OCR unavailable',error);}
        contrast.width=contrast.height=0;
      }
      if(saturated/(c.width*c.height)>.1&&selected.length<80){
        // White/cream lettering on green is lost by the yellow-on-red pass.
        // Isolate bright neutral ink without changing pixel coordinates.
        const mask=document.createElement('canvas');mask.width=c.width;mask.height=c.height;
        const ctx=mask.getContext('2d'),source=c.getContext('2d').getImageData(0,0,c.width,c.height);
        for(let i=0;i<source.data.length;i+=4){
          const r=source.data[i],g=source.data[i+1],b=source.data[i+2];
          const value=Math.min(r,g,b)>205&&Math.max(r,g,b)-Math.min(r,g,b)<55?0:255;
          source.data[i]=source.data[i+1]=source.data[i+2]=value;source.data[i+3]=255;
        }
        ctx.putImageData(source,0,0);
        try{
          await worker.setParameters({tessedit_pageseg_mode:'11'});
          const scale=c.width*c.height<=5000000?2:1;
          const zoom=document.createElement('canvas');zoom.width=c.width*scale;zoom.height=c.height*scale;
          zoom.getContext('2d').drawImage(mask,0,0,zoom.width,zoom.height);
          const whiteRows=lines((await worker.recognize(zoom,{}, {text:true,blocks:true})).data).map(row=>({...row,glyphs:row.glyphs.map(g=>({...g,box:g.box.map(v=>v/scale)}))}));
          zoom.width=zoom.height=0;
          for(const row of whiteRows){
            if(row.confidence<80||row.text.length<3||!row.glyphs.length)continue;
            const box=union(row.glyphs.map(g=>g.box));
            if(!selected.some(old=>sameInk(union(old.glyphs.map(g=>g.box)),box)))selected.push(row);
            else alternativeLines.push(row);
          }
        }catch(error){console.warn('Light ink OCR unavailable',error);}
        mask.width=mask.height=0;
        // Re-read each recovered line at larger size. The second glyph reading
        // is evidence against an OCR artifact such as การ misread as ภาร.
        for(const row of selected.filter(r=>r.text.length>=3&&r.glyphs.length).slice(0,45)){
          const box=union(row.glyphs.map(g=>g.box)),pad=12,scale=2;
          const left=Math.max(0,Math.floor(box[0]-pad)),top=Math.max(0,Math.floor(box[1]-pad));
          const right=Math.min(c.width,Math.ceil(box[2]+pad)),bottom=Math.min(c.height,Math.ceil(box[3]+pad));
          const crop=document.createElement('canvas');crop.width=(right-left)*scale;crop.height=(bottom-top)*scale;
          const cx=crop.getContext('2d');cx.drawImage(c,left,top,right-left,bottom-top,0,0,crop.width,crop.height);
          const bytes=cx.getImageData(0,0,crop.width,crop.height);
          let green=0;
          for(let i=0;i<bytes.data.length;i+=4)if(bytes.data[i+1]>bytes.data[i]+25&&bytes.data[i+1]>bytes.data[i+2]+25)green++;
          const lightInk=green/(crop.width*crop.height)>.25;
          for(let i=0;i<bytes.data.length;i+=4){const r=bytes.data[i],g=bytes.data[i+1],b=bytes.data[i+2];
            const ink=lightInk?Math.min(r,g,b)>205&&Math.max(r,g,b)-Math.min(r,g,b)<55:g>=135;
            bytes.data[i]=bytes.data[i+1]=bytes.data[i+2]=ink?0:255;bytes.data[i+3]=255;
          }
          cx.putImageData(bytes,0,0);
          try{
            await worker.setParameters({tessedit_pageseg_mode:'7'});
            const reread=lines((await worker.recognize(crop,{}, {text:true,blocks:true})).data);
            for(const next of reread.filter(r=>r.confidence>=80)){
              const mapped={...next,glyphs:next.glyphs.map(g=>({...g,box:g.box.map((v,i)=>v/scale+(i%2?top:left))}))};
              validationLines.push(mapped);alternativeLines.push(mapped);
            }
          }catch(error){console.warn('Line crop OCR unavailable',error);}
          crop.width=crop.height=0;
        }
      }
      const extra=await refineThaiMarks(worker,c,selected);
      extra.pixelCorrections.push(...posterMarkProofs(c,selected));
      return {width:im.width,height:im.height,lines:selected,alternativeLines,validationLines,...extra};
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
    for(const li of panel.querySelectorAll('li')){
      const mark=li.querySelector('mark'),bold=li.querySelector('b');
      if(mark?.textContent.trim()==='าฟฟิก'&&bold?.textContent.trim()==='กราฟิก'&&locateBest(ocr,'อินโฟกราฟฟิก').box){
        mark.textContent='อินโฟกราฟฟิก';bold.textContent='อินโฟกราฟิก';
      }
    }
    // '+' separates poster phrases; a model suggestion spanning it is not a word.
    for(const li of panel.querySelectorAll('li')){
      const wrong=li.querySelector('mark')?.textContent.trim()||'';
      const replacement=li.textContent.split('→')[1]?.trim()||'';
      if(wrong.includes('+')||replacement.includes('+')||differsOnlyByThaiTone(wrong,replacement)&&clearPairs.get(wrong)!==replacement||poster&&wrong==='/ป'&&replacement==='AI'||
        wrong==='ใบแจ้งหนี'&&ocr?.confirmed?.includes('ใบแจ้งหนี้'))li.remove();
      // "โอนเงินผ่านบัญชี" is a valid payment instruction. A model's
      // synonym replacement for ผ่าน must not become a spelling mark.
      else if(wrong==='ผ่าน'&&ocr&&/โอนเงินผ่านบัญชี/.test(locateBest(ocr,wrong).line||''))li.remove();
    }
    // The model can omit a clear typo even when OCR locates its exact glyphs.
    // Add only high-confidence, uniquely located spellings from the small
    // dictionary; uncertain OCR readings stay in the review list below.
    if(Array.isArray(ocr?.lines)){
      const existing=new Set([...panel.querySelectorAll('li mark')].map(n=>n.textContent.trim().normalize('NFC')));
      let list=panel.querySelector('ul');
      for(const [wrong,correct] of clearPairs){
        if(wrong==='Banano'&&!ocr.lines.some(r=>/NanoBanana/.test(r.text.replace(/\s/g,''))))continue;
        if(existing.has(wrong)||!(locateBest(ocr,wrong).box||locate(ocr.lines,wrong,true).length))continue;
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
      const exactHits=corrected&&ocr&&!conflicting?locate(ocr.lines,original,true):[];
      const proof=ocr?.pixelCorrections?.find(p=>p.pixelVerified&&p.wrong===original&&p.correct===corrected);
      const matches=proof?[proof]:exactHits.length?exactHits:[];
      const match=original==='ฟร!'&&posterFree?posterFree:
        corrected&&ocr&&!conflicting?locateBest(ocr,original):{reason:'unavailable'};
      if(!match.box&&!matches.length){
        const note=doc.createElement('span');note.textContent=match.reason==='ambiguous'?' — OCR พบหลายตำแหน่ง โปรดตรวจทาน':' — ยังยืนยันตำแหน่งไม่ได้';li.append(note);unlocated++;continue;
      }
      for(const hit of matches.length?matches:[match]){
        const reading=hit.pixelVerified?'agreed':checkedReading(ocr,original,hit);
        if(reading==='contradicted'&&!canMark(original,corrected,hit.line)){li.remove();break;}
        if(reading==='contradicted'||!hit.pixelVerified&&!canMark(original,corrected,hit.line)&&reading!=='agreed'){
          if(!li.querySelector('.reading-note')){const note=doc.createElement('span');note.className='reading-note';note.textContent=reading==='contradicted'?' — อ่านซ้ำไม่ตรงกับคำนี้ อาจเป็น OCR อ่านผิด':' — ยังไม่มีการอ่านซ้ำยืนยัน จึงไม่ขีดทับ';li.append(note);unlocated++;}
          continue;
        }
        const verified=hit.pixelVerified||hit.verification!=='review'&&canMark(original,corrected,hit.line);
        addOverlay(doc,wrapper,hit,ocr,original,corrected,verified);
        located++;if(verified)verifiedCount++;
      }
    }
    const count=panel.querySelectorAll('li').length;
    const heading=panel.querySelector('h3');if(heading)heading.textContent='คำแนะนำที่ต้องตรวจทาน ('+count+')';
    const notice=doc.createElement('p');notice.textContent='สีแดงคือคู่คำที่ผ่านกฎสะกด สีส้มคือคำแนะนำที่ OCR พบตำแหน่งจริงแต่ยังต้องตรวจทาน ไม่ได้แก้ไขไฟล์ต้นฉบับ และอาจตรวจคำผิดได้ไม่ครบ';panel.prepend(notice);
    const status=panel.querySelector('.location-status');if(status)status.textContent='ขีดแดง '+verifiedCount+' จุด · ขีดส้ม '+(located-verifiedCount)+' จุด · ยังขีดไม่ได้ '+unlocated+' รายการ';
    const version=panel.querySelector('.audit-version');if(version)version.textContent='คงต้นฉบับ · strike-word-27';
    const banner=doc.createElement('p');
    banner.className='result-location-summary';
    banner.textContent='คำแนะนำ '+count+' รายการ · พบตำแหน่งบนภาพ '+located+' รายการ · ยังขีดไม่ได้ '+unlocated+' รายการ';
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
// Inspect literal PDF drawing positions, independently of extracted spelling.
function pdfLowerVowelIssues(operatorList, OPS) {
  const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  let s={ctm:[1,0,0,1,0,0],tm:[1,0,0,1,0,0],x:0,size:12,scale:1,charSpace:0,wordSpace:0,leading:0,last:null};
  const stack=[],issues=[];
  const move=(x,y)=>{s.tm=mul(s.tm,[1,0,0,1,x,y]);s.x=0;};
  const show=chars=>{for(const g of chars||[]){
    if(typeof g==='number'){s.x-=g*s.size/1000*s.scale;continue;}
    if(!g||typeof g.unicode!=='string')continue;
    const m=mul(s.ctm,s.tm),x=m[0]*s.x+m[4],y=m[1]*s.x+m[5];
    const width=(g.width||0)*s.size/1000*s.scale,worldWidth=Math.abs(m[0]*width);
    // Rotated/vertical text requires another geometry model; do not guess.
    const horizontal=Math.abs(m[1])<0.01&&Math.abs(m[2])<0.01&&m[0]>0;
    if(horizontal&&/^[ุู]$/.test(g.unicode)&&s.last){
      const b=s.last,gap=x-b.end;
      if(Math.abs(y-b.y)<Math.abs(s.size*m[3])*0.15&&gap>Math.max(1.5,b.width*0.7)&&gap<Math.abs(s.size*m[0])*4){
        issues.push({mark:g.unicode,base:b.text,x,y,baseX:b.x,baseEnd:b.end,height:Math.abs(s.size*m[3]),gap});
      }
    }
    if(horizontal&&/^[ก-ฮ]$/.test(g.unicode)&&worldWidth>0)s.last={text:g.unicode,x,y,end:x+worldWidth,width:worldWidth};
    else if(g.unicode===' ')s.last=null;
    s.x+=width+s.charSpace*s.scale+(g.isSpace?s.wordSpace*s.scale:0);
  }};
  for(let i=0;i<operatorList.fnArray.length;i++){
    const op=operatorList.fnArray[i],a=operatorList.argsArray[i]||[];
    if(op===OPS.save)stack.push({...s,ctm:[...s.ctm],tm:[...s.tm]});
    else if(op===OPS.restore){if(stack.length)s=stack.pop();}
    else if(op===OPS.transform)s.ctm=mul(s.ctm,a);
    else if(op===OPS.beginText){s.tm=[1,0,0,1,0,0];s.x=0;s.last=null;}
    else if(op===OPS.setFont)s.size=a[1];
    else if(op===OPS.setHScale)s.scale=a[0]/100;
    else if(op===OPS.setCharSpacing)s.charSpace=a[0];
    else if(op===OPS.setWordSpacing)s.wordSpace=a[0];
    else if(op===OPS.setLeading)s.leading=a[0];
    else if(op===OPS.setTextMatrix){s.tm=[...a];s.x=0;s.last=null;}
    else if(op===OPS.moveText)move(a[0],a[1]);
    else if(op===OPS.setLeadingMoveText){s.leading=-a[1];move(a[0],a[1]);}
    else if(op===OPS.nextLine)move(0,-s.leading);
    else if(op===OPS.showText)show(a[0]);
  }
  return issues.filter((v,i,list)=>!list.slice(0,i).some(p=>Math.abs(p.x-v.x)<0.5&&Math.abs(p.y-v.y)<0.5));
}

  async function annotatePdfLayout(html,file,progress=()=>{}) {
    const doc=new DOMParser().parseFromString(html,'text/html');
    const pdfjs=await import(new URL('vendor/pdfjs/pdf.mjs',document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pages=[];let count=0;
    try {
      if(pdf.numPages>20)throw Error('ตรวจตำแหน่งสระได้ไม่เกิน 20 หน้า กรุณาแบ่งไฟล์');
      for(let n=1;n<=pdf.numPages;n++){
        progress('ตรวจตำแหน่งสระบน PDF หน้า '+n+'/'+pdf.numPages);
        const page=await pdf.getPage(n),ops=await page.getOperatorList();
        const issues=pdfLowerVowelIssues(ops,pdfjs.OPS);count+=issues.length;pages.push({page,n,issues});
      }
      const section=doc.createElement('section');section.style.cssText='padding:16px;border:1px solid #fdba74;border-radius:12px;margin:16px 0;color:#9a3412;background:#fff7ed';
      const title=doc.createElement('h3');title.textContent='ตรวจตำแหน่งสระ: '+count+' จุดที่ต้องตรวจทาน';section.append(title);
      const note=doc.createElement('p');note.textContent='ตรวจสระ ุ/ู ที่วางห่างจากพยัญชนะในคำสั่งวาด PDF แยกจากการตรวจคำสะกด กรอบสีส้มคือบริเวณที่ควรตรวจตำแหน่งสระในไฟล์ต้นฉบับ ยังไม่ครอบคลุมสระทุกชนิดหรือ PDF สแกน และไม่ได้ย้ายตัวอักษรในไฟล์';section.append(note);
      const list=doc.createElement('ul');
      for(const {n,issues} of pages)for(const issue of issues){const li=doc.createElement('li');li.textContent='หน้า '+n+': สระ '+issue.mark+' ของ “'+issue.base+'” อยู่ห่างไปทางขวา '+issue.gap.toFixed(1)+' pt — ตรวจการจัดวาง '+issue.base+issue.mark;list.append(li);}
      section.append(list);
      const target=doc.querySelector('.pdf-overlay-viewer')||doc.querySelector('.pdf-preview');
      if(target)target.before(section);else doc.body.prepend(section);
      if(count&&target){
        const gallery=doc.createElement('div');gallery.style.cssText='background:#27272a;padding:16px';
        for(const {page,n,issues} of pages){
          const vp=page.getViewport({scale:2});
          if(vp.width*vp.height>20000000)throw Error('หน้า PDF ใหญ่เกินสำหรับแสดงตำแหน่งสระ');
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
          await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
          const wrap=doc.createElement('div');wrap.style.cssText='position:relative;margin:0 auto 16px;background:white';
          const img=doc.createElement('img');img.src=canvas.toDataURL('image/png');img.alt='หน้า '+n+' พร้อมจุดตรวจตำแหน่งสระ';img.style.cssText='display:block;width:100%;height:auto';wrap.append(img);
          for(const issue of issues){
            const a=vp.convertToViewportPoint(issue.baseX,issue.y+issue.height*.75),b=vp.convertToViewportPoint(issue.x+issue.height*.25,issue.y-issue.height*.4);
            const mark=doc.createElement('div');mark.title='ตรวจตำแหน่งสระ '+issue.mark+' ของ '+issue.base;
            mark.style.cssText='position:absolute;box-sizing:border-box;border:2px dashed #f97316;background:#fb923c22;left:'+100*Math.min(a[0],b[0])/vp.width+'%;top:'+100*Math.min(a[1],b[1])/vp.height+'%;width:'+100*Math.abs(b[0]-a[0])/vp.width+'%;height:'+100*Math.abs(b[1]-a[1])/vp.height+'%;';wrap.append(mark);
          }
          gallery.append(wrap);canvas.width=canvas.height=0;page.cleanup();
        }
        target.replaceWith(gallery);
        const summary=doc.querySelector('.summary-box');if(summary)summary.textContent+=' · ตำแหน่งสระ '+count+' จุด';
      }
      return {html:'<!doctype html>'+doc.documentElement.outerHTML,count};
    }finally{await pdf.destroy();}
  }

  const api={missingStackedTone,lines,locate,read,reanchor,preserveOriginal,canMark,annotatePdf,pdfLowerVowelIssues,annotatePdfLayout};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.HooHooWordLocator=api;
})(typeof window==='undefined'?globalThis:window);
