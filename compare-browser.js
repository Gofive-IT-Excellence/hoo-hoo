/* Comparison runs locally; no uploaded document leaves the browser on this route. */
(function(root){
  'use strict';
  const union=bs=>[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  async function page(file){
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      const pdf=await (await loadPdfJs()).getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
      try{
        if(pdf.numPages!==1)throw Error('รุ่นทดลองรองรับ PDF หน้าเดียว กรุณาแยกหน้าก่อนตรวจ ไม่มีการข้ามหน้าที่เหลือ');
        const p=await pdf.getPage(1),v=p.getViewport({scale:1});
        const vp=p.getViewport({scale:1800/Math.max(v.width,v.height)}),c=canvas(Math.ceil(vp.width),Math.ceil(vp.height));
        await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c;
      }finally{await pdf.destroy();}
    }
    const im=await createImageBitmap(file);
    try{if(im.width*im.height>20000000)throw Error('ภาพใหญ่เกิน 20 ล้านพิกเซล กรุณาลดขนาดก่อนตรวจ');
      const c=canvas(im.width,im.height);c.getContext('2d').drawImage(im,0,0);return c;
    }finally{im.close();}
  }
  function candidates(a,b){
    if(a.width!==b.width||a.height!==b.height)throw Error('ขนาดหน้า A/B ต่างกัน รุ่นนี้ยังจัดแนวอัตโนมัติไม่ได้ กรุณาใช้ขนาดหน้าเดียวกัน');
    const w=a.width,h=a.height,pa=a.getContext('2d').getImageData(0,0,w,h).data,pb=b.getContext('2d').getImageData(0,0,w,h).data;
    const rows=[];let cur=null;
    for(let y=0;y<h;y++){
      let lo=w,hi=0,n=0;
      for(let x=0;x<w;x++){const i=(y*w+x)*4;if(Math.max(Math.abs(pa[i]-pb[i]),Math.abs(pa[i+1]-pb[i+1]),Math.abs(pa[i+2]-pb[i+2]))>35){lo=Math.min(lo,x);hi=x+1;n++;}}
      if(n>=3){if(cur&&y-cur[3]<=8){cur[0]=Math.min(cur[0],lo);cur[2]=Math.max(cur[2],hi);cur[3]=y+1;}else{cur=[lo,y,hi,y+1];rows.push(cur);}}
    }
    return rows.filter(b=>(b[2]-b[0])*(b[3]-b[1])>=18);
  }
  function symbols(data,scale,ox=0,oy=0,pad=0){
    const out=[];
    for(const bl of data.blocks||[])for(const p of bl.paragraphs||[])for(const l of p.lines||[])for(const w of l.words||[])for(const s of w.symbols||[]){
      const b=s.bbox;if(!b)continue;
      for(const ch of s.text||'')if(/[\p{L}\p{M}\p{N}]/u.test(ch))out.push({ch,box:[ox+(b.x0-pad)/scale,oy+(b.y0-pad)/scale,ox+(b.x1-pad)/scale,oy+(b.y1-pad)/scale]});
    }return out;
  }
  function edits(a,b){
    const n=a.length,m=b.length;
    // Prefer the complete unchanged suffix when an inserted prefix contains
    // glyphs also present at the beginning of the original word.
    if(m>n&&n&&a.every((c,i)=>c.ch===b[m-n+i].ch))return {spans:[[0,0,0,m-n]],ratio:2*n/(n+m)};
    if(n>m&&m&&b.every((c,i)=>c.ch===a[n-m+i].ch))return {spans:[[0,n-m,0,0]],ratio:2*m/(n+m)};
    if(n*m>2000000)throw Error('ข้อความในบรรทัดมากเกินขีดจำกัด กรุณาแยกเอกสาร');
    const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i].ch===b[j].ch?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
    const spans=[];let i=0,j=0,start=null;
    const flush=()=>{if(start){spans.push([start[0],i,start[1],j]);start=null;}};
    while(i<n||j<m){if(i<n&&j<m&&a[i].ch===b[j].ch){flush();i++;j++;}else{start??=[i,j];if(j>=m||(i<n&&dp[i+1][j]>=dp[i][j+1]))i++;else j++;}}flush();
    const merged=[];for(const s of spans){const p=merged.at(-1);if(p&&s[0]-p[1]<=2&&s[2]-p[3]<=2){p[1]=s[1];p[3]=s[3];}else merged.push(s);}
    return {spans:merged,ratio:2*dp[0][0]/Math.max(1,n+m)};
  }
  function blank(c,b){const [x,y,r,t]=b,d=c.getContext('2d').getImageData(x,y,r-x,t-y).data;let ink=0;for(let i=0;i<d.length;i+=4)if((d[i]+d[i+1]+d[i+2])/3<180)ink++;return ink/(d.length/4)<.003;}
  function tight(c,b){
    let [x0,y0,x1,y1]=b.map(Math.round);x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(c.width,x1);y1=Math.min(c.height,y1);
    if(x1<=x0||y1<=y0)return b;
    const patch=c.getContext('2d').getImageData(x0,y0,x1-x0,y1-y0).data,groups=[];let g=null;
    for(let y=0;y<y1-y0;y++){let count=0;for(let x=0;x<x1-x0;x++){const i=(y*(x1-x0)+x)*4;if((patch[i]+patch[i+1]+patch[i+2])/3<180)count++;}if(count){if(g&&y-g.end<=5){g.end=y;g.count+=count;}else{g={start:y,end:y,count};groups.push(g);}}}
    if(groups.length){const best=groups.sort((a,b)=>b.count-a.count)[0];y1=y0+best.end+1;y0+=best.start;}
    const data=c.getContext('2d').getImageData(0,y0,c.width,y1-y0).data;
    const col=x=>{for(let y=0;y<y1-y0;y++){const i=(y*c.width+x)*4;if((data[i]+data[i+1]+data[i+2])/3<180)return true;}return false;};
    const limit=Math.floor((y1-y0)/2);let left=x0,right=x1;while(left>Math.max(0,x0-limit)&&col(left-1))left--;while(right<Math.min(c.width,x1+limit)&&col(right))right++;
    return [left,y0,right,y1];
  }
  async function compare(fileA,fileB,progress=()=>{}){
    const a=await page(fileA),b=await page(fileB),rows=candidates(a,b),changes=[],uncertain=[],readings=[];
    if(rows.length>100)throw Error('พบความต่างของรูปแบบจำนวนมาก รุ่นนี้ยังเทียบอย่างน่าเชื่อถือไม่ได้');
    let worker,detailWorker;
    const isPDF=/\.pdf$/i.test(fileA.name)||/\.pdf$/i.test(fileB.name);
    try{
      if(rows.length){
        const base=new URL('vendor/tesseract/',document.baseURI).href;
        worker=await Tesseract.createWorker(isPDF?'tha+eng':'tha',1,{workerPath:base+'worker.min.js',corePath:base+'core',langPath:base+'lang',gzip:false});
        async function read(c,box,scale,psm,reader=worker){
          const [x,y,r,t]=box,pad=30,s=canvas(Math.round((r-x)*scale)+pad*2,Math.round((t-y)*scale)+pad*2),ctx=s.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,s.width,s.height);ctx.drawImage(c,x,y,r-x,t-y,pad,pad,s.width-pad*2,s.height-pad*2);
          await reader.setParameters({tessedit_pageseg_mode:String(psm)});
          const {data}=await reader.recognize(s,{}, {text:true,blocks:true});s.width=s.height=0;const ss=symbols(data,scale,x,y,pad);ss.raw=(data.text||'').trim();return ss;
        }
        let full=null;if(!isPDF)full=[await read(a,[0,0,a.width,a.height],.5,11),await read(b,[0,0,b.width,b.height],.5,11)];
        for(let index=0;index<rows.length;index++){
          progress(`กำลังเทียบข้อความ ${index+1}/${rows.length}`);
          const r=rows[index],box=[0,Math.max(0,r[1]-7),a.width,Math.min(a.height,r[3]+7)];
          // An isolated region erased to white is evidence of deletion even
          // when OCR misses a single digit or an English phrase. Test the
          // changed region, not the whole row containing unrelated columns.
          const local=[Math.max(0,r[0]-2),Math.max(0,r[1]-2),Math.min(a.width,r[2]+2),Math.min(a.height,r[3]+2)];
          const emptyA=blank(a,local),emptyB=blank(b,local);
          if(!isPDF&&emptyA!==emptyB){
            detailWorker??=await Tesseract.createWorker('tha+eng',1,{workerPath:base+'worker.min.js',corePath:base+'core',langPath:base+'lang',gzip:false});
            const source=emptyB?a:b,ss=await read(source,local,3,7,detailWorker);
            const label=ss.raw||'(อ่านข้อความไม่ออก — พบความต่างจากภาพ)';
            changes.push({before:emptyB?label:'',after:emptyA?label:'',type:emptyB?'delete':'insert',boxB:tight(source,r),evidence:'visual-blank-region'});
            continue;
          }
          const pick=ss=>ss.filter(s=>Math.min(s.box[3],box[3])-Math.max(s.box[1],box[1])>.3*Math.min(s.box[3]-s.box[1],box[3]-box[1]));
          let aa=full?pick(full[0]):await read(a,box,3,7),bb=full?pick(full[1]):await read(b,box,3,7);
          const ba=blank(a,box),bbk=blank(b,box);if(ba)aa=[];if(bbk)bb=[];
          if(!aa.length&&!bb.length&&!ba&&!bbk){uncertain.push({before:'อ่านไม่ออก',after:'อ่านไม่ออก',region:box});continue;}
          readings.push([aa.map(s=>s.ch).join(''),bb.map(s=>s.ch).join('')]);
          const diff=edits(aa,bb);
          for(const [i,j,k,l] of diff.spans){const ac=aa.slice(i,j),bc=bb.slice(k,l),before=ac.map(c=>c.ch).join(''),after=bc.map(c=>c.ch).join('');
            const replace=ac.length&&bc.length;
            const reliable=(ba||bbk)?Math.max(ac.length,bc.length)>2:(!isPDF&&replace?ac.length>=2&&bc.length>=2&&diff.ratio>=.65:!replace&&Math.max(ac.length,bc.length)>=2&&diff.ratio>=.85);
            if(!reliable){uncertain.push({before,after,region:box});continue;}
            const boxA=ac.length?union(ac.map(c=>c.box)):null,boxB=bc.length?union(bc.map(c=>c.box)):null;
            let display=boxB?tight(b,boxB):boxA;
            // OCR boxes can overlap the following unchanged glyph. Never let
            // an inserted/replaced span extend into that neighbouring word.
            if(isPDF&&boxB&&bb[l]&&bb[l].box[0]>display[0])display[2]=Math.min(display[2],bb[l].box[0]);
            let contextA='';
            // A diff beginning with a Thai combining mark is not a word.
            // Re-read surrounding source pixels instead of presenting that
            // fragment as a correction. Do not substitute a dictionary word.
            if(!isPDF&&/^[\p{M}]/u.test(before)){
              const anchor=union([r,...ac.map(c=>c.box),...bc.map(c=>c.box)]),height=anchor[3]-anchor[1];
              const context=[Math.max(0,anchor[0]-3*height),Math.max(0,anchor[1]-8),Math.min(a.width,anchor[2]+height),Math.min(a.height,anchor[3]+8)];
              detailWorker??=await Tesseract.createWorker('tha+eng',1,{workerPath:base+'worker.min.js',corePath:base+'core',langPath:base+'lang',gzip:false});
              const reread=await read(a,context,1,7,detailWorker);
              contextA=reread.raw;
            }
            changes.push({before,after,contextA,type:!ac.length?'insert':!bc.length?'delete':'replace',boxB:display});
          }
        }
      }
      return {version:'compare-browser-3',width:b.width,height:b.height,changes,uncertain,readings,imageA:a.toDataURL('image/png'),imageB:b.toDataURL('image/png')};
    }finally{if(worker)await worker.terminate();if(detailWorker)await detailWorker.terminate();a.width=a.height=b.width=b.height=0;}
  }
  function render(result){
    const {width:w,height:h,changes,uncertain}=result;
    const description=c=>c.contextA?`ข้อความต้นฉบับ A: ${esc(c.contextA)} — B มีอักขระเปลี่ยนหรือหาย (ดูตำแหน่งวง)`:`${esc(c.before||'(ไม่มีข้อความ)')} → ${esc(c.after||'(ข้อความหาย)')}`;
    const boxes=changes.map((c,i)=>{const [x,y,r,t]=c.boxB;return `<rect x="${x-2}" y="${y-2}" width="${r-x+4}" height="${t-y+4}" fill="none" stroke="#ee2222" stroke-width="3"/><text x="${x}" y="${Math.max(14,y-6)}" fill="#c00000" font-size="16">${i+1}</text>`;}).join('');
    return `<div style="font:16px system-ui"><h3>ผลเปรียบเทียบ: วงตำแหน่งในไฟล์ B (${changes.length})</h3><p>ข้อความหาย: วงช่องว่างใน B อ้างตำแหน่งจาก A · ผล OCR ควรตรวจเทียบต้นฉบับ</p><svg viewBox="0 0 ${w} ${h}" style="width:100%"><image href="${result.imageB}" width="${w}" height="${h}"/>${boxes}</svg><ol>${changes.map(c=>`<li>${description(c)}</li>`).join('')}</ol><p>${uncertain.length?'ยังมี '+uncertain.length+' รายการที่อ่านไม่แน่ใจ ไม่ใช่ผลยืนยันว่าเอกสารเหมือนกัน':changes.length?'ตรวจพบข้อความเปลี่ยน':'ไม่พบความต่างภายใต้เกณฑ์การตรวจรุ่นนี้'}</p><details><summary>รายการที่ต้องตรวจเพิ่มเติม (${uncertain.length})</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(uncertain,null,2))}</pre></details><details><summary>ดูไฟล์ A ต้นฉบับ</summary><img src="${result.imageA}" style="width:100%"></details><small>compare-browser-3 · ตรวจในเบราว์เซอร์ · รองรับหน้าเดียวขนาดตรงกัน</small></div>`;
  }
  root.HooHooCompare={compare,render,candidates,edits};
})(window);
