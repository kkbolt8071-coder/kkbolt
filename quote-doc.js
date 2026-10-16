/* 고객사 제출용 견적서 생성.
 * 내부 원가정보 유출 방지를 위해 저장된 견적(quote)에서 "제출 가능한 항목만" 골라 담은
 * customerView 를 먼저 만들고, 견적서(PDF용 HTML·엑셀)는 오직 customerView 만 보고 그립니다.
 * 원가·원재료 매입단가·목표 이익률·예상이익은 customerView 에 아예 들어가지 않습니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuoteDoc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
  function money(v, d) {
    return n(v).toLocaleString('ko-KR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function s(v) { return v === null || v === undefined ? '' : String(v); }

  function buildCustomerView(quote, company) {
    const c = company || {};
    const p = (quote.snap && quote.snap.product) || {};
    const m = (quote.snap && quote.snap.material) || {};
    const q = (quote.result && quote.result.quote) || {};
    const decimals = n(quote.pricing && quote.pricing.decimals);
    const view = {
      company: {
        name: s(c.name), ceo: s(c.ceo), bizNo: s(c.bizNo), address: s(c.address),
        tel: s(c.tel), fax: s(c.fax), email: s(c.email),
      },
      quoteNo: s(quote.quoteNo), date: s(quote.date), customer: s(quote.customer), manager: s(quote.manager),
      productCode: s(p.code), productName: s(p.name), spec: s(p.spec), grade: s(m.grade),
      drawingNo: s(p.drawingNo), drawingRev: s(p.drawingRev),
      qty: n(quote.qty), unit: 'EA', decimals,
      unitPrice: n(q.unitPrice), supply: n(q.supply),
      vatApply: !!q.vatApply, vatRatePct: n(q.vatRatePct), vat: n(q.vat), total: n(q.total),
      delivery: s(quote.delivery), validity: s(quote.validity), payment: s(quote.payment), remarks: s(quote.remarks),
      priceBreaks: null,
    };
    if (quote.includeBreaks && Array.isArray(quote.breaks) && quote.breaks.length) {
      view.priceBreaks = quote.breaks.map((b) => ({ qty: n(b.qty), unitPrice: n(b.unitPrice), supply: n(b.supply) }));
    }
    return view;
  }

  function renderHtml(v) {
    const d = v.decimals;
    const row = (k, val) => '<tr><th>' + k + '</th><td>' + esc(val) + '</td></tr>';
    const drawing = v.drawingNo ? v.drawingNo + (v.drawingRev ? ' (Rev.' + v.drawingRev + ')' : '') : '';
    const breaks = v.priceBreaks ? (
      '<h3>수량별 단가</h3><table class="grid"><thead><tr><th>수량</th><th>단가(원)</th><th>공급가액(원)</th></tr></thead><tbody>' +
      v.priceBreaks.map((b) => '<tr><td class="r">' + money(b.qty) + ' ' + v.unit + '</td><td class="r">' + money(b.unitPrice, d) + '</td><td class="r">' + money(b.supply) + '</td></tr>').join('') +
      '</tbody></table>') : '';
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>견적서_' + esc(v.quoteNo) + '_' + esc(v.customer) + '</title><style>' +
      '@page{size:A4;margin:13mm 14mm}' +
      '*{box-sizing:border-box}' +
      'body{font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;font-size:10pt;color:#111;margin:0;padding:24px;background:#fff;line-height:1.45}' +
      '.doc{max-width:182mm;margin:0 auto}' +
      'h1{text-align:center;font-size:24pt;letter-spacing:.6em;margin:0 0 5mm;padding-left:.6em;border-bottom:3px double #111;padding-bottom:2mm}' +
      'h3{font-size:10pt;margin:4mm 0 1.5mm}' +
      '.top{display:flex;gap:8mm;align-items:flex-start;margin-bottom:5mm}' +
      '.top>div{flex:1}' +
      '.to{font-size:14pt;font-weight:700;border-bottom:1px solid #111;padding-bottom:2mm;margin-bottom:3mm}' +
      'table{border-collapse:collapse;width:100%}' +
      '.kv th{text-align:left;font-weight:600;white-space:nowrap;padding:1.2mm 3mm 1.2mm 0;width:1%;vertical-align:top}' +
      '.kv td{padding:1.2mm 0;word-break:break-all}' +
      '.sup{border:1px solid #111}' +
      '.sup th,.sup td{border:1px solid #111;padding:1.4mm 2.4mm;font-size:9.5pt}' +
      '.sup th{background:#eef1f5;white-space:nowrap;text-align:center;width:1%}' +
      '.sum{border:2px solid #111;padding:3mm 4mm;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4mm;font-weight:700}' +
      '.sum b{font-size:15pt}' +
      '.grid th,.grid td{border:1px solid #111;padding:1.3mm 2.2mm}tr{break-inside:avoid}' +
      '.grid th{background:#eef1f5;text-align:center;font-weight:600}' +
      '.grid tfoot th{text-align:right}' +
      '.r{text-align:right;white-space:nowrap}.c{text-align:center}' +
      '.terms th{width:32mm;white-space:nowrap;background:#eef1f5;text-align:center}' +
      '.terms td{white-space:pre-wrap}' +
      '.foot{margin-top:5mm;text-align:center;color:#444;font-size:9.5pt}' +
      '@media print{body{padding:0}}' +
      '</style></head><body><div class="doc">' +
      '<h1>견적서</h1>' +
      '<div class="top"><div>' +
      '<div class="to">' + esc(v.customer) + ' 귀중</div>' +
      '<table class="kv">' + row('견적번호', v.quoteNo) + row('견적일자', v.date) + row('견적 담당자', v.manager) + '</table>' +
      '<p style="margin:3mm 0 0">아래와 같이 견적합니다.</p>' +
      '</div><div><table class="sup">' +
      '<tr><th>상호</th><td>' + esc(v.company.name) + '</td></tr>' +
      '<tr><th>대표자</th><td>' + esc(v.company.ceo) + '</td></tr>' +
      '<tr><th>사업자번호</th><td>' + esc(v.company.bizNo) + '</td></tr>' +
      '<tr><th>주소</th><td>' + esc(v.company.address) + '</td></tr>' +
      '<tr><th>전화 / 팩스</th><td>' + esc(v.company.tel) + (v.company.fax ? ' / ' + esc(v.company.fax) : '') + '</td></tr>' +
      '<tr><th>이메일</th><td>' + esc(v.company.email) + '</td></tr>' +
      '</table></div></div>' +
      '<div class="sum"><span>견적 총액 ' + (v.vatApply ? '(부가가치세 포함)' : '(부가가치세 별도)') + '</span><b>₩ ' + money(v.total) + '</b></div>' +
      '<table class="grid"><thead><tr><th>제품코드</th><th>제품명</th><th>규격</th><th>재질</th><th>수량</th><th>단가(원)</th><th>공급가액(원)</th></tr></thead><tbody>' +
      '<tr><td>' + esc(v.productCode) + '</td><td>' + esc(v.productName) + (drawing ? '<br><small>도면 ' + esc(drawing) + '</small>' : '') + '</td><td>' + esc(v.spec) + '</td><td>' + esc(v.grade) + '</td>' +
      '<td class="r">' + money(v.qty) + ' ' + v.unit + '</td><td class="r">' + money(v.unitPrice, d) + '</td><td class="r">' + money(v.supply) + '</td></tr>' +
      '</tbody><tfoot>' +
      '<tr><th colspan="6">공급가액</th><td class="r">' + money(v.supply) + '</td></tr>' +
      '<tr><th colspan="6">부가가치세' + (v.vatApply ? ' (' + money(v.vatRatePct) + '%)' : ' (별도)') + '</th><td class="r">' + (v.vatApply ? money(v.vat) : '-') + '</td></tr>' +
      '<tr><th colspan="6">총 견적금액</th><td class="r"><b>' + money(v.total) + '</b></td></tr>' +
      '</tfoot></table>' + breaks +
      '<h3>견적 조건</h3><table class="grid terms">' +
      '<tr><th>납기</th><td>' + esc(v.delivery) + '</td></tr>' +
      '<tr><th>견적 유효기간</th><td>' + esc(v.validity) + '</td></tr>' +
      '<tr><th>결제조건</th><td>' + esc(v.payment) + '</td></tr>' +
      '<tr><th>비고</th><td>' + esc(v.remarks) + '</td></tr>' +
      '</table>' +
      '<div class="foot">' + esc(v.company.name) + '</div>' +
      '</div></body></html>';
  }

  // XlsxLite.write 에 넘길 시트 정의
  function toSheet(v) {
    const T = (x) => ({ v: x, s: 'text' }), L = (x) => ({ v: x, s: 'label' }), H = (x) => ({ v: x, s: 'head' });
    const I = (x) => ({ v: x, s: 'int' }), P = (x) => ({ v: x, s: v.decimals ? 'dec' : 'int' });
    const E = { v: '', s: 'text' }, EL = { v: '', s: 'label' };
    const rows = [], merges = [];
    const add = (r) => rows.push(r) - 1;
    add([{ v: '견 적 서', s: 'title' }]); merges.push('A1:G1');
    add([]);
    add([{ v: v.customer + ' 귀중', s: 'bold' }, null, null, null, L('상호'), T(v.company.name), E]); merges.push('F3:G3');
    add([L('견적번호'), T(v.quoteNo), E, null, L('대표자'), T(v.company.ceo), E]); merges.push('B4:C4', 'F4:G4');
    add([L('견적일자'), T(v.date), E, null, L('사업자번호'), T(v.company.bizNo), E]); merges.push('B5:C5', 'F5:G5');
    add([L('견적 담당자'), T(v.manager), E, null, L('주소'), T(v.company.address), E]); merges.push('B6:C6', 'F6:G6');
    add([null, null, null, null, L('전화 / 팩스'), T(v.company.tel + (v.company.fax ? ' / ' + v.company.fax : '')), E]); merges.push('F7:G7');
    add([null, null, null, null, L('이메일'), T(v.company.email), E]); merges.push('F8:G8');
    add([]);
    let r = add([L('견적 총액 ' + (v.vatApply ? '(부가가치세 포함)' : '(부가가치세 별도)')), EL, EL, EL, EL, { v: v.total, s: 'totalInt' }, { v: '', s: 'totalInt' }]);
    merges.push('A' + (r + 1) + ':E' + (r + 1), 'F' + (r + 1) + ':G' + (r + 1));
    add([]);
    add([H('제품코드'), H('제품명'), H('규격'), H('재질'), H('수량(' + v.unit + ')'), H('단가(원)'), H('공급가액(원)')]);
    add([T(v.productCode), T(v.productName), T(v.spec), T(v.grade), I(v.qty), P(v.unitPrice), I(v.supply)]);
    const sumRow = (label, val) => {
      const i = add([L(label), EL, EL, EL, EL, EL, typeof val === 'number' ? { v: val, s: 'totalInt' } : { v: val, s: 'label' }]);
      merges.push('A' + (i + 1) + ':F' + (i + 1));
    };
    sumRow('공급가액', v.supply);
    sumRow('부가가치세' + (v.vatApply ? ' (' + v.vatRatePct + '%)' : ' (별도)'), v.vatApply ? v.vat : '-');
    sumRow('총 견적금액', v.total);
    if (v.priceBreaks) {
      add([]);
      add([{ v: '수량별 단가', s: 'bold' }]);
      add([H('수량(' + v.unit + ')'), H('단가(원)'), H('공급가액(원)')]);
      v.priceBreaks.forEach((b) => add([I(b.qty), P(b.unitPrice), I(b.supply)]));
    }
    add([]);
    add([{ v: '견적 조건', s: 'bold' }]);
    const term = (label, val) => {
      const i = add([L(label), { v: val, s: 'wrap' }, E, E, E, E, E]);
      merges.push('B' + (i + 1) + ':G' + (i + 1));
      return i;
    };
    term('납기', v.delivery); term('견적 유효기간', v.validity); term('결제조건', v.payment);
    const ri = term('비고', v.remarks);
    const heights = { 0: 36 };
    heights[ri] = Math.min(160, 18 * Math.max(2, String(v.remarks).split('\n').length + 1));
    if (v.drawingNo) {
      add([]);
      add([{ v: '도면번호: ' + v.drawingNo + (v.drawingRev ? ' (Rev.' + v.drawingRev + ')' : '') }]);
    }
    return { name: '견적서', rows, merges, cols: [16, 24, 16, 13, 13, 14, 17], heights, fitWidth: true };
  }

  return { buildCustomerView, renderHtml, toSheet, money };
});
