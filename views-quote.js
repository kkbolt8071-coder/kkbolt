/* 신규 견적 작성: 제품 선택 → 수량 → 원가 확인 → 목표 이익률 → 견적금액 → 저장 */
'use strict';
(() => {
  let qd = null;

  function newDraft(productId) {
    const s = DB.settings, p = prodById(productId);
    return {
      productId: p ? p.id : '', qty: p && N(p.moq) >= 1 ? Math.floor(N(p.moq)) : '',
      cmp: { 1000: true, 5000: true, 10000: true, 50000: true }, customQty: '',
      pricing: { mode: s.pricingMode, ratePct: s.targetRatePct, decimals: Number(s.decimals), rounding: s.rounding, vatApply: s.vatApply !== false, vatRatePct: s.vatRatePct },
      manualPrice: '', customer: p ? p.customer || '' : '', manager: s.manager || '', date: today(),
      delivery: s.delivery || '', validity: s.validity || '', payment: s.payment || '', remarks: '', status: '작성중', includeBreaks: false,
    };
  }
  function draftFromQuote(q) {
    const d = newDraft(prodById(q.productId) ? q.productId : '');
    Object.assign(d, { qty: q.qty, pricing: clone(q.pricing), customer: q.customer, manager: q.manager, delivery: q.delivery, validity: q.validity, payment: q.payment, remarks: q.remarks, includeBreaks: !!q.includeBreaks });
    (q.breaks || []).forEach((b) => { if (!STD_QTYS.includes(b.qty) && b.qty !== q.qty) d.customQty = b.qty; });
    STD_QTYS.forEach((s) => { d.cmp[s] = (q.breaks || []).some((b) => b.qty === s); });
    return d;
  }
  function nextQuoteNo(date) {
    const prefix = 'KQ-' + String(date).replace(/-/g, '') + '-';
    const max = DB.quotes.filter((q) => String(q.quoteNo).indexOf(prefix) === 0).reduce((m, q) => Math.max(m, parseInt(q.quoteNo.slice(prefix.length), 10) || 0), 0);
    return prefix + String(max + 1).padStart(2, '0');
  }
  function compareQtys() {
    const set = new Set(STD_QTYS.filter((q) => qd.cmp[q]));
    if (N(qd.customQty) >= 1) set.add(Math.floor(N(qd.customQty)));
    if (N(qd.qty) >= 1) set.add(Math.floor(N(qd.qty)));
    return Array.from(set).sort((a, b) => a - b);
  }
  function compute() {
    const p = prodById(qd.productId);
    if (!p) return null;
    const m = matOf(p), qty = N(qd.qty);
    const full = Calc.calcFull(p, m, DB.vendorRates, qty, qd.pricing, qd.manualPrice);
    const rateMissing = qd.pricing.ratePct === '' || qd.pricing.ratePct === null || qd.pricing.ratePct === undefined;
    const rows = compareQtys().map((q) => {
      const r = q === full.cost.qty ? full : Calc.calcFull(p, m, DB.vendorRates, q, qd.pricing, null);
      return { qty: q, main: q === full.cost.qty, r };
    });
    return { p, m, full, rows, rateMissing, qtyOk: qty >= 1 && Number.isInteger(qty) };
  }

  function update() {
    const x = compute();
    const set = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
    if (!x) {
      set('#q-prodinfo', ''); set('#q-cost', '<p class="muted">제품을 먼저 선택하세요.</p>'); set('#q-priceinfo', ''); set('#q-summary', '<p class="muted">제품과 수량, 목표 이익률을 입력하면 견적금액이 계산됩니다.</p>'); set('#q-compare', ''); set('#q-final', '');
      return;
    }
    const { p, m, full, rows, rateMissing, qtyOk } = x;
    const c = full.cost, pr = full.price, q = full.quote, d = pr.decimals;

    set('#q-prodinfo', '<div class="kv" style="margin-top:12px"><div><span>제품코드 / 제품명</span><b style="font-size:15px">' + esc(p.code) + ' / ' + esc(p.name) + '</b>' + sampleBadge(p) + '</div><div><span>규격 / 도면</span><b style="font-size:15px">' + esc(p.spec || '-') + ' / ' + esc(p.drawingNo || '-') + (p.drawingRev ? ' Rev.' + esc(p.drawingRev) : '') + '</b></div>' +
      '<div><span>재질 · 매입단가</span><b style="font-size:15px">' + esc(matLabel(m)) + ' · ' + F(c.material.pricePerKg, 0) + '원/kg</b>' + sampleBadge(m) + '</div><div><span>순중량 → 투입중량</span><b style="font-size:15px">' + F(c.material.netWeightG, 3) + ' g → ' + F(c.material.inputWeightG, 3) + ' g</b></div>' +
      '<div><span>최소 주문 수량 / 포장 단위</span><b style="font-size:15px">' + (N(p.moq) ? F(p.moq, 0) + '개' : '-') + ' / ' + (N(p.packUnit) ? F(p.packUnit, 0) + '개' : '-') + '</b></div></div>' +
      '<p class="small" style="margin:10px 0 0">중량이나 단가가 틀렸다면 → <button class="sm" data-act="editProd">제품 정보·중량 수정</button> <button class="sm" data-act="editCost">공정별 원가 수정</button> <a class="btn sm" style="padding:4px 9px;font-size:13px" href="#materials">원재료 단가 수정</a></p>');

    set('#q-qtymsg', !qtyOk ? '<div class="msg err">견적 수량을 1 이상의 정수로 입력하세요.</div>' : N(p.moq) > 0 && N(qd.qty) < N(p.moq) ? '<div class="msg warn">최소 주문 수량(' + F(p.moq, 0) + '개)보다 적습니다.</div>' : '');

    set('#q-cost', (qtyOk ? '' : '<p class="muted">수량을 입력하면 해당 수량 기준 원가가 표시됩니다. (아래는 1개 기준 임시 계산)</p>') + costTableHtml(c) +
      msgBox('err', '원가 오류 — 수정해야 견적을 저장할 수 있습니다', c.errors) + msgBox('warn', '확인 필요', c.warnings));

    const eq = qd.pricing.mode === 'margin'
      ? '매출액 대비 이익률 ' + pct(pr.ratePct) + ' = 원가 가산율 ' + (pr.ratePct < 100 ? pct(Calc.marginToMarkup(pr.ratePct)) : '-')
      : '원가 가산율 ' + pct(pr.ratePct) + ' = 매출액 대비 이익률 ' + pct(Calc.markupToMargin(pr.ratePct));
    set('#q-priceinfo', rateMissing ? '<div class="msg warn">목표 이익률을 입력하세요.</div>' : pr.errors.length ? msgBox('err', '이익률 오류', pr.errors) :
      '<div class="msg info"><b>목표 판매단가 ' + PF(pr.targetPrice, d) + '원</b><div class="formula">' + esc(pr.formula) + '</div><div class="small" style="margin-top:4px">참고: ' + eq + '</div></div>');

    const ready = qtyOk && !rateMissing && full.ok;
    if (!ready) {
      set('#q-summary', '<p class="muted">' + (!qtyOk ? '수량을 입력하세요.' : rateMissing ? '목표 이익률을 입력하세요.' : '위의 오류를 먼저 수정하세요.') + '</p>');
      set('#q-compare', '');
      set('#q-final', '<button class="pri big" disabled>견적 저장</button> <span class="muted">입력이 끝나면 저장할 수 있습니다.</span>');
      return;
    }
    const banner = full.verdict === 'loss' ? '<div class="msg err big">⚠ 손실 견적입니다. 견적 단가(' + PF(q.unitPrice, d) + '원)가 제조원가(' + F(c.total, 2) + '원)보다 낮아 개당 ' + F(-q.profitPerUnit, 2) + '원, 전체 ' + F(-q.profit, 0) + '원의 손실이 예상됩니다.</div>'
      : full.verdict === 'below' ? '<div class="msg warn big">⚠ 목표 이익률 미달: 실제 매출액 대비 이익률 ' + pct(q.marginPct) + ' (목표 ' + pct(pr.targetMarginPct) + '). 목표 판매단가는 ' + PF(pr.targetPrice, d) + '원입니다.</div>' : '';
    const kv = (label, val, cls) => '<div class="' + (cls || '') + '"><span>' + label + '</span><b>' + val + '</b></div>';
    set('#q-summary', banner + '<div class="kv">' +
      kv('제품 1개당 총제조원가', F(c.total, 2) + ' 원') +
      kv('목표 이익률 (' + (pr.mode === 'margin' ? '매출액 대비' : '원가 가산') + ')', pct(pr.ratePct)) +
      kv('목표 판매단가', PF(pr.targetPrice, d) + ' 원') +
      (full.manual ? kv('견적 단가 (직접 조정)', PF(q.unitPrice, d) + ' 원', 'hl') : '') +
      kv('견적 수량', F(q.qty, 0) + ' 개') +
      kv('공급가액', F(q.supply, 0) + ' 원') +
      kv('부가가치세' + (q.vatApply ? ' (' + F(q.vatRatePct, 1) + '%)' : ' (미적용)'), F(q.vat, 0) + ' 원') +
      kv('총 견적금액', F(q.total, 0) + ' 원', 'hl') +
      kv('제품 1개당 예상이익', F(q.profitPerUnit, 2) + ' 원', q.profit < 0 ? 'neg' : 'pos') +
      kv('전체 주문 예상이익', F(q.profit, 0) + ' 원', q.profit < 0 ? 'neg' : 'pos') +
      kv('매출액 대비 이익률', pct(q.marginPct), q.profit < 0 ? 'neg' : 'pos') + '</div>');

    const basePrice = pr.targetPrice;
    const anyDiff = rows.some((r) => Math.abs(r.r.cost.total - c.total) > 1e-9);
    set('#q-compare', '<h3>수량별 견적 비교 <span class="muted small">— 목표 이익률을 유지할 때의 단가입니다. "단가 조정 여지"는 기준 수량(' + F(q.qty, 0) + '개)의 목표단가 대비입니다.</span></h3>' +
      '<div class="scroll"><table class="tbl"><thead><tr><th>수량</th><th class="r">개당 원가</th><th class="r">판매단가</th><th class="r">공급가액</th><th class="r">예상이익</th><th class="r">이익률</th><th>단가 조정 여지</th><th>판정</th></tr></thead><tbody>' +
      rows.map((row) => {
        const r = row.r, diff = r.price.targetPrice - basePrice;
        const room = row.main ? '기준' : Math.abs(diff) < 1e-9 ? '<span class="muted">변동 없음</span>' : diff < 0 ? '<b style="color:var(--green)">' + PF(-diff, d) + '원 (' + F(-diff / basePrice * 100, 1) + '%) 인하 가능</b>' : '<b style="color:var(--red)">' + PF(diff, d) + '원 (' + F(diff / basePrice * 100, 1) + '%) 인상 필요</b>';
        return '<tr class="' + (r.verdict === 'loss' ? 'row-loss' : r.verdict === 'below' ? 'row-below' : '') + '"><td><b>' + F(row.qty, 0) + '개</b>' + (row.main ? ' <span class="badge blue">견적 수량</span>' : '') + '</td><td class="r">' + F(r.cost.total, 2) + '</td><td class="r"><b>' + PF(r.quote.unitPrice, d) + '</b></td><td class="r">' + F(r.quote.supply, 0) + '</td><td class="r">' + F(r.quote.profit, 0) + '</td><td class="r">' + pct(r.quote.marginPct) + '</td><td>' + room + '</td><td>' + (r.ok ? verdictBadge(r.verdict) : '<span class="badge red" title="' + esc(r.errors.join('\n')) + '">계산 오류</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (anyDiff ? '' : '<p class="small muted" style="margin-top:6px">이 제품에는 수량에 따라 달라지는 원가 조건(외주 수량 구간, 준비시간, 금형 배부, 포장·운송 건당 비용, 수량 구간별 조건)이 등록되어 있지 않아 수량이 달라도 개당 원가가 같습니다.</p>'));

    const notes = [];
    if (c.missing.length) notes.push('미입력 원가 항목 ' + c.missing.length + '개(' + c.missing.join(', ') + ')가 0원으로 계산되었습니다.');
    if (p.isSample || (m && m.isSample)) notes.push('샘플(가상) 데이터로 계산한 견적입니다. 실제 제출용으로 사용하지 마세요.');
    set('#q-final', msgBox('warn', '저장 전 확인', notes) + '<button class="pri big" data-act="save">견적 저장</button> <span class="muted">저장하면 견적번호가 부여되고, 고객사 제출용 견적서(PDF·엑셀)를 만들 수 있습니다.</span>');
  }

  App.views.quote = {
    render(main, params) {
      if (params.copy) { const src = DB.quotes.find((q) => q.id === params.copy); if (src) qd = draftFromQuote(src); }
      else if (params.product && (!qd || qd.productId !== params.product)) qd = newDraft(params.product);
      if (!qd) qd = newDraft('');
      if (qd.productId && !prodById(qd.productId)) qd.productId = '';
      if (params.copy || params.product) { App.params = {}; history.replaceState(null, '', '#quote'); }
      const pg = qd.pricing;
      const qi = (key, label, o) => fld(label, 'q_' + key, qd[key], o);
      const step = (n, title, sub, body) => '<section class="step"><header><i>' + n + '</i>' + title + (sub ? ' <span class="sub">' + sub + '</span>' : '') + '</header><div class="body">' + body + '</div></section>';

      main.innerHTML = '<div class="head"><div><h1>신규 견적 작성</h1><p class="muted">위에서 아래로 순서대로 입력하세요. 입력하는 즉시 계산됩니다.</p></div><div class="bar"><button data-act="reset">처음부터 다시</button></div></div>' +
        (DB.products.length ? '' : '<div class="msg warn">등록된 제품이 없습니다. <a href="#products">[제품 마스터]</a>에서 제품을 먼저 등록하세요.</div>') +
        step(1, '제품 선택', '', '<select id="q-prod">' + productOptions(qd.productId) + '</select><div id="q-prodinfo"></div>') +
        step(2, '수량 입력', '', '<div class="form"><label class="fld"><span>견적 수량<b class="req">*</b></span><div class="inp"><input type="number" id="q-qty" min="1" step="1" value="' + esc(qd.qty) + '"><em>개</em></div></label>' +
          '<label class="fld w2"><span>함께 비교할 수량</span><div class="checks" style="padding-top:6px">' + STD_QTYS.map((s) => '<label><input type="checkbox" data-cmp="' + s + '"' + (qd.cmp[s] ? ' checked' : '') + '>' + F(s, 0) + '개</label>').join('') + '</div></label>' +
          '<label class="fld"><span>직접 입력 수량 (비교용)</span><div class="inp"><input type="number" id="q-custom" min="1" step="1" value="' + esc(qd.customQty) + '"><em>개</em></div></label></div><div id="q-qtymsg"></div>') +
        step(3, '원가 확인', '제품 1개당 · 견적 수량 기준', '<div id="q-cost"></div>') +
        step(4, '목표 이익률 입력', '', '<div class="radio-cards">' +
          '<label class="' + (pg.mode === 'margin' ? 'on' : '') + '"><input type="radio" name="q-mode" value="margin"' + (pg.mode === 'margin' ? ' checked' : '') + '> <b style="display:inline">매출액 대비 이익률 (판매가 기준)</b><small><br>판매단가 = 총원가 ÷ (1 − 이익률) · 예) 원가 80원, 20% → 100원</small></label>' +
          '<label class="' + (pg.mode === 'markup' ? 'on' : '') + '"><input type="radio" name="q-mode" value="markup"' + (pg.mode === 'markup' ? ' checked' : '') + '> <b style="display:inline">원가 가산율 (원가 기준)</b><small><br>판매단가 = 총원가 × (1 + 가산율) · 예) 원가 80원, 20% → 96원</small></label></div>' +
          '<div class="form"><label class="fld"><span>목표 이익률<b class="req">*</b></span><div class="inp"><input type="number" id="q-rate" min="0" step="any" value="' + esc(pg.ratePct) + '"><em>%</em></div></label>' +
          '<label class="fld"><span>단가 소수 자릿수</span><select id="q-dec">' + [[0, '원 단위'], [1, '소수 1자리'], [2, '소수 2자리']].map((o) => '<option value="' + o[0] + '"' + (Number(pg.decimals) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
          '<label class="fld"><span>끝수 처리</span><select id="q-round">' + [['up', '올림'], ['round', '반올림'], ['down', '내림']].map((o) => '<option value="' + o[0] + '"' + (pg.rounding === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
          '<label class="fld"><span>견적 단가 직접 조정 (선택)</span><div class="inp"><input type="number" id="q-manual" min="0" step="any" value="' + esc(qd.manualPrice) + '" placeholder="비우면 목표단가"><em>원</em></div><small>고객 협의 단가가 있을 때만 입력</small></label></div><div id="q-priceinfo"></div>') +
        step(5, '견적금액 확인', '', '<div class="checks" style="margin-bottom:12px"><label><input type="checkbox" id="q-vat"' + (pg.vatApply ? ' checked' : '') + '>부가가치세 적용</label><label>세율 <input type="number" id="q-vatrate" min="0" max="100" step="any" value="' + esc(pg.vatRatePct) + '" style="width:80px"> %</label></div><div id="q-summary"></div><div id="q-compare"></div>') +
        step(6, '견적서 정보 입력 및 저장', '고객사에 제출되는 내용', '<div class="form" id="q-form">' +
          qi('customer', '고객사명', { req: true }) + qi('manager', '견적 담당자') + qi('date', '견적 작성일', { type: 'date' }) + qi('status', '진행 상태', { options: STATUSES.map((s) => [s, s]) }) +
          qi('delivery', '납기', { ph: '예) 발주 후 30일' }) + qi('validity', '견적 유효기간') + qi('payment', '결제조건', { cls: 'w2' }) + qi('remarks', '비고 (견적서에 인쇄됩니다)', { type: 'textarea', cls: 'full' }) + '</div>' +
          '<div class="checks" style="margin:12px 0"><label><input type="checkbox" id="q-breaks"' + (qd.includeBreaks ? ' checked' : '') + '>견적서에 수량별 단가표도 함께 표시 (단가·공급가액만 표시되며 원가·이익은 표시되지 않습니다)</label></div><div id="q-final"></div>');
      update();

      App.onInput = (e) => {
        const t = e.target, v = t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value;
        if (t.id === 'q-prod') return;
        if (t.id === 'q-qty') qd.qty = v;
        else if (t.id === 'q-custom') qd.customQty = v;
        else if (t.dataset.cmp) qd.cmp[t.dataset.cmp] = t.checked;
        else if (t.name === 'q-mode') { qd.pricing.mode = t.value; $$('.radio-cards label').forEach((l) => l.classList.toggle('on', $('input', l).checked)); }
        else if (t.id === 'q-rate') qd.pricing.ratePct = v;
        else if (t.id === 'q-dec') qd.pricing.decimals = Number(t.value);
        else if (t.id === 'q-round') qd.pricing.rounding = t.value;
        else if (t.id === 'q-manual') qd.manualPrice = v;
        else if (t.id === 'q-vat') qd.pricing.vatApply = t.checked;
        else if (t.id === 'q-vatrate') qd.pricing.vatRatePct = v === '' ? 0 : v;
        else if (t.id === 'q-breaks') { qd.includeBreaks = t.checked; return; }
        else if (t.name && t.name.indexOf('q_') === 0) { qd[t.name.slice(2)] = t.value; return; }
        update();
      };
      App.onChange = (e) => {
        if (e.target.id !== 'q-prod') return;
        const keep = qd;
        qd = newDraft(e.target.value);
        Object.assign(qd, { pricing: keep.pricing, cmp: keep.cmp, customQty: keep.customQty, manager: keep.manager, date: keep.date });
        App.render();
      };
      App.actions = {
        reset: () => { qd = newDraft(''); App.render(); window.scrollTo(0, 0); },
        editProd: () => App.openProductForm(qd.productId),
        editCost: () => { location.hash = '#cost?id=' + qd.productId; },
        save: async () => {
          const x = compute();
          if (!x || !x.qtyOk || x.rateMissing || !x.full.ok) return toast('입력 오류를 먼저 수정하세요.', 'err');
          if (!String(qd.customer || '').trim()) { $('[name=q_customer]').focus(); return toast('고객사명을 입력하세요.', 'err'); }
          if (!qd.date) return toast('견적 작성일을 입력하세요.', 'err');
          const { p, m, full, rows } = x, q = full.quote;
          const cautions = [];
          if (full.verdict === 'loss') cautions.push('손실 견적입니다. (예상 손실 ' + F(-q.profit, 0) + '원)');
          if (full.verdict === 'below') cautions.push('목표 이익률 미달입니다. (실제 ' + pct(q.marginPct) + ' / 목표 ' + pct(full.price.targetMarginPct) + ')');
          if (full.cost.missing.length) cautions.push('미입력 원가 항목: ' + full.cost.missing.join(', '));
          if (p.isSample || (m && m.isSample)) cautions.push('샘플(가상) 데이터로 계산한 견적입니다.');
          if (cautions.length && !(await ask('<h2>이대로 저장할까요?</h2>' + msgBox(full.verdict === 'loss' ? 'err' : 'warn', '확인 필요', cautions), '그래도 저장', true))) return;
          const usedIds = new Set();
          rows.forEach((r) => r.r.cost.vendorUsed.forEach((id) => usedIds.add(id)));
          const vendorSnap = DB.vendorRates.filter((v) => usedIds.has(v.id));
          const quote = {
            id: uid(), quoteNo: nextQuoteNo(qd.date), date: qd.date, submittedDate: qd.status === '제출' ? qd.date : '', status: qd.status,
            customer: qd.customer.trim(), manager: qd.manager, delivery: qd.delivery, validity: qd.validity, payment: qd.payment, remarks: qd.remarks,
            includeBreaks: qd.includeBreaks, productId: p.id, qty: full.cost.qty, pricing: clone(qd.pricing), manualPrice: full.manual ? N(qd.manualPrice) : null,
            snap: { product: clone(p), material: clone(m), vendorRates: clone(vendorSnap) },
            result: clone(full), verdict: full.verdict,
            breaks: rows.map((r) => ({ qty: r.qty, unitCost: r.r.cost.total, unitPrice: r.r.quote.unitPrice, supply: r.r.quote.supply, profit: r.r.quote.profit, marginPct: r.r.quote.marginPct, verdict: r.r.verdict })),
            hasSample: !!(p.isSample || (m && m.isSample) || vendorSnap.some((v) => v.isSample)),
            createdAt: new Date().toISOString(),
          };
          DB.quotes.push(quote);
          await Store.save('quotes');
          qd = null;
          toast('견적 ' + quote.quoteNo + '을(를) 저장했습니다.', 'ok');
          location.hash = '#history?open=' + quote.id;
        },
      };
    },
  };
})();
