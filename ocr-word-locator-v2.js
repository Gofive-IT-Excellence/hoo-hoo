/* Literal OCR coordinates only. Never interpolate positions across a paragraph. */
(function(root){
  'use strict';
  const valid=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>b[0]&&b[3]>b[1];
  const union=bs=>[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];
  // Narrow spelling rules; never treat an arbitrary AI replacement as verified.
  const clearPairs=new Map(Object.entries({'อนุญาติ':'อนุญาต','ประมวณผล':'ประมวลผล','บริสัท':'บริษัท','ข้อมุล':'ข้อมูล','ข้อตวาม':'ข้อความ','บันทก':'บันทึก','ลกษณะ':'ลักษณะ','กำนด':'กำหนด','กํานด':'กำหนด','หน่ยว':'หน่วย','รายล่ะเอียด':'รายละเอียด','ทังหมด':'ทั้งหมด','ปรากฎ':'ปรากฏ','สังเกตุ':'สังเกต','คำนวน':'คำนวณ','บอกล':'บอกลา','วิดีโด':'วิดีโอ','พรีเซนต':'พรีเซนต์','Goegle':'Google','วิดิทัศน์':'วีดิทัศน์','วิดีทัศน์':'วีดิทัศน์','วีดีทัศน์':'วีดิทัศน์','ประศบภัย':'ประสบภัย','ชวย':'ช่วย','ผู':'ผู้','ทวม':'ท่วม','ภากไต้':'ภาคใต้','ฝรัง':'ฝรั่ง','ได':'ได้','อยา':'อย่า','ประโยบ':'ประโยค','ทก':'ทุก','จรง':'จริง','จินตนากาน':'จินตนาการ','Banano':'Banana','เงน':'เงิน','คณ':'คุณ','สามารด':'สามารถ','สถานการณ':'สถานการณ์','รถยนต':'รถยนต์','ประกน':'ประกัน','ชอย':'ชอบ','อินโฟกราฟฟิก':'อินโฟกราฟิก','บ้าล':'บ้าน','ประหยด':'ประหยัด','ประหยับ':'ประหยัด','ประหยัม':'ประหยัด','ง่าน':'ง่าย'}));
  // Require nearby text where the OCR token can also occur in valid usage.
  const contextPairs = new Map([
    ['ละบาย', {correct: 'ระบาย', before: /(?:^|ยังพอ)$/, after: /^ได้/}],
    ['ชวง', {correct: 'ช่วง', before: /^$/, after: /^นี้/}],
    // OCR can drop the existing tone mark in the longer phrase ส่วนบุคคลอื่น.
    ['ข้อมูร', {correct: 'ข้อมูล', before: /(?:^|แต่)$/, after: /^(?:ร[ั่]*ว|ของ|บริษัท|$)/}],
    ['ขอมูล', {correct: 'ข้อมูล', before: /(?:^|ถ้า|ต่ถ้า|แต่ถ้า)$/, after: /^บริษัท/}],
    ['ปองกัน', {correct: 'ป้องกัน', before: /(?:^|ร[ั่]*ว)$/, after: /^(?:ได้|ยาก|ข้อมูล|$)/}],
    ['ได่', {correct: 'ได้', before: /ไม่$/, after: /^$/}],
    ['ทา', {correct: 'ทำ', before: /(?:ไหน|โหน|งาน)$/, after: /^ซ[้ํ]+[ำา]/}],
    ['แตละ', {correct: 'แต่ละ', before: /(?:^|ของ|ใน|ให้)$/, after: /^(?:ทีม|คน|วัน|กลุ่ม|รายการ|ครั้ง)/}],
    ['เทานั้น', {correct: 'เท่านั้น', before: /(?:^|[A-Za-z]|นี้|เดียว|ได้)$/, after: /^$/}],
    ['เลล', {correct: 'เลย', before: /(?:ช่วย|ได้|ทันที)$/, after: /^$/}],
    ['ลองรับ', {correct: 'รองรับ', before: /(?:ที่|ระบบ|สามารถ|เพื่อ|ออกแบบมาให้)$/, after: /^(?:การใช้งาน|การทำงาน|ลูกค้า|ผู้ใช้|อุปกรณ์|ไฟล์|ระบบ|ภาษา|ทุก|ได้|$)/}],
    ['เนื้อง', {correct: 'เนื่อง', before: /(?:^|ลดลง)$/, after: /^จาก/}],
    ['เป้น', {correct: 'เป็น', before: /(?:^|ออก|ใช้|จะ|ก็|ไม่|ที่|ให้|ถือว่า)$/, after: /^(?:กระดาษ|หลักฐาน|ส่วน|ไป|ได้|อยู่|$)/}],
    ['เซ่น', {correct: 'เช่น', before: /ใช้กระดาษ$/, after: /^e[-–]?Payment/i}],
    ['ปริมาน', {correct: 'ปริมาณ', before: /(?:^|มี)$/, after: /^การใช้/}],
    ['เช็ก', {correct: 'เช็ค', before: /ช[ำํ]า?ระเงินโดยการใช้$/, after: /^จะถูก/}],
    ['พร้อมเพย', {correct: 'พร้อมเพย์', before: /(?:^|e-?Payment)$/i, after: /^นอก/}],
    ['รัฐบาน', {correct: 'รัฐบาล', before: /เกี่ยวข้องกับ$/, after: /^ด้วย/}],
    ['แต', {correct: 'แต่', before: /(?:^|พิมพ์)$/, after: /^จะต้อง/}],
    ['น้าไป', {correct: 'นำไป', before: /และ$/, after: /^พิมพ์ข้อมูล/}],
    ['น้ำไป', {correct: 'นำไป', before: /และ$/, after: /^พิมพ์ข้อมูล/}],
    ['ภาต', {correct: 'ภาค', before: /ธุรกิจ$/, after: /^เอกชน/}],
    ['ยุกสมัย', {correct: 'ยุคสมัย', before: /(?:^|ทันต่อ)$/, after: /^(?:ที่|$)/}],
    ['ต่อยอดด', {correct: 'ต่อยอด', before: /^$/, after: /^การให้บริการ/}],
    ['การรจัดการ', {correct: 'การจัดการ', before: /(?:^|และ)$/, after: /^ข้อมูล/}],
    ['คอบ', {correct: 'ครอบ', before: /(?:ให้บริการ|บริการ)ที่$/, after: /^(?:คลุม|$)/}],
    ['ต้องกา', {correct: 'ต้องการ', before: /ลูกค้า$/, after: /^(?:จึง|$)/}],
    ['ฟอม', {correct: 'ฟอร์ม', before: /แบบ$/, after: /^ของลูกค้า/}],
    ['ประมวนผล', {correct: 'ประมวลผล', before: /(?:^|ข้อมูลมา)$/, after: /^(?:พร้อม|$)/}],
    ['รายได', {correct: 'รายได้', before: /เพิ่ม$/, after: /^$/}],
    ['นิรภย', {correct: 'นิรภัย', before: /(?:หมวก|กาก)$/, after: /^(?:ท[ีื่]+อุดหู)?$/}],
    ['หน่า', {correct: 'หน้า', before: /^$/, after: /^กากนิรภ/}],
    ['ก่อด', {correct: 'ก่อน', before: /ปลอดภัยไว้$/, after: /^$/}],
    ['อุปกรณ', {correct: 'อุปกรณ์', before: /^$/, after: /^ความปลอดภ/}],
    ['ปลอดภย', {correct: 'ปลอดภัย', before: /ความ$/, after: /^ส่วนบุค/}],
    ['บุคคน', {correct: 'บุคคล', before: /ส่วน$/, after: /^(?:\(PPE\)|$)/i}],
    ['แวนตา', {correct: 'แว่นตา', before: /^$/, after: /^นิ?รภัย/}],
    ['สะทอนแสง', {correct: 'สะท้อนแสง', before: /เสื้อ$/, after: /^$/}],
    ['สวนบุคคล', {correct: 'ส่วนบุคคล', before: /ข[้]?อมูล$/, after: /^(?:ที่|ที|ตาม|ของ|[)"”]|$)/}],
    ['สงเสริม', {correct: 'ส่งเสริม', before: /(?:^|กิจกรรม|การ)$/, after: /^(?:การขาย|$)/}],
    ['รบุ', {correct: 'ระบุ', before: /(?:^|(?:ที่|ที)|รายละเอ[ีิ]?ยดท)$/, after: /^(?:ข[้]?างต[้]?น|ไว้)/}],
    ['เก็บลวบรวม', {correct: 'เก็บรวบรวม', before: /(?:^|ที่|ที|การ)$/, after: /^(?:["”)]|$)/}],
    ['กา', {correct: 'การ', before: /(?:^|ใน)$/, after: /^ค[้ํ]*[ำาํ][้ํ]*ประกัน/}],
    ['สนเชื่อ', {correct: 'สินเชื่อ', before: /ประกัน$/, after: /^เช่าซ[ื้]+อ/}],
    ['สนเซีือ', {correct: 'สินเชื่อ', before: /ประกัน$/, after: /^เช่าซ[ื้]+อ/}],
    ['สนเชซื่อ', {correct: 'สินเชื่อ', before: /ประกัน$/, after: /^เช่าซ[ื้]+อ/}],
    ['ควม', {correct: 'ความ', before: /คุ้มครอง$/, after: /^เป็นส่วนตัว/}],
    ['บทบาบ', {correct: 'บทบาท', before: /^$/, after: /^หน[้า]+ที่ความรับ/}],
    ['หนาที่', {correct: 'หน้าที่', before: /บท[บพ]า[บท]$/, after: /^ความรับ/}],
    ['รับผดชอบ', {correct: 'รับผิดชอบ', before: /ความ$/, after: /^$/}],
    ['สนบสนุน', {correct: 'สนับสนุน', before: /^$/, after: /^(?:กิจกรรม|หน่วยงาน|ให้)/}],
    ['ยังยืน', {correct: 'ยั่งยืน', before: /(?:พัฒนา|อย่าง)$/, after: /^(?:และ|$)/}],
    ['กาตลาด', {correct: 'การตลาด', before: /^$/, after: /^และการ/}],
    ['แหงขัน', {correct: 'แข่งขัน', before: /^(?:กา|การ)ตลาดและการ$/, after: /^\s*$/}],
    ['แขงขัน', {correct: 'แข่งขัน', before: /^(?:กา|การ)ตลาดและการ$/, after: /^\s*$/}],
    ['เทกโนโลยี', {correct: 'เทคโนโลยี', before: /(?:^|เนื่องจาก|ใช้)$/, after: /^(?:สมัยใหม่|ขั้นสูง|ชั้นสูง|การพิมพ์|$)/}],
    ['เปรีย', {correct: 'เปรียบ', before: /ได้$/, after: /^(?:เนื่องจาก|เพราะ|กว่า|$)/}],
    ['หลาหมื่น', {correct: 'หลายหมื่น', before: /(?:^|รวม)$/, after: /^แห่ง/}],
    ['ประเภม', {correct: 'ประเภท', before: /(?:^|พิมพ์|เอกสาร|ใน)$/, after: /^(?:พิมพ์|ต่าง\s*ๆ|$)/}],
    ['โรงพิม', {correct: 'โรงพิมพ์', before: /(?:^|มี|เป็น|นั้น|ของ|ที่|ประเภท)$/, after: /^(?:ขนาด?|ที่|ใน|เอกชน|$)/}],
    ['คุณภาบ', {correct: 'คุณภาพ', before: /(?:^|ประกัน|ตาม|ควบคุม)$/, after: /^(?:งาน|ได้|ของ|$)/}],
    ['บริคาร', {correct: 'บริการ', before: /การให้$/, after: /^ลักษณะนี้/}],
    ['รดับ', {correct: 'ระดับ', before: /2\s*$/, after: /^\s*คือ/}],
    ['ขนาใหญ่', {correct: 'ขนาดใหญ่', before: /โรงพิมพ์$/, after: /^ที่เป็นทั้ง/}],
    ['นอดจากนี้', {correct: 'นอกจากนี้', before: /พร้อมเพย์\s*$/, after: /^\s*รัฐบาล/}],
    ['เอกชล', {correct: 'เอกชน', before: /ภาค$/, after: /^ใช้ระบบ/}],
    ['กาน', {correct: 'การ', before: /(?:^|e-?Policy\s*|ความปลอดภัยใน)$/i, after: /^(?:ออกกรมธรรม์|ท[ำํ]า?งาน)/}],
    ['นายได้', {correct: 'รายได้', before: /เพิ่ม$/, after: /^\s*$/}],
    ['นายแรก', {correct: 'รายแรก', before: /ผู้ให้บริการ$/, after: /^ของประเทศ/}],
    ['ดาร', {correct: 'การ', before: /เนื่องจาก$/, after: /^ให้บริการ/}],
    ['ประคอบการ', {correct: 'ประกอบการ', before: /ผู้$/, after: /^น้อยราย/}]
  ]);
  function matchesSpellingContext(word, text, start) {
    const pair = contextPairs.get(word);
    return !pair || pair.before.test(text.slice(0, start)) &&
      pair.after.test(text.slice(start + word.length));
  }
  function locateContextOccurrences(word, text) {
    let start = text.indexOf(word);
    while (start !== -1) {
      if (matchesSpellingContext(word, text, start)) return true;
      start = text.indexOf(word, start + word.length);
    }
    return false;
  }
  function canMark(original,corrected,line){
    if(clearPairs.get(original)===corrected)return true;
    if(contextPairs.get(original)?.correct===corrected){
      return locateContextOccurrences(original, line);
    }
    if(original==='ผู'&&corrected==='ผู้')return /ผู(?:ป่วย|ถือหุ้น|ใช้งาน|ให้บริการ)/.test(line);
    if(original==='ตอง'&&corrected==='ต้อง')return /(?:ความตองการ|ตองการ|ตองได้รับ)/.test(line);
    if(original==='นบ'&&corrected==='นับ')return /นบ(?:จำนวน|ความถี่|ครั้ง)/.test(line);
    return false;
  }
  const paintedCorrections = new WeakMap();
  function addOverlay(doc,wrapper,match,ocr,original,corrected,verified=true){
    const painted = paintedCorrections.get(wrapper) || [];
    if (painted.some(item => item.correct === corrected && sameInk(item.box, match.box))) return false;
    painted.push({correct:corrected, box:match.box});
    paintedCorrections.set(wrapper, painted);
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
    const glyphHeight=b-y;
    const labelFont=Math.min(16,Math.max(9,glyphHeight*.65));
    const labelHeight=labelFont*1.15;
    const gap=2;
    const roomAbove=Math.min(y,aboveGap);
    const roomBelow=Math.min(ocr.height-b,belowGap);
    const nearImageTop=y<ocr.height*.1;
    const below=!nearImageTop&&roomAbove<labelHeight+gap&&roomBelow>roomAbove;
    wrapper.style.containerType='inline-size';
    const labelSize=(labelFont/ocr.width*100).toFixed(3);
    const strikeSize=glyphHeight/ocr.width*12;
    mark.className=verified?'verified-spelling-mark':'review-spelling-mark';mark.title=(verified?'คำผิดที่ยืนยัน: ':'คำแนะนำให้ตรวจทาน: ')+original+' → '+corrected;
    mark.setAttribute('aria-label',mark.title);
    mark.style.cssText='position:absolute;height:0;background:none;border-top:clamp(1px,'+strikeSize+'cqw,3px) '+(verified?'solid ':'dashed ')+color+';z-index:3;pointer-events:auto;';
    mark.style.left=x/ocr.width*100+'%';mark.style.top=middle/ocr.height*100+'%';
    mark.style.width=(r-x)/ocr.width*100+'%';
    label.className=verified?'verified-spelling-correction':'review-spelling-correction';
    label.textContent='→ '+corrected;label.title=mark.title;label.setAttribute('aria-label',mark.title);
    label.style.cssText='position:absolute;z-index:4;color:'+color+';font:700 clamp(9px,'+labelSize+'cqw,16px)/1.15 Arial,Tahoma,sans-serif;white-space:nowrap;background:transparent;border:0;padding:0;box-shadow:none;-webkit-text-stroke:1px #fff;paint-order:stroke fill;text-shadow:0 1px 1px #fff;transform:translate(-50%,'+(below?'0':'-100%')+');pointer-events:auto;';
    label.style.left=(x+r)/2/ocr.width*100+'%';label.style.top=below
      ? (b+gap)/ocr.height*100+'%'
      : 'max('+Math.max(0,y-gap)/ocr.height*100+'%, clamp(10.35px,'+(Number(labelSize)*1.15)+'cqw,18.4px))';
    if (wrapper.dataset.correctOnHover === 'true') {
      mark.classList.add('document-hover-mark');
      mark.title = corrected; mark.dataset.correction = corrected;
      mark.tabIndex = 0; mark.setAttribute('aria-label',original+' → '+corrected);
      mark.style.top = y/ocr.height*100+'%';
      mark.style.height = (b-y)/ocr.height*100+'%';
      mark.style.borderTop = '0';
      mark.style.background = 'rgba(239,68,68,0.28)';
      mark.style.borderRadius = '2px';
      mark.style.cursor = 'help';
      wrapper.append(mark);
      return true;
    }
    wrapper.append(mark,label);
    return true;
  }
  // Latin OCR tokens need complete letter boundaries too: Sourc is not
  // a separate word inside Source. Keep CamelCase label boundaries usable.
  function completeLatinSpan(text, start, end) {
    const letter = ch => !!ch && /[A-Za-z]/.test(ch);
    const camel = (a,b) => /[a-z]/.test(a || '') && /[A-Z]/.test(b || '');
    return !(letter(text[start]) && letter(text[start-1]) && !camel(text[start-1],text[start])) &&
      !(letter(text[end-1]) && letter(text[end]) && !camel(text[end-1],text[end]));
  }

  function startsAtThaiWordBoundary(text, start, word) {
    if (!/^[ก-๙]/u.test(word) || !/[ก-๙]/u.test(text[start-1] || '') ||
        clearPairs.has(word) || contextPairs.has(word)) return true;
    if (typeof Intl.Segmenter !== 'function') return false;
    return [...new Intl.Segmenter('th', {granularity:'word'}).segment(text)]
      .some(part => part.index === start);
  }

  function paddleRegionMatch(ocr, original) {
    const normalize = text => String(text).normalize('NFC').replace(/\s/g, '');
    const word = normalize(original);
    if (!word) return null;
    const matches = [];
    for (const region of ocr?.paddleRegions || []) {
      if (!valid(region.box)) continue;
      let start = region.text.indexOf(original);
      while (start >= 0) {
        const end = start + original.length;
        // A following vowel/tone mark belongs to this glyph. Do not match
        // ได inside the already correct ได้ (or any equivalent partial word).
        if (!/^[\p{M}]/u.test(region.text.slice(end)) && completeLatinSpan(region.text,start,end)) matches.push({region, start, end});
        start = region.text.indexOf(original, start + Math.max(1, original.length));
      }
    }
    if (matches.length !== 1) return null;
    const {region, start, end} = matches[0];
    const characters = (region.characters || []).filter(g => g.start < end && g.end > start);
    const wordBox = start >= 0 && characters[0]?.start === start && characters.at(-1)?.end === end
      ? union(characters.map(g => g.box).filter(valid)) : null;
    return {...region, wordBox, start};
  }

  function scopeCorrection(ocr, li) {
    const raw = li.getAttribute('data-ocr-region-indices');
    if (raw === null) return ocr;
    let indices;
    try { indices = JSON.parse(raw); } catch { indices = []; }
    const regions = Array.isArray(indices) ? indices.filter(Number.isInteger)
      .map(index => ocr.paddleRegions?.[index]).filter(region => valid(region?.box)) : [];
    const within = hit => valid(hit.box) && regions.some(region => sameInk(hit.box, region.box));
    const rows = values => (values || []).filter(row => {
      const glyphs = (row.glyphs || []).filter(g => valid(g.box));
      return glyphs.length && within({box: union(glyphs.map(g => g.box))});
    });
    return {...ocr, paddleRegions: regions, lines: rows(ocr.lines),
      alternativeLines: rows(ocr.alternativeLines), refinedLines: rows(ocr.refinedLines),
      validationLines: rows(ocr.validationLines), pixelCorrections: (ocr.pixelCorrections || []).filter(within)};
  }

  // An OCR/model split inside a known spelling error is not another word.
  // For example รด in สามารด must not create รด → รอด alongside สามารถ.
  function isNestedSpellingSuggestion(ocr, word) {
    if (!word) return false;
    const rows = ocr?.paddleRegions?.length ? ocr.paddleRegions : (ocr?.lines || []);
    const occurrences = [];
    for (const row of rows) {
      let start = row.text.indexOf(word);
      while (start >= 0) {
        const nested = [...clearPairs.keys()].some(parent => {
          if (parent.length <= word.length || !parent.includes(word)) return false;
          let at = row.text.indexOf(parent);
          while (at >= 0) {
            if (at <= start && at + parent.length >= start + word.length) return true;
            at = row.text.indexOf(parent, at + 1);
          }
          return false;
        });
        occurrences.push(nested);
        start = row.text.indexOf(word, start + word.length);
      }
    }
    return occurrences.length > 0 && occurrences.every(Boolean);
  }

  const validFunctionWords = new Set('ที่ และ หรือ ซึ่ง ใน ของ ให้ ได้ เป็น จะ แต่ กับ จาก โดย เมื่อ นั้น นี้ ละ ล่ะ นะ น่ะ คะ ค่ะ ครับ'.split(' '));
  function changesValidFunctionWord(wrong, correct) {
    if (wrong === correct) return false;
    if (validFunctionWords.has(wrong)) return true;
    let start = 0, endWrong = wrong.length, endCorrect = correct.length;
    while (start < Math.min(endWrong, endCorrect) && wrong[start] === correct[start]) start++;
    while (endWrong > start && endCorrect > start && wrong[endWrong - 1] === correct[endCorrect - 1]) {endWrong--; endCorrect--;}
    return validFunctionWords.has(wrong.slice(start, endWrong));
  }

  // The model may quote a whole sentence around a one-letter edit. Use the
  // corrected text's word boundaries, never the entire quoted OCR region.
  const canonicalThaiReading = text => String(text).normalize('NFC').replace(/ำ/g, 'ํา');

  function correctionWordSpan(wrong, correct) {
    if (!wrong || !correct || canonicalThaiReading(wrong).replace(/[\sๆ\p{P}]/gu, '') === 'นามสกุล' ||
        canonicalThaiReading(wrong) === canonicalThaiReading(correct) ||
        canonicalThaiReading(wrong).replace(/[\sๆ\p{P}]/gu, '') === canonicalThaiReading(correct).replace(/[\sๆ\p{P}]/gu, '')) return null;
    // Trusted spelling pairs may contain several Thai dictionary segments.
    if (clearPairs.get(wrong) === correct) return {wrong, correct};
    if (typeof Intl.Segmenter !== 'function') return null;
    let start = 0, oldEnd = wrong.length, newEnd = correct.length;
    while (start < Math.min(oldEnd, newEnd) && wrong[start] === correct[start]) start++;
    while (oldEnd > start && newEnd > start && wrong[oldEnd-1] === correct[newEnd-1]) {oldEnd--;newEnd--;}
    const words = [...new Intl.Segmenter('th', {granularity:'word'}).segment(correct)];
    if (words.filter(part => part.isWordLike).length === 1 && wrong.length <= 32 && correct.length <= 32 &&
        !/\s/.test(wrong) && !/\s/.test(correct)) return {wrong, correct};
    const touched = words.filter(part => part.isWordLike && (newEnd > start
      ? part.index < newEnd && part.index + part.segment.length > start
      : part.index <= start && part.index + part.segment.length >= start));
    // Several changed words are a rewrite, not a single spelling mark.
    if (touched.length !== 1) return null;
    const word = touched[0];
    const from = Math.min(start, word.index);
    const to = Math.max(newEnd, word.index + word.segment.length);
    const oldTo = wrong.length - (correct.length - to);
    const original = wrong.slice(from, oldTo), replacement = correct.slice(from, to);
    if (!original || !replacement || original.length > 32 || replacement.length > 32 ||
        /\s/.test(original) || /\s/.test(replacement) ||
        /^[\p{M}]/u.test(original) || /^[\p{M}]/u.test(replacement) ||
        /^[\p{M}]/u.test(wrong.slice(oldTo))) return null;
    return {wrong:original, correct:replacement};
  }

  function preservesPromptSpelling(ocr, original, corrected) {
    // เด็ด is valid in "Prompt เด็ด". OCR may omit เ, but replacing
    // the phrase with เด็ก changes its meaning rather than fixing spelling.
    if (!['เด็ด', 'ด็ด'].includes(original) || corrected !== 'เด็ก') return false;
    const sources = [ocr?.lines, ocr?.validationLines, ocr?.paddleRegions];
    return sources.some(rows => Array.isArray(rows) &&
      /Prompt(?:เด็ด|ด็ด)/i.test(rows.map(row => row.text || '').join('').replace(/\s/g, '')));
  }

  // Sara am can be one character (ำ) or nikhahit + sara aa (ํา).
  // Compare equivalent readings while retaining each original glyph offset.
  function equivalentReadingSpans(text, word) {
    const offsets=[];let expanded='',offset=0;
    for (const ch of text) {
      const value=ch==='ำ'?'ํา':ch;
      expanded+=value;
      for(let i=0;i<value.length;i++)offsets.push({start:offset,end:offset+ch.length});
      offset+=ch.length;
    }
    const needle=canonicalThaiReading(word),matches=[];
    if(!needle)return matches;
    let at=expanded.indexOf(needle);
    while(at>=0){
      const last=at+needle.length-1,start=offsets[at].start,end=offsets[last].end;
      if((at===0||offsets[at-1].end<=start)&&
          (last===offsets.length-1||offsets[last+1].start>=end)) matches.push({start,end});
      at=expanded.indexOf(needle,at+needle.length);
    }
    return matches;
  }

  function correctedReadingAtRegion(ocr, corrected, region) {
    if (!region || !corrected) return false;
    for (const row of [...(ocr.lines || []), ...(ocr.validationLines || [])]) {
      if (row.confidence < 85) continue;
      for (const {start,end} of equivalentReadingSpans(row.text,corrected)) {
        const glyphs = row.glyphs.filter(g => g.start < end && g.end > start);
        if (glyphs[0]?.start === start && glyphs.at(-1)?.end === end && completeLatinSpan(row.text,start,end)) {
          const box = union(glyphs.map(g => g.box));
          const target = valid(region.wordBox) ? region.wordBox : region.box;
          if (sameInk(box, target)) return true;
        }
      }
    }
    return false;
  }

  function addPaddleReview(doc, wrapper, region, ocr, original, corrected, wordMatch) {
    const wordLocated = valid(wordMatch?.box) && sameInk(wordMatch.box, region.box);
    const placement = wordLocated ? wordMatch : valid(region.wordBox)
      ? {box:region.wordBox, line:region.text} : null;
    if (!placement) return null;
    if (!addOverlay(doc, wrapper, placement, ocr, original, corrected, false)) return 'duplicate';
    const label = wrapper.lastElementChild;
    const mark = label.previousElementSibling;
    const scope = 'ตำแหน่งระดับคำ';
    const title = original + ' → ' + corrected + ' — ' + scope + ' โปรดตรวจทาน';
    mark.classList.add('paddle-region-review');
    label.classList.add('paddle-region-review');
    mark.style.borderTopColor = '#dc2626';
    mark.style.borderTopStyle = 'solid';
    label.style.color = '#dc2626';
    for (const element of [mark, label]) {
      element.title = title;
      element.setAttribute('aria-label', title);
    }
    return true;
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
        if(word==='คณ'&&!/^คณ(?:สามารถ|สามารด)/.test(row.text.slice(at))||word==='ชอย'&&!/ไม่$/.test(row.text.slice(0,at))||word==='ทก'&&!/^ทกเรื/.test(row.text.slice(at))||word==='ได'&&!/^ได(?:ยิน|ตาม)/.test(row.text.slice(at))||word==='อยา'&&!/^อยาเช(?:ื่อ|อ)/.test(row.text.slice(at))||word==='ผู'&&!/^ผู(?:ประ[สศ]บภัย|ป่วย|ใช้งาน|ถือหุ้น)/.test(row.text.slice(at))||word==='ชวย'&&!/^ชวย(?:เหลือ|สรุป|ตรวจ|แก้)/.test(row.text.slice(at))){from=at+word.length;continue;}
        const end=at+word.length,gs=row.glyphs.filter(g=>g.end>at&&g.start<end);
        // A complete รถยนต์, or a longer compound, must not match this suffix rule.
        if(word==='รถยนต'&&!/^(?:$|[\s.,:;!?()]|และไม่เกี่ยวข้อง|การปฏิบัติ)/u.test(row.text.slice(end))){
          from=end;continue;
        }
        // Partial glyphs and combining marks belonging to the next character
        // cannot be treated as reliable word boundaries.
        // Thai segmentation can join a short misspelling to the following
        // word (for example "เงนมาก"). Exact glyphs and a unique match are
        // still sufficient to place a review mark at those printed letters.
        const startBoundary=boundaries.has(at),endBoundary=boundaries.has(end);
        const thaiJoined=startBoundary&&!endBoundary&&word.length>=3&&/^[\u0E00-\u0E7F]+$/.test(word);
        const knownSpelling=clearPairs.has(word)||contextPairs.has(word);
        if(!matchesSpellingContext(word,row.text,at)){from=end;continue;}
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
    const match = primary.box ? primary : (ocr.pixelCorrections||[]).find(c=>c.wrong===word) ||
      locate([...(ocr.refinedLines||[]),...(ocr.alternativeLines||[])],word);
    if (match.box) return match;
    const region = paddleRegionMatch(ocr, word);
    return valid(region?.wordBox) && matchesSpellingContext(word, region.text, region.start)
      ? {box:region.wordBox, line:region.text, verification:'review'} : match;
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
      reads.push(startsAtThaiWordBoundary(row.text,gs[0].start,wrong)
        ? row.text.slice(gs[0].start,gs.at(-1).end).normalize('NFC') : '');
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
  function inkParts(canvas,box,dark=false){
    const x=Math.max(0,Math.floor(box[0])),y=Math.max(0,Math.floor(box[1]));
    const w=Math.min(canvas.width,Math.ceil(box[2]))-x,h=Math.min(canvas.height,Math.ceil(box[3]))-y;
    if(w<=0||h<=0||w*h>1000000)return [];
    const data=canvas.getContext('2d').getImageData(x,y,w,h).data,ink=new Uint8Array(w*h),parts=[];
    for(let i=0;i<ink.length;i++){const a=data[i*4],b=data[i*4+1],c=data[i*4+2];ink[i]=dark?Number(Math.max(a,b,c)<200):Number(Math.min(a,b,c)>205&&Math.max(a,b,c)-Math.min(a,b,c)<55);}
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
      const parts=inkParts(canvas,[box[0]-5,box[1]-height*.4,box[2]+5,box[3]+5]);
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
        const g=glyph.box,parts=inkParts(canvas,[g[0]-3,g[1]-(g[3]-g[1])*.65,g[2]+3,g[3]+3]);
        const body=parts.find(b=>b[3]-b[1]>(g[3]-g[1])*.6);
        if(body&&!parts.some(b=>b[3]<body[1]-2&&b[2]>body[0]&&b[0]<body[2])){
          const word=inkParts(canvas,[row.glyphs[0].box[0],g[1]-(g[3]-g[1]),row.glyphs.at(-1).box[2],g[3]+3]).filter(b=>b[2]>hit.box[0]+2&&b[0]<hit.box[2]-2);
          if(word.length)proofs.push({wrong:'พรีเซนต',correct:'พรีเซนต์',box:union(word),line:hit.line,pixelVerified:true,strikeY:(body[1]+body[3])/2});
        }
      }
    }return proofs;
  }
  // In this printed form, the misplaced tone joins the tall stem of ป.
  // The detached mai taikhu in เป็น does not join it above the letter body.
  function penMarkProofs(canvas, rows) {
    const proofs = [];
    for (const row of rows) {
      if (row.confidence < 80) continue;
      for (const match of row.text.matchAll(/ออก(เป็น)กระดาษ/g)) {
        const start = match.index + 'ออก'.length;
        const glyphs = row.glyphs.filter(g => g.start >= start && g.end <= start + 'เป็น'.length);
        const stem = glyphs.find(g => g.start === start + 1);
        if (!stem || glyphs[0]?.start !== start || glyphs.at(-1)?.end !== start + 'เป็น'.length) continue;
        const [left, top, right] = stem.box;
        const bodyTop = glyphs[0].box[1];
        const width = right - left;
        if (width < 12 || bodyTop - top < 8) continue;
        const parts = inkParts(canvas, [left, top - 2, right + 1, bodyTop + 3], true);
        const joinsStem = parts.some(([x, y, r, b]) =>
          x > left && x < left + width * .45 && y >= top - 1 &&
          r >= right - 1 && b >= bodyTop + 2);
        if (joinsStem) {
          proofs.push({wrong:'เป้น', correct:'เป็น', box:union(glyphs.map(g => g.box)),
            line:row.text, pixelVerified:true, strikeY:strikeY(glyphs)});
        }
      }
    }
    return proofs;
  }
  // A wide upper mark above the vowel is mai tho, whereas mai ek is narrow.
  function nueangMarkProofs(canvas, rows) {
    const proofs = [];
    for (const row of rows) {
      if (row.confidence < 80) continue;
      for (const match of row.text.matchAll(/ลดลง(เนื่อง)จาก/g)) {
        const start = match.index + 'ลดลง'.length;
        const end = start + match[1].length;
        const glyphs = row.glyphs.filter(g => g.start >= start && g.end <= end);
        if (glyphs[0]?.start !== start || glyphs.at(-1)?.end !== end) continue;
        const box = union(glyphs.map(g => g.box));
        const [, bodyTop, right, bottom] = glyphs[0].box;
        const height = bottom - bodyTop;
        const parts = inkParts(canvas, [right, bodyTop - height * 1.3, box[2], bodyTop - 1], true)
          .sort((a, b) => a[1] - b[1]);
        if (height < 14 || parts.length !== 2) continue;
        const [mark, vowel] = parts;
        const markWidth = mark[2] - mark[0], markHeight = mark[3] - mark[1];
        if (mark[3] > vowel[1] || mark[0] < vowel[0] || mark[0] >= vowel[2] ||
            markWidth < height * .45 || markWidth < markHeight * 1.15) continue;
        proofs.push({wrong:'เนื้อง', correct:'เนื่อง', box:union([box, mark]), line:row.text,
          pixelVerified:true, strikeY:(bodyTop + bottom)/2});
      }
    }
    return proofs;
  }
  // OCR can normalize a narrow mai ek above ด to mai tho in ไม่ได้.
  function daiMarkProofs(canvas, rows) {
    const proofs = [];
    for (const row of rows) {
      if (row.confidence < 80) continue;
      const match = /Modelไม่(ได้)$/i.exec(row.text);
      if (!match) continue;
      const start = row.text.length - match[1].length;
      const glyphs = row.glyphs.filter(g => g.start >= start);
      if (glyphs.length !== 3 || glyphs[0].start !== start) continue;
      const letter = glyphs[1].box;
      const tone = glyphs[2].box;
      const bodyHeight = letter[3] - letter[1];
      if (bodyHeight < 20) continue;
      const parts = inkParts(canvas, [letter[0], tone[1], tone[2], letter[1] + bodyHeight * .31], true);
      if (parts.length !== 1) continue;
      const [x,y,r,b] = parts[0];
      if (r-x > bodyHeight * .23 || b-y <= r-x || b-y < bodyHeight * .2) continue;
      proofs.push({wrong:'ได่', correct:'ได้', box:union([glyphs[0].box, letter, parts[0]]),
        line:row.text, pixelVerified:true, strikeY:(letter[1]+letter[3])/2});
    }
    return proofs;
  }
  function thamMarkProofs(canvas, rows) {
    const proofs = [];
    for (const row of rows) {
      const hit = locate([row], 'ทา');
      if (!hit.box) continue;
      const at = row.text.indexOf('ทาซ');
      const vowel = row.glyphs.find(g => g.start === at + 1)?.box;
      if (!vowel) continue;
      const [left,,right] = hit.box;
      const [,top,,bottom] = vowel;
      const height = bottom - top;
      if (height < 14) continue;
      // A printed ำ has ink above ท. Keep the check inside this word.
      const upper = inkParts(canvas, [left, top - height * .65, right, top - 2], true);
      const body = inkParts(canvas, [left, top, right, bottom], true);
      if (upper.length || body.length !== 2) continue;
      proofs.push({wrong:'ทา', correct:'ทำ', box:union(body), line:row.text,
        pixelVerified:true, strikeY:(top+bottom)/2});
    }
    return proofs;
  }
  function thaoNanMarkProofs(canvas, rows) {
    const proofs = [];
    for (const row of rows) {
      if (row.confidence < 80) continue;
      const match = /HELM(เทานั้น)(?:i)?$/i.exec(row.text);
      if (!match) continue;
      const start = match.index + 'HELM'.length;
      const end = start + match[1].length;
      const glyphs = row.glyphs.filter(g => g.start >= start && g.end <= end);
      const letter = glyphs.find(g => g.start === start + 1)?.box;
      if (!letter || glyphs[0]?.start !== start || glyphs.at(-1)?.end !== end) continue;
      const [left, top, right, bottom] = letter;
      const height = bottom - top;
      if (height < 14 || inkParts(canvas, [left, top - height * .8, right + 3, top - 2], true).length) continue;
      proofs.push({wrong:'เทานั้น', correct:'เท่านั้น', box:union(glyphs.map(g=>g.box)),
        line:row.text, pixelVerified:true, strikeY:(top+bottom)/2});
    }
    return proofs;
  }
  async function refineThaiMarks(worker,canvas,rows){
    const refinedLines=[],pixelCorrections=[],validationLines=[],confirmed=new Set();
    const checks=[
      {search:'รายละเอียด',wrong:'รายล่ะเอียด',mode:'7',scale:1},
      {search:'ทั้งหมด',wrong:'ทังหมด',mode:'7',scale:2},
      {search:'ใบแจ้งหนี',correct:'ใบแจ้งหนี้',mode:'13',scale:1},
      // Small print can lose the existing mai-ek above อื in อื่นๆ.
      // Re-read real pixels at larger size, never silently fix the OCR text.
      ...['อืนๆ','อนๆ','อินๆ'].map(search=>({search,correct:'อื่นๆ',mode:'7',scale:3,upperPadding:1})),
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
      const left=Math.max(0,Math.floor(Math.max(x-200,lineLeft)-pad)),top=Math.max(0,Math.floor(y-Math.max(pad,(check.upperPadding||0)*(b-y))));
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
        for (const next of rescanned.filter(row=>row.text.includes(check.correct)&&row.confidence>=85)) {
          validationLines.push({...next,glyphs:next.glyphs.map(g=>({
            ...g,box:g.box.map((v,i)=>v/check.scale+(i%2?top:left))
          }))});
        }
      }else{
        for(const row of rescanned){
          if(!row.text.includes(check.wrong)||row.confidence<80)continue;
          refinedLines.push({...row,glyphs:row.glyphs.map(g=>({
            ...g,box:g.box.map((v,i)=>v/check.scale+(i%2?top:left))
          }))});
        }
      }
    }
    return {refinedLines,pixelCorrections,validationLines,confirmed:[...confirmed]};
  }
  async function read(file,progress=()=>{},signal){
    signal?.throwIfAborted();
    const im=await createImageBitmap(file);let worker,termination;
    const stopWorker=()=>worker && (termination ??= worker.terminate());
    const onAbort=()=>{ void stopWorker()?.catch(()=>{}); };
    try{
      signal?.throwIfAborted();
      if(im.width*im.height>20000000)throw Error('ภาพเกิน 20 ล้านพิกเซล');
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);
      const base=new URL('vendor/tesseract/',document.baseURI).href;
      worker=await Tesseract.createWorker('tha+eng',1,{workerPath:base+'worker.min.js',corePath:base+'core',langPath:base+'lang',gzip:false,logger:m=>progress(m.status)},{
        // Capture the printed spelling before the proofreader suggests a fix.
        load_system_dawg:'0',load_freq_dawg:'0',load_punc_dawg:'0',
        load_number_dawg:'0',load_unambig_dawg:'0',load_bigram_dawg:'0'
      });
      signal?.addEventListener('abort',onAbort,{once:true});
      signal?.throwIfAborted();
      await worker.setParameters({tessedit_pageseg_mode:'3'});
      const {data}=await worker.recognize(c,{}, {text:true,blocks:true});
      let selected=lines(data);const alternativeLines=[],validationLines=[];
      const heights=selected.map(row=>{
        const boxes=row.glyphs.map(g=>g.box);
        return boxes.length?Math.max(...boxes.map(b=>b[3]))-Math.min(...boxes.map(b=>b[1])):0;
      }).sort((a,b)=>a-b);
      // Keep a second reading of small print without replacing the full-page
      // transcription. Map glyph boxes back to the original image.
      if (c.width <= 900 && heights.length && heights[Math.floor(heights.length / 2)] <= 18) {
        const enlarged = document.createElement('canvas');
        enlarged.width = c.width * 3;
        enlarged.height = c.height * 3;
        try {
          const context = enlarged.getContext('2d');
          context.imageSmoothingQuality = 'high';
          context.drawImage(c, 0, 0, enlarged.width, enlarged.height);
          const reread = await worker.recognize(enlarged, {}, {text:true, blocks:true});
          const mapped = lines(reread.data).map(row => ({
            ...row,
            glyphs: row.glyphs.map(glyph => ({...glyph, box: glyph.box.map(value => value / 3)}))
          }));
          alternativeLines.push(...mapped);
          validationLines.push(...mapped);
        } catch (error) {
          signal?.throwIfAborted();
          console.warn('Small-print OCR unavailable', error);
        } finally {
          enlarged.width = enlarged.height = 0;
        }
      }
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
        // Dark lettering on colored cards needs a different reading from light ink.
        const darkInk = document.createElement('canvas');
        darkInk.width = c.width;
        darkInk.height = c.height;
        const darkContext = darkInk.getContext('2d');
        const darkPixels = c.getContext('2d').getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < darkPixels.data.length; i += 4) {
          const [r, g, b] = [darkPixels.data[i], darkPixels.data[i + 1], darkPixels.data[i + 2]];
          const value = .213 * r + .715 * g + .072 * b < 97 ? 0 : 255;
          darkPixels.data[i] = darkPixels.data[i + 1] = darkPixels.data[i + 2] = value;
        }
        darkContext.putImageData(darkPixels, 0, 0);
        try {
          signal?.throwIfAborted();
          await worker.setParameters({tessedit_pageseg_mode:'11'});
          const darkRows = lines((await worker.recognize(darkInk, {}, {text:true, blocks:true})).data);
          alternativeLines.push(...darkRows.filter(row => row.confidence >= 80));
        } catch (error) {
          signal?.throwIfAborted();
          console.warn('Dark ink OCR unavailable', error);
        } finally {
          darkInk.width = darkInk.height = 0;
        }
        // Re-read each recovered line at larger size. The second glyph reading
        // is evidence against an OCR artifact such as การ misread as ภาร.
        for(const row of selected.filter(r=>r.text.length>=3&&r.glyphs.length).slice(0,45)){
          const box=union(row.glyphs.map(g=>g.box)),pad=12,scale=2;
          const left=Math.max(0,Math.floor(box[0]-pad)),top=Math.max(0,Math.floor(box[1]-pad));
          const right=Math.min(c.width,Math.ceil(box[2]+pad)),bottom=Math.min(c.height,Math.ceil(box[3]+pad));
          const crop=document.createElement('canvas');crop.width=(right-left)*scale;crop.height=(bottom-top)*scale;
          const cx=crop.getContext('2d');cx.drawImage(c,left,top,right-left,bottom-top,0,0,crop.width,crop.height);
          const bytes=cx.getImageData(0,0,crop.width,crop.height);
          let green=0, darkRed=0, bright=0;
          for(let i=0;i<bytes.data.length;i+=4){
            const r=bytes.data[i],g=bytes.data[i+1],b=bytes.data[i+2];
            if(g>r+25&&g>b+25)green++;
            if(r>g+25&&r>b+25&&g<115)darkRed++;
            if(g>160&&b>160)bright++;
          }
          const area=crop.width*crop.height;
          const lightInk=green/area>.25;
          const redInk=darkRed/area>.025&&bright/area>.25;
          for(let i=0;i<bytes.data.length;i+=4){const r=bytes.data[i],g=bytes.data[i+1],b=bytes.data[i+2];
            const monochrome = Math.max(r,g,b) - Math.min(r,g,b) < 40;
            const ink=redInk?r>g+25&&r>b+25&&g<115:
              lightInk?Math.min(r,g,b)>205&&monochrome:monochrome?g<135:g>=135;
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
      extra.pixelCorrections.push(...posterMarkProofs(c,selected), ...penMarkProofs(c,selected), ...nueangMarkProofs(c,selected), ...daiMarkProofs(c,selected), ...thamMarkProofs(c,alternativeLines), ...thaoNanMarkProofs(c,selected));
      return {width:im.width,height:im.height,lines:selected,alternativeLines,...extra,
        validationLines:[...validationLines,...extra.validationLines]};
    }finally{signal?.removeEventListener('abort',onAbort);im.close();await stopWorker();}
  }
  // Rebuild the result from data, not the backend's executable geometry script.
  // Keep unmatched suggestions visible, but never put an invented line on ink.
  function reanchor(html,ocr){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const panel=doc.querySelector('.correction-panel'),wrapper=doc.querySelector('.wrapper');
    const coverage = doc.body.textContent.match(/AI\s*ตรวจได้ชัด\s*(\d+)\s*จาก\s*(\d+)\s*บรรทัด/);
    const checkedLines = coverage ? Number(coverage[1]) : null;
    const incompleteCoverage = coverage !== null && checkedLines < Number(coverage[2]);
    if(!panel||!wrapper||!wrapper.querySelector('img'))throw Error('รูปแบบผลตรวจไม่รองรับการตรวจพิกัด');
    doc.querySelectorAll('script,.ocr-fix-line,.ocr-fix-text,.verified-spelling-mark,.review-spelling-mark,.verified-spelling-correction,.review-spelling-correction,.paddle-region-review').forEach(n=>n.remove());
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
      const candidateOcr = scopeCorrection(ocr, li);
      let partialGlyph = false, completeGlyph = false;
      if (wrong) for (const region of candidateOcr?.paddleRegions || []) {
        let start = region.text.indexOf(wrong);
        while (start >= 0) {
          if (/^[\p{M}]/u.test(region.text.slice(start + wrong.length)) ||
              !completeLatinSpan(region.text,start,start+wrong.length) || !startsAtThaiWordBoundary(region.text,start,wrong)) partialGlyph = true;
          else completeGlyph = true;
          start = region.text.indexOf(wrong, start + wrong.length);
        }
      }
      if (partialGlyph && !completeGlyph) {li.remove();continue;}

      if(wrong.includes('+')||replacement.includes('+')||differsOnlyByThaiTone(wrong,replacement)&&clearPairs.get(wrong)!==replacement&&!paddleRegionMatch(candidateOcr,wrong)||poster&&wrong==='/ป'&&replacement==='AI'||
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
      for(const [wrong,correct] of [...clearPairs,...Array.from(contextPairs, ([word, pair]) => [word, pair.correct])]){
        if(wrong==='Banano'&&!ocr.lines.some(r=>/NanoBanana/.test(r.text.replace(/\s/g,''))))continue;
        if(existing.has(wrong)||!(locateBest(ocr,wrong).box||locate(ocr.lines,wrong,true).length))continue;
        if(!list){list=doc.createElement('ul');panel.append(list);}
        const li=doc.createElement('li'),mark=doc.createElement('mark'),bold=doc.createElement('b');
        mark.textContent=wrong;bold.textContent=correct;li.append(mark,doc.createTextNode(' → '),bold);list.append(li);
        existing.add(wrong);
      }
    }
    // Different OCR readings can propose the same replacement for the same ink.
    // Deduplicate by the real word location, never by replacement text alone.
    const positionedCorrections = [];
    for (const li of panel.querySelectorAll('li')) {
      const wrong = li.querySelector('mark')?.textContent.trim();
      const correct = li.querySelector('b')?.textContent.trim().normalize('NFC');
      if (!wrong || !correct) continue;
      const source = scopeCorrection(ocr, li);
      const hits = locate(source.lines || [], wrong, true);
      const match = hits.length === 1 ? hits[0] : locateBest(source, wrong);
      const primary = paddleRegionMatch(source, wrong);
      if (!valid(match.box) && valid(primary?.wordBox)) match.box = primary.wordBox;
      if (!valid(match.box)) continue;
      const duplicate = positionedCorrections.find(entry => entry.correct === correct && sameInk(entry.box, match.box));
      const score = Math.abs(wrong.length - correct.length);
      if (!duplicate) positionedCorrections.push({li, correct, box: match.box, score});
      else if (score < duplicate.score) {
        duplicate.li.remove();Object.assign(duplicate, {li, box: match.box, score});
      } else li.remove();
    }
    // Normalise before placing overlays so unchanged neighbours never
    // contribute to strike coordinates or correction labels (including old results).
    for (const li of panel.querySelectorAll('li')) {
      const mark = li.querySelector('mark'), bold = li.querySelector('b');
      if (!mark || !bold) continue;
      const wrong = mark.textContent.trim(), correct = bold.textContent.trim();
      if (changesValidFunctionWord(wrong, correct)) {li.remove();continue;}
      const span = correctionWordSpan(wrong, correct);
      if (!span) {
        if (canonicalThaiReading(wrong).replace(/[\sๆ\p{P}]/gu, '') === canonicalThaiReading(correct).replace(/[\sๆ\p{P}]/gu, '')) li.remove();
        else li.setAttribute('data-unresolved-word-span', 'true');
        continue;
      }
      // Source and Code are valid technical words, not incomplete spellings.
      // Also ignore case-only styling changes; neither is a spelling error.
      const productRows = scopeCorrection(ocr,li);
      if (isNestedSpellingSuggestion(productRows, span.wrong)) {li.remove();continue;}
      const googleVids = /^vids$/i.test(span.wrong) &&
        [...(productRows.paddleRegions || []), ...(productRows.lines || [])]
          .some(row => /\b(?:Google|Goegle)\s*Vids\b/i.test(row.text));
      if (googleVids || /^(source|code)$/i.test(span.wrong) || span.wrong.toLowerCase() === span.correct.toLowerCase()) {
        li.remove();continue;
      }
      mark.textContent = span.wrong;bold.textContent = span.correct;
    }
    const alternativeKey = (word, li) => JSON.stringify([word, li.getAttribute('data-ocr-region-indices')]);
    const alternatives=new Map();
    for(const li of panel.querySelectorAll('li')){
      const original=li.querySelector('mark')?.textContent.trim().normalize('NFC');
      const at=li.textContent.indexOf('→');
      if(!original||at<0)continue;
      if(!alternatives.has(alternativeKey(original, li)))alternatives.set(alternativeKey(original, li),new Set());
      alternatives.get(alternativeKey(original, li)).add(li.textContent.slice(at+1).trim().normalize('NFC'));
    }
    const fullOcr = ocr;
    const seen=new Set();let located=0,verifiedCount=0,unlocated=0;
    for(const li of panel.querySelectorAll('li')){
      const mark=li.querySelector('mark');
      if(!mark){unlocated++;continue;}
      if (li.hasAttribute('data-unresolved-word-span')) {
        const note = doc.createElement('span');
        note.textContent = ' — ยังแยกคำที่แก้ไม่ได้ จึงไม่ขีดทั้งประโยค';
        li.append(note);unlocated++;continue;
      }
      const ocr = scopeCorrection(fullOcr, li);
      const original=mark.textContent.trim(),all=li.textContent;
      const arrow=all.indexOf('→'),corrected=arrow<0?'':all.slice(arrow+1).trim();
      if (changesValidFunctionWord(original, corrected) || preservesPromptSpelling(ocr, original, corrected)) {li.remove();continue;}
      const key=JSON.stringify([original,corrected,li.getAttribute('data-ocr-region-indices')]);
      if(seen.has(key)){li.remove();continue;}seen.add(key);
      if(original.normalize('NFC')===corrected.normalize('NFC')){li.remove();continue;}
      // OCR cannot reliably distinguish I, l and 1 in short Latin labels.
      const ambiguousLatin = text => text.replace(/[Il1]/g, '|');
      if (/^[A-Za-z0-9]{1,4}$/.test(original) && /^[A-Za-z0-9]{1,4}$/.test(corrected) &&
          ambiguousLatin(original) === ambiguousLatin(corrected)) {
        li.remove();
        continue;
      }
      const conflicting=alternatives.get(alternativeKey(original.normalize('NFC'), li))?.size>1;
      const exactHits=corrected&&ocr&&!conflicting?locate(ocr.lines,original,true):[];
      const proof=ocr?.pixelCorrections?.find(p=>p.pixelVerified&&p.wrong===original&&p.correct===corrected);
      const matches=proof?[proof]:exactHits.length?exactHits:[];
      const match=original==='ฟร!'&&posterFree?posterFree:
        corrected&&ocr&&!conflicting?locateBest(ocr,original):{reason:'unavailable'};
      const paddleRegion = !conflicting ? paddleRegionMatch(ocr, original) : null;
      if (!proof && correctedReadingAtRegion(ocr, corrected, paddleRegion)) {
        li.remove();
        continue;
      }
      const reliableWord = proof || matches.some(hit =>
        canMark(original, corrected, hit.line) && checkedReading(ocr, original, hit) !== 'contradicted');
      if (paddleRegion && !reliableWord) {
        // Browser OCR is an independent reading of primary OpenThai coordinates.
        // A conflicting reading must not turn a mixed-script OCR error into a fix.
        if (!canMark(original,corrected,paddleRegion.text) && valid(paddleRegion.wordBox)) {
          const independent = checkedReading({...ocr,validationLines:[...(ocr.lines || []),...(ocr.validationLines || [])]},
            original, {box:paddleRegion.wordBox});
          if (independent === 'contradicted') {li.remove();continue;}
          if (/[ก-๙]/u.test(original) && /[A-Za-z]/.test(original) && independent !== 'agreed') {
            const note=doc.createElement('span');note.textContent=' — ยังยืนยันคำที่มีอักษรไทยและอังกฤษปนกันไม่ได้ จึงไม่ขีดทับ';
            li.append(note);unlocated++;continue;
          }
        }
        // A primary OCR box locates ink; it does not confirm that a small,
        // tilted Latin label was transcribed correctly. Do not bypass the
        // independent-reading check just because that box exists.
        if (/^[A-Za-z]+$/.test(original) && /^[A-Za-z]+$/.test(corrected) &&
            !canMark(original,corrected,paddleRegion.text)) {
          const reading = checkedReading(ocr, original, {box:paddleRegion.wordBox || paddleRegion.box});
          if (reading === 'contradicted') {li.remove();continue;}
          if (reading !== 'agreed') {
            const note = doc.createElement('span');
            note.textContent = ' — ยังยืนยันคำอังกฤษจากการอ่านซ้ำไม่ได้ จึงไม่ขีดทับ';
            li.append(note);unlocated++;continue;
          }
        }
        const wordLocated = addPaddleReview(doc, wrapper, paddleRegion, ocr, original, corrected, match);
        if (wordLocated === 'duplicate') {li.remove();continue;}
        const note = doc.createElement('span');
        note.textContent = wordLocated ? ' — ตำแหน่งคำ โปรดตรวจทาน' : ' — ยังแยกตำแหน่งคำไม่ได้';
        li.append(note);
        if (wordLocated) located++; else unlocated++;
        continue;
      }
      if(!match.box&&!matches.length){
        const note=doc.createElement('span');note.textContent=match.reason==='ambiguous'?' — OCR พบหลายตำแหน่ง โปรดตรวจทาน':' — ยังยืนยันตำแหน่งไม่ได้';li.append(note);unlocated++;continue;
      }
      let painted = 0, duplicates = 0;
      for(const hit of matches.length?matches:[match]){
        const reading=hit.pixelVerified?'agreed':checkedReading(ocr,original,hit);
        if(reading==='contradicted'&&!canMark(original,corrected,hit.line)){li.remove();break;}
        if(reading==='contradicted'||!hit.pixelVerified&&!canMark(original,corrected,hit.line)&&reading!=='agreed'){
          if(!li.querySelector('.reading-note')){const note=doc.createElement('span');note.className='reading-note';note.textContent=reading==='contradicted'?' — อ่านซ้ำไม่ตรงกับคำนี้ อาจเป็น OCR อ่านผิด':' — ยังไม่มีการอ่านซ้ำยืนยัน จึงไม่ขีดทับ';li.append(note);unlocated++;}
          continue;
        }
        const verified=hit.pixelVerified||hit.verification!=='review'&&canMark(original,corrected,hit.line);
        if (!addOverlay(doc,wrapper,hit,ocr,original,corrected,verified)) {duplicates++;continue;}
        painted++;located++;if(verified)verifiedCount++;
      }
      if (duplicates && !painted && !li.querySelector('.reading-note')) li.remove();
    }
    const count=panel.querySelectorAll('li').length;
    if (incompleteCoverage && count === 0) {
      const warning = doc.createElement('p');
      warning.textContent = doc.querySelector('.context-audit-service-error')
        ? 'บริการตรวจคำผิดยังทำงานไม่สำเร็จ ผลนี้ยังยืนยันความถูกต้องของข้อความไม่ได้'
        : checkedLines === 0
        ? 'ยังยืนยันผลตรวจไม่ได้ ลองใช้ภาพต้นฉบับที่คมชัดกว่า หรือแบ่งภาพเป็นส่วน ๆ แล้วส่งตรวจอีกครั้ง'
        : 'ยังตรวจไม่ครบทุกบรรทัด โปรดตรวจทานส่วนที่เหลือกับต้นฉบับ';
      panel.prepend(warning);
    }
    const heading=panel.querySelector('h3');if(heading)heading.textContent='คำแนะนำที่ต้องตรวจทาน ('+count+')';
    const status=panel.querySelector('.location-status');if(status)status.textContent='แสดงตำแหน่ง '+located+' จุด · ยืนยันด้วยกฎสะกด '+verifiedCount+' จุด · ยังระบุตำแหน่งไม่ได้ '+unlocated+' รายการ';
    const version=panel.querySelector('.audit-version');if(version)version.textContent='คงต้นฉบับ · strike-word-27';
    const banner=doc.createElement('p');
    banner.className='result-location-summary';
    banner.textContent='คำแนะนำ '+count+' รายการ · พบตำแหน่งบนภาพ '+located+' รายการ · ยังขีดไม่ได้ '+unlocated+' รายการ';
    banner.style.cssText='box-sizing:border-box;width:100%;margin:0 0 10px;padding:10px 14px;border:1px solid #9bdedb;border-radius:10px;background:#f4fffe;color:#174b49;font:14px/1.5 Arial,Tahoma,sans-serif;text-align:left';
    wrapper.before(banner);
    if (count) {
      for (const paragraph of panel.querySelectorAll('p')) {
        if (paragraph.textContent.trim().startsWith('ยังไม่พบคำแนะนำ')) paragraph.remove();
      }
    }
    panel.classList.add('ocr-image-corrections');
    const layout = doc.createElement('style');
    layout.textContent = `
      .correction-panel.ocr-image-corrections {
        display: block !important;
        box-sizing: border-box;
      }
      .ocr-image-corrections ul {
        display: flex !important;
        flex-wrap: wrap;
        gap: 6px 16px;
        width: 100%;
        margin: 8px 0 0;
        padding: 0;
        list-style: none;
      }
      .ocr-image-corrections li {
        max-width: 100%;
        margin: 0;
        overflow-wrap: anywhere;
      }
      .ocr-image-corrections h3,
      .ocr-image-corrections p {
        margin: 0 0 6px;
      }
    `;
    doc.head.append(layout);
    collapseReview(doc,panel);
    return {html:'<!doctype html>'+doc.documentElement.outerHTML,located,unlocated,reviewCount:count,incompleteCoverage,checkedLines};
  }
  function renderLocal(imageUrl, ocr) {
    const doc = document.implementation.createHTMLDocument('ผลตรวจเบื้องต้น');
    const notice = doc.createElement('p');
    notice.textContent = 'ผลตรวจเบื้องต้น อาจพบคำผิดไม่ครบ';
    const wrapper = doc.createElement('div');
    wrapper.className = 'wrapper';
    wrapper.style.cssText = 'position:relative;width:fit-content;max-width:100%;margin:auto';
    const image = doc.createElement('img');
    image.src = imageUrl;
    image.alt = 'ภาพต้นฉบับ';
    image.style.cssText = 'display:block;max-width:100%;height:auto';
    wrapper.append(image);
    const panel = doc.createElement('section');
    panel.className = 'correction-panel';
    const heading = doc.createElement('h3');
    panel.append(heading);
    doc.body.append(notice, wrapper, panel);
    return reanchor(doc.documentElement.outerHTML, ocr);
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
  async function annotatePdf(html,file,progress=()=>{},{hoverOnly=false,pdfjs:pdfjsOverride,readPage=read}={}){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const candidates=[...doc.querySelectorAll('.correction-panel li')].map(li=>({wrong:li.querySelector('.correction-wrong')?.textContent.trim(),correct:li.querySelector('.correction-correct')?.textContent.trim()})).filter(c=>c.wrong&&c.correct)
      .map(c=>hoverOnly?correctionWordSpan(c.wrong,c.correct):c).filter(Boolean);
    const pdfjs=pdfjsOverride || await import(new URL('vendor/pdfjs/pdf.mjs?v=20261124-pdf-view',document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs?v=20261124-pdf-view',document.baseURI).href;
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    let count=0;const unreadPages=[];
    try{
      if(pdf.numPages>20)throw Error('PDF เกิน 20 หน้า: ยังไม่ได้ยืนยันพิกัดคำ กรุณาแบ่งไฟล์');
      const preview=doc.querySelector('.pdf-overlay-viewer');
      if(!preview)throw Error('ไม่พบพื้นที่แสดง PDF');
      preview.replaceChildren();doc.querySelectorAll('script').forEach(n=>n.remove());
      if (hoverOnly) {
        const hoverStyle = doc.createElement('style');
        hoverStyle.textContent = '.document-hover-mark:hover::after,.document-hover-mark:focus::after{content:attr(data-correction);position:absolute;bottom:100%;left:0;z-index:20;background:#fff;color:#172033;border:1px solid #dc2626;border-radius:4px;padding:3px 7px;white-space:nowrap;font:16px/1.5 Arial,Tahoma,sans-serif}';
        doc.head.append(hoverStyle);
      }
      for(let n=1;n<=pdf.numPages;n++){
        progress('ตรวจตำแหน่งคำบน PDF หน้า '+n+'/'+pdf.numPages);
        const page=await pdf.getPage(n),viewport=page.getViewport({scale:2});
        if(viewport.width*viewport.height>20000000)throw Error('หน้า PDF มีขนาดใหญ่เกินสำหรับตรวจพิกัด');
        const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        const wrap=doc.createElement('div'),img=doc.createElement('img');
        wrap.style.cssText='position:relative;width:100%;margin-bottom:16px;background:white';
        if (hoverOnly) wrap.dataset.correctOnHover = 'true';
        img.src=canvas.toDataURL('image/png');img.alt='หน้า '+n;img.style.cssText='display:block;width:100%;height:auto';wrap.append(img);
        let ocr;
        try { ocr = await readPage(blob); }
        catch { unreadPages.push(n);ocr = {width:canvas.width,height:canvas.height,lines:[]}; }
        for(const c of candidates){
          // Locate each occurrence separately; never reuse a coordinate for another word.
          for(const row of ocr.lines){const match=locate([row],c.wrong);
            if(match.box&&(hoverOnly||canMark(c.wrong,c.correct,match.line))){if(addOverlay(doc,wrap,match,ocr,c.wrong,c.correct))count++;}
          }
        }
        preview.append(wrap);canvas.width=canvas.height=0;page.cleanup();
      }
      if (unreadPages.length) {
        const note=doc.createElement('p');note.textContent='แสดง PDF ต้นฉบับแล้ว แต่ยังยืนยันพิกัดคำไม่ได้ในหน้า '+unreadPages.join(', ');preview.before(note);
      }
      if (hoverOnly) doc.querySelector('.document-original-text')?.remove();
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
    const pdfjs=await import(new URL('vendor/pdfjs/pdf.mjs?v=20261124-pdf-view',document.baseURI).href);
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs?v=20261124-pdf-view',document.baseURI).href;
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

  const api={refineThaiMarks,correctionWordSpan,missingStackedTone,lines,locate,read,reanchor,renderLocal,preserveOriginal,canMark,annotatePdf,pdfLowerVowelIssues,annotatePdfLayout};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.HooHooWordLocator=api;
})(typeof window==='undefined'?globalThis:window);
