/* 외부 라이브러리 없이 엑셀(.xlsx) 파일을 만들고 읽는 최소 구현.
 * 회사 데이터가 외부로 나가지 않도록 CDN·서버를 전혀 사용하지 않습니다.
 *   XlsxLite.write([{ name, rows, cols, merges }])  → Uint8Array
 *   XlsxLite.read(ArrayBuffer)                      → Promise<[{ name, rows }]>
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XlsxLite = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const enc = new TextEncoder(), dec = new TextDecoder('utf-8');
  const STYLES = { default: 0, title: 1, head: 2, text: 3, int: 4, dec: 5, bold: 6, center: 7, totalInt: 8, wrap: 9, label: 10, right: 11 };

  function xmlEsc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function xmlUnesc(s) {
    return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&amp;/g, '&');
  }
  function colName(i) {
    let s = '';
    for (i = i + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }
  function colIndex(ref) {
    let n = 0;
    for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  // ───────────── ZIP ─────────────
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    const parts = [], central = [];
    let offset = 0;
    files.forEach((file) => {
      const name = enc.encode(file.name), data = file.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((s, a) => s + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
    let pos = 0;
    all.forEach((a) => { out.set(a, pos); pos += a.length; });
    return out;
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 엑셀 읽기를 지원하지 않습니다. 최신 Edge 또는 Chrome을 사용하세요.');
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('엑셀(.xlsx) 파일 형식이 아닙니다. 구형 .xls 파일은 .xlsx로 다시 저장해 주세요.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('엑셀 파일이 손상되었습니다.');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      if (csize === 0xFFFFFFFF || lho === 0xFFFFFFFF) throw new Error('파일이 너무 큽니다(ZIP64 미지원).');
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = u8.subarray(start, start + csize);
      if (method === 0) files[name] = raw;
      else if (method === 8) files[name] = await inflateRaw(raw);
      else throw new Error('지원하지 않는 압축 방식입니다.');
      p += 46 + nlen + elen + clen;
    }
    return files;
  }

  // ───────────── 쓰기 ─────────────
  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font>' +
    '<font><b/><sz val="20"/><name val="맑은 고딕"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right>' +
    '<top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="12">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="3" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right"/></xf>' +
    '</cellXfs></styleSheet>';

  function sheetXml(sheet) {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    if (sheet.cols && sheet.cols.length) {
      x += '<cols>' + sheet.cols.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
    }
    x += '<sheetData>';
    (sheet.rows || []).forEach((row, r) => {
      const ht = sheet.heights && sheet.heights[r] ? ' ht="' + sheet.heights[r] + '" customHeight="1"' : '';
      x += '<row r="' + (r + 1) + '"' + ht + '>';
      (row || []).forEach((cell, c) => {
        if (cell === null || cell === undefined) return;
        const isObj = typeof cell === 'object';
        const v = isObj ? cell.v : cell;
        const s = isObj && cell.s ? (STYLES[cell.s] || 0) : 0;
        const ref = colName(c) + (r + 1);
        const sAttr = s ? ' s="' + s + '"' : '';
        if (v === null || v === undefined || v === '') { if (s) x += '<c r="' + ref + '"' + sAttr + '/>'; }
        else if (typeof v === 'number' && Number.isFinite(v)) x += '<c r="' + ref + '"' + sAttr + '><v>' + v + '</v></c>';
        else x += '<c r="' + ref + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
      });
      x += '</row>';
    });
    x += '</sheetData>';
    if (sheet.merges && sheet.merges.length) {
      x += '<mergeCells count="' + sheet.merges.length + '">' + sheet.merges.map((m) => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>';
    }
    x += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
    if (sheet.fitWidth) x += '<pageSetup paperSize="9" orientation="portrait"/>';
    return x + '</worksheet>';
  }

  function write(sheets) {
    const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const files = [
      { name: '[Content_Types].xml', data: H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
        '</Types>' },
      { name: '_rels/.rels', data: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: H + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map((s, i) => '<sheet name="' + xmlEsc(String(s.name || 'Sheet' + (i + 1)).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
        '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: STYLES_XML },
    ].concat(sheets.map((s, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) })));
    return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.data) })));
  }

  // ───────────── 읽기 ─────────────
  function attr(tag, name) {
    const m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(tag);
    return m ? xmlUnesc(m[1]) : null;
  }
  function textOf(xml) {
    let s = '';
    const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
    let m;
    while ((m = re.exec(xml))) s += xmlUnesc(m[1]);
    return s;
  }

  async function read(buffer) {
    const files = await unzip(buffer);
    const get = (name) => (files[name] ? dec.decode(files[name]) : null);
    const wb = get('xl/workbook.xml');
    if (!wb) throw new Error('엑셀(.xlsx) 통합문서를 찾을 수 없습니다.');
    const rels = {};
    (get('xl/_rels/workbook.xml.rels') || '').replace(/<Relationship\s[^>]*>/g, (tag) => { rels[attr(tag, 'Id')] = attr(tag, 'Target'); return ''; });
    const shared = [];
    const sst = get('xl/sharedStrings.xml');
    if (sst) {
      sst.replace(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\/>/g, (m, inner) => {
        // 한글 Excel의 윗주(rPh)는 본문이 아니므로 제외
        shared.push(inner ? textOf(inner.replace(/<(?:\w+:)?rPh[\s\S]*?<\/(?:\w+:)?rPh>/g, '')) : '');
        return '';
      });
    }
    const sheets = [];
    wb.replace(/<(?:\w+:)?sheet\s[^>]*>/g, (tag) => {
      let target = rels[attr(tag, 'r:id')] || '';
      target = target.replace(/^\/?(xl\/)?/, 'xl/');
      sheets.push({ name: attr(tag, 'name') || '', path: target });
      return '';
    });
    return sheets.map((sh) => {
      const xml = get(sh.path) || '';
      const rows = [];
      const re = /<(?:\w+:)?c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
      let m;
      while ((m = re.exec(xml))) {
        const ref = attr(m[1], 'r');
        if (!ref) continue;
        const t = attr(m[1], 't'), inner = m[2] || '';
        const vm = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        let val;
        if (t === 'inlineStr') val = textOf(inner);
        else if (!vm) continue;
        else if (t === 's') val = shared[parseInt(vm[1], 10)] || '';
        else if (t === 'str' || t === 'e') val = xmlUnesc(vm[1]);
        else if (t === 'b') val = vm[1] === '1';
        else { val = Number(vm[1]); if (!Number.isFinite(val)) val = xmlUnesc(vm[1]); }
        const r = parseInt(ref.replace(/[^0-9]/g, ''), 10) - 1, c = colIndex(ref);
        while (rows.length <= r) rows.push([]);
        rows[r][c] = val;
      }
      for (const row of rows) for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      return { name: sh.name, rows };
    });
  }

  // 첫 줄(머리글) 기준으로 객체 배열 변환. 머리글의 "(단위)" 설명과 공백·별표는 무시.
  function normHeader(h) { return String(h === undefined ? '' : h).replace(/\(.*?\)/g, '').replace(/[\s*]/g, ''); }
  function toObjects(rows) {
    const hi = rows.findIndex((r) => r && r.filter((c) => String(c).trim() !== '').length >= 2);
    if (hi < 0) return [];
    const headers = rows[hi].map(normHeader);
    const out = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (!row.some((c) => String(c === undefined ? '' : c).trim() !== '')) continue;
      const o = { __row: r + 1 };
      headers.forEach((h, i) => { if (h) o[h] = row[i] === undefined ? '' : row[i]; });
      out.push(o);
    }
    return out;
  }

  // 엑셀 날짜 일련번호 → YYYY-MM-DD
  function serialToDate(n) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(n)) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  return { write, read, toObjects, normHeader, serialToDate, colName, STYLES };
});
