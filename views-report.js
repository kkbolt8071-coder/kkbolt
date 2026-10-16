/* 대시보드 / 견적 이력 조회 / 제품별 수익성 분석 */
'use strict';
(() => {
  const byDate = (a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || ''));
  const rq = (q) => q.result.quote, rc = (q) => q.result.cost;

  // 제품별: 가장 최근 견적 단가를 "현재 원가"로 다시 평가
  function analysisRows() {
    return DB.products.map((p) => {
      const qs = DB.quotes.filter((q) => q.productId === p.id).sort(byDate);
      const q = qs[qs.length - 1] || null;
      const qty = q ? q.qty : defaultQty(p);
      const cur = costOf(p, qty);
      const row = { p, q, qty, cur, count: qs.length, status: cur.errors.length ? 'error' : 'none' };
      if (q) {
        const price = rq(q).unitPrice;
        row.price = price; row.thenCost = rc(q).total; row.thenMargin = rq(q).marginPct;
        row.nowMargin = price > 0 ? (price - cur.total) / price * 100 : 0;
        row.target = q.result.price.targetMarginPct;
        row.matThen = rc(q).material.pricePerKg; row.matNow = cur.material.pricePerKg;
        if (!cur.errors.length) row.status = row.nowMargin < 0 ? 'loss' : row.nowMargin < row.target - 0.005 ? 'below' : 'ok';
        row.annual = N(p.annualQty) || N(p.monthlyQty) * 12;
        row.sales = row.annual * price; row.profit = row.annual * (price - cur.total);
      }
      return row;
    });
  }
  const STATUS_ORDER = { loss: 0, below: 1, error: 2, ok: 3, none: 4 };
  function rowStatusBadge(r) {
    if (r.status === 'error') return '<span class="badge red" title="' + esc(r.cur.errors.join('\n')) + '">원가 입력 오류</span>';
    if (r.status === 'none') return '<span class="badge">견적 없음</span>';
    return verdictBadge(r.status);
  }
  function quoteRowsHtml(list, compact) {
    return '<div class="scroll"><table class="tbl"><thead><tr><th>견적번호</th><th>작성일</th>' + (compact ? '' : '<th>제출일</th>') + '<th>고객사</th><th>제품</th><th class="r">수량</th><th class="r">단가</th><th class="r">공급가액</th>' +
      (compact ? '' : '<th class="r">당시 원가</th><th class="r">당시 원재료단가</th>') + '<th class="r">예상이익</th><th class="r">이익률</th><th>판정</th><th>상태</th><th></th></tr></thead><tbody>' +
      list.map((q) => {
        const p = q.snap.product, d = q.result.price.decimals;
        return '<tr class="' + (q.verdict === 'loss' ? 'row-loss' : q.verdict === 'below' ? 'row-below' : '') + '"><td class="nowrap"><b>' + esc(q.quoteNo) + '</b>' + (q.hasSample ? ' <span class="badge sample">샘플</span>' : '') + '</td><td class="nowrap">' + esc(q.date) + '</td>' + (compact ? '' : '<td class="nowrap">' + esc(q.submittedDate || '-') + '</td>') +
          '<td>' + esc(q.customer) + '</td><td>' + esc(p.code) + ' ' + esc(p.name) + '</td><td class="r">' + F(q.qty, 0) + '</td><td class="r">' + PF(rq(q).unitPrice, d) + '</td><td class="r">' + F(rq(q).supply, 0) + '</td>' +
          (compact ? '' : '<td class="r">' + F(rc(q).total, 2) + '</td><td class="r">' + F(rc(q).material.pricePerKg, 0) + '</td>') +
          '<td class="r">' + F(rq(q).profit, 0) + '</td><td class="r">' + pct(rq(q).marginPct, 1) + '</td><td>' + verdictBadge(q.verdict) + '</td><td><span class="badge ' + (STATUS_CLASS[q.status] || '') + '">' + esc(q.status) + '</span></td>' +
          '<td><button class="sm" data-act="open" data-id="' + q.id + '">상세</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ═════════════ 대시보드 ═════════════
  App.views.dashboard = {
    render(main) {
      const ym = today().slice(0, 7);
      const month = DB.quotes.filter((q) => q.date.slice(0, 7) === ym);
      const won_ = month.filter((q) => q.status === '수주');
      const bad = DB.quotes.filter((q) => q.verdict !== 'ok');
      const rows = analysisRows();
      const alert = rows.filter((r) => r.status === 'loss' || r.status === 'below').sort((a, b) => a.nowMargin - b.nowMargin);
      const incomplete = rows.filter((r) => r.cur.errors.length || r.cur.missing.length);
      const last = DB.settings.lastBackupAt, days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
      const empty = !DB.products.length && !DB.materials.length;
      main.innerHTML = '<div class="head"><div><h1>대시보드</h1><p class="muted">' + today() + ' 기준</p></div><div class="bar"><a class="btn" href="#history">견적 이력</a><button class="pri big" data-act="newQuote">+ 신규 견적 작성</button></div></div>' +
        (empty ? '<div class="card"><h2>처음 사용하시나요? 아래 순서로 시작하세요.</h2><ol style="line-height:2;margin:0 0 12px;padding-left:22px">' +
          '<li><a href="#settings">회사 정보 · 기본값</a> — 견적서에 인쇄될 회사 정보 입력</li><li><a href="#materials">원재료 단가 관리</a> — 강종별 매입단가(원/kg) 등록</li><li><a href="#vendors">외주가공 단가</a> — 열처리·도금 등 업체별 단가 등록</li>' +
          '<li><a href="#products">제품 마스터</a> — 제품 등록 (엑셀 일괄 등록 가능)</li><li><a href="#cost">제조원가 계산</a> — 제품별 공정 원가 입력</li><li><a href="#quote">신규 견적 작성</a> — 견적 계산 및 견적서 출력</li></ol>' +
          '<p class="muted">먼저 화면을 둘러보고 싶다면 <a href="#backup">[데이터 백업 및 복원]</a>에서 샘플 데이터(가상 값)를 불러올 수 있습니다.</p></div>' : '') +
        '<div class="cards">' +
        '<div class="stat"><span>등록 제품</span><b>' + DB.products.length + '</b><small>원가 미완성 ' + incomplete.length + '개</small></div>' +
        '<div class="stat"><span>이번 달 견적</span><b>' + month.length + '건</b><small>공급가액 ' + F(month.reduce((s, q) => s + rq(q).supply, 0), 0) + '원</small></div>' +
        '<div class="stat"><span>이번 달 수주</span><b>' + won_.length + '건</b><small>공급가액 ' + F(won_.reduce((s, q) => s + rq(q).supply, 0), 0) + '원</small></div>' +
        '<div class="stat ' + (alert.length ? 'warn' : 'good') + '"><span>현재 원가 기준 주의 제품</span><b>' + alert.length + '개</b><small>적자 ' + alert.filter((r) => r.status === 'loss').length + ' · 목표 미달 ' + alert.filter((r) => r.status === 'below').length + '</small></div>' +
        '<div class="stat ' + (bad.length ? 'caution' : '') + '"><span>손실·목표 미달로 저장된 견적</span><b>' + bad.length + '건</b><small>전체 견적 ' + DB.quotes.length + '건</small></div>' +
        '<div class="stat ' + (days === null || days > 7 ? 'caution' : 'good') + '"><span>마지막 백업</span><b>' + (last ? (days === 0 ? '오늘' : days + '일 전') : '없음') + '</b><small><a href="#backup">백업하러 가기</a></small></div></div>' +
        (alert.length ? '<div class="card"><h2>⚠ 주의가 필요한 제품 <span class="muted small">— 최근 견적 단가를 현재 원가로 다시 계산한 결과</span></h2><div class="scroll"><table class="tbl"><thead><tr><th>제품</th><th>고객사</th><th class="r">최근 견적 단가</th><th class="r">당시 원가</th><th class="r">현재 원가</th><th class="r">당시 이익률</th><th class="r">현재 이익률</th><th>판정</th></tr></thead><tbody>' +
          alert.slice(0, 10).map((r) => '<tr class="' + (r.status === 'loss' ? 'row-loss' : 'row-below') + '"><td><b>' + esc(r.p.code) + '</b> ' + esc(r.p.name) + '</td><td>' + esc(r.p.customer) + '</td><td class="r">' + F(r.price, 2) + '</td><td class="r">' + F(r.thenCost, 2) + '</td><td class="r">' + F(r.cur.total, 2) + '</td><td class="r">' + pct(r.thenMargin, 1) + '</td><td class="r"><b>' + pct(r.nowMargin, 1) + '</b></td><td>' + rowStatusBadge(r) + '</td></tr>').join('') +
          '</tbody></table></div><p style="margin:10px 0 0"><a href="#analysis">제품별 수익성 분석 전체 보기 →</a></p></div>' : '') +
        '<div class="card"><h2>최근 견적</h2>' + (DB.quotes.length ? quoteRowsHtml(DB.quotes.slice().sort(byDate).reverse().slice(0, 8), true) : '<div class="empty">저장된 견적이 없습니다.</div>') + '</div>';
      App.actions = { newQuote: () => { location.hash = '#quote'; }, open: (el) => { location.hash = '#history?open=' + el.dataset.id; } };
    },
  };

  // ═════════════ 견적 이력 조회 ═════════════
  const hf = { kw: '', customer: '', product: '', status: '', from: '', to: '', warn: false };
  function filtered() {
    const kw = hf.kw.toLowerCase();
    return DB.quotes.filter((q) => (!kw || [q.quoteNo, q.customer, q.snap.product.code, q.snap.product.name, q.snap.product.spec].join(' ').toLowerCase().includes(kw)) &&
      (!hf.customer || q.customer === hf.customer) && (!hf.product || q.snap.product.code === hf.product) && (!hf.status || q.status === hf.status) &&
      (!hf.from || q.date >= hf.from) && (!hf.to || q.date <= hf.to) && (!hf.warn || q.verdict !== 'ok')).sort(byDate).reverse();
  }

  App.views.history = {
    render(main, params) {
      const customers = Array.from(new Set(DB.quotes.map((q) => q.customer))).sort();
      const prods = Array.from(new Set(DB.quotes.map((q) => q.snap.product.code))).sort();
      const opt = (list, cur, all) => '<option value="">' + all + '</option>' + list.map((v) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('');
      main.innerHTML = '<div class="head"><div><h1>견적 이력 조회</h1><p class="muted">저장된 견적은 당시의 원가·단가 그대로 보존됩니다. 원재료 단가를 바꿔도 과거 견적의 금액은 변하지 않습니다.</p></div><div class="bar"><button data-act="exp">엑셀로 내보내기 (내부용)</button><a class="btn" href="#quote">+ 신규 견적</a></div></div>' +
        '<div class="filters"><input type="search" data-hf="kw" placeholder="견적번호·고객사·제품 검색" value="' + esc(hf.kw) + '"><select data-hf="customer">' + opt(customers, hf.customer, '고객사 전체') + '</select><select data-hf="product">' + opt(prods, hf.product, '제품 전체') + '</select>' +
        '<select data-hf="status">' + opt(STATUSES, hf.status, '진행 상태 전체') + '</select><input type="date" data-hf="from" value="' + hf.from + '" title="작성일 시작"> ~ <input type="date" data-hf="to" value="' + hf.to + '" title="작성일 끝">' +
        '<label class="checks"><span style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-hf="warn"' + (hf.warn ? ' checked' : '') + '>손실·목표 미달만</span></label></div><div id="h-sum" class="muted" style="margin-bottom:8px"></div><div id="h-list"></div>';
      const draw = () => {
        const list = filtered();
        $('#h-sum').textContent = list.length + '건 · 공급가액 합계 ' + F(list.reduce((s, q) => s + rq(q).supply, 0), 0) + '원 · 예상이익 합계 ' + F(list.reduce((s, q) => s + rq(q).profit, 0), 0) + '원';
        $('#h-list').innerHTML = list.length ? quoteRowsHtml(list, false) : '<div class="card empty">' + (DB.quotes.length ? '조건에 맞는 견적이 없습니다.' : '저장된 견적이 없습니다.') + '</div>';
      };
      draw();
      App.onInput = (e) => { const k = e.target.dataset.hf; if (!k) return; hf[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; draw(); };
      App.actions = {
        open: (el) => detail(el.dataset.id),
        exp: () => {
          const head = ['견적번호', '작성일', '제출일', '진행상태', '고객사', '제품코드', '제품명', '규격', '수량', '단가', '공급가액', '부가세', '총액', '당시 개당원가', '당시 원재료단가(원/kg)', '목표이익률(매출대비 %)', '예상이익', '이익률(%)', '판정'];
          saveXlsx('견적이력_내부용_' + today() + '.xlsx', [{ name: '견적이력(내부용)', cols: head.map(() => 14), rows: [head.map((h) => ({ v: h, s: 'head' }))].concat(filtered().map((q) =>
            [q.quoteNo, q.date, q.submittedDate || '', q.status, q.customer, q.snap.product.code, q.snap.product.name, q.snap.product.spec, q.qty, rq(q).unitPrice, rq(q).supply, rq(q).vat, rq(q).total,
              Calc.roundTo(rc(q).total, 4), rc(q).material.pricePerKg, Calc.roundTo(q.result.price.targetMarginPct, 2), Math.round(rq(q).profit), Calc.roundTo(rq(q).marginPct, 2), { loss: '손실', below: '목표 미달', ok: '정상' }[q.verdict]])) }]);
          toast('엑셀 파일을 저장했습니다. 내부 원가가 포함되어 있으니 외부로 보내지 마세요.', 'ok');
        },
      };
      if (params.open) { const id = params.open; App.params = {}; history.replaceState(null, '', '#history'); if (DB.quotes.some((q) => q.id === id)) detail(id); }
    },
  };

  function detail(id) {
    const q = DB.quotes.find((x) => x.id === id);
    if (!q) return;
    const p = q.snap.product, m = q.snap.material || {}, c = rc(q), qq = rq(q), pr = q.result.price, d = pr.decimals;
    const curP = prodById(q.productId);
    const cur = curP ? costOf(curP, q.qty) : null;
    const nowMargin = cur && qq.unitPrice > 0 ? (qq.unitPrice - cur.total) / qq.unitPrice * 100 : null;
    const kv = (label, val, cls) => '<div class="' + (cls || '') + '"><span>' + label + '</span><b>' + val + '</b></div>';
    let compare = '';
    if (cur) {
      const diff = cur.total - c.total, st = nowMargin < 0 ? 'loss' : nowMargin < pr.targetMarginPct - 0.005 ? 'below' : 'ok';
      compare = '<div class="msg ' + (st === 'loss' ? 'err' : st === 'below' ? 'warn' : 'ok') + '"><b>현재 원가 기준 재평가:</b> 원가 ' + F(c.total, 2) + '원 → ' + F(cur.total, 2) + '원 (' + (diff >= 0 ? '+' : '') + F(diff, 2) + '원), ' +
        '원재료 단가 ' + F(c.material.pricePerKg, 0) + ' → ' + F(cur.material.pricePerKg, 0) + '원/kg. 이 견적 단가(' + PF(qq.unitPrice, d) + '원)를 유지하면 이익률은 ' + pct(qq.marginPct, 1) + ' → <b>' + pct(nowMargin, 1) + '</b> ' + verdictBadge(st) +
        (cur.errors.length ? '<br>※ 현재 제품 원가에 입력 오류가 있어 비교가 정확하지 않을 수 있습니다.' : '') + '</div>';
    } else compare = '<div class="msg info">이 제품은 제품 마스터에서 삭제되어 현재 원가와 비교할 수 없습니다. 견적 당시 내용은 그대로 보존되어 있습니다.</div>';
    const body = (q.hasSample ? '<div class="msg warn">샘플(가상) 데이터로 작성된 견적입니다.</div>' : '') +
      (q.verdict === 'loss' ? '<div class="msg err big">⚠ 손실 견적 — 예상 손실 ' + F(-qq.profit, 0) + '원</div>' : q.verdict === 'below' ? '<div class="msg warn big">⚠ 목표 이익률 미달 — 실제 ' + pct(qq.marginPct) + ' / 목표 ' + pct(pr.targetMarginPct) + '</div>' : '') +
      '<div class="form" id="d-form">' + fld('진행 상태', 'status', q.status, { options: STATUSES.map((s) => [s, s]) }) + fld('견적 제출일', 'submittedDate', q.submittedDate, { type: 'date' }) +
      '<label class="fld"><span>&nbsp;</span><button data-act="dSave">상태 저장</button></label></div>' +
      '<h3>견적 내용 (저장 당시 그대로)</h3><div class="kv">' + kv('고객사 / 담당자', '<span style="font-size:15px;display:inline;color:inherit">' + esc(q.customer) + ' / ' + esc(q.manager || '-') + '</span>') + kv('제품', '<span style="font-size:15px;display:inline;color:inherit">' + esc(p.code + ' ' + p.name) + '</span>') +
      kv('견적 수량', F(q.qty, 0) + ' 개') + kv('견적 단가' + (q.manualPrice ? ' (직접 조정)' : ''), PF(qq.unitPrice, d) + ' 원') + kv('공급가액', F(qq.supply, 0) + ' 원') + kv('부가가치세', F(qq.vat, 0) + ' 원') + kv('총 견적금액', F(qq.total, 0) + ' 원', 'hl') +
      kv('당시 개당 원가', F(c.total, 2) + ' 원') + kv('목표 이익률 (' + (pr.mode === 'margin' ? '매출액 대비' : '원가 가산') + ')', pct(pr.ratePct)) + kv('목표 판매단가', PF(pr.targetPrice, d) + ' 원') +
      kv('개당 예상이익', F(qq.profitPerUnit, 2) + ' 원', qq.profit < 0 ? 'neg' : 'pos') + kv('전체 예상이익', F(qq.profit, 0) + ' 원', qq.profit < 0 ? 'neg' : 'pos') + kv('매출액 대비 이익률', pct(qq.marginPct), qq.profit < 0 ? 'neg' : 'pos') +
      kv('당시 원재료 · 단가', '<span style="font-size:15px;display:inline;color:inherit">' + esc(m.grade || '-') + ' · ' + F(c.material.pricePerKg, 2) + ' 원/kg</span>') + '</div>' +
      '<p class="small muted" style="margin-top:8px">납기: ' + esc(q.delivery || '-') + ' · 유효기간: ' + esc(q.validity || '-') + ' · 결제조건: ' + esc(q.payment || '-') + (q.remarks ? ' · 비고: ' + esc(q.remarks) : '') + '</p>' +
      '<h3>원가 내역: 견적 당시 ↔ 현재</h3>' + compare + costTableHtml(c, cur) +
      (q.breaks && q.breaks.length > 1 ? '<h3>수량별 비교 (저장 당시)</h3><div class="scroll"><table class="tbl"><thead><tr><th>수량</th><th class="r">개당 원가</th><th class="r">단가</th><th class="r">공급가액</th><th class="r">예상이익</th><th class="r">이익률</th></tr></thead><tbody>' +
        q.breaks.map((b) => '<tr><td>' + F(b.qty, 0) + '개' + (b.qty === q.qty ? ' <span class="badge blue">견적 수량</span>' : '') + '</td><td class="r">' + F(b.unitCost, 2) + '</td><td class="r">' + PF(b.unitPrice, d) + '</td><td class="r">' + F(b.supply, 0) + '</td><td class="r">' + F(b.profit, 0) + '</td><td class="r">' + pct(b.marginPct, 1) + '</td></tr>').join('') + '</tbody></table></div>' : '');
    const foot = '<button class="danger left" data-act="dDel">견적 삭제</button><button data-act="dCopy">복사하여 새 견적 (현재 원가로 재계산)</button><button data-act="dPreview">견적서 미리보기</button><button data-act="dXlsx">엑셀 저장</button><button class="pri" data-act="dPdf">PDF 저장 · 인쇄</button>';
    openModal('견적 ' + q.quoteNo + ' · ' + q.date, body, { wide: true, foot, noFocus: true });
    Object.assign(App.actions, {
      dSave: async () => {
        const f = readForm($('#d-form'));
        q.status = f.status;
        q.submittedDate = f.submittedDate || (f.status === '제출' ? today() : '');
        await Store.save('quotes');
        toast('진행 상태를 저장했습니다.', 'ok');
        closeModal(); App.render();
      },
      dDel: async () => {
        if (!(await ask('<h2>견적 삭제</h2><p>견적 <b>' + esc(q.quoteNo) + '</b> (' + esc(q.customer) + ')을(를) 삭제할까요? 되돌릴 수 없습니다.</p>', '삭제', true))) return;
        DB.quotes.splice(DB.quotes.indexOf(q), 1);
        await Store.save('quotes');
        closeModal(); toast('삭제했습니다.'); App.render();
      },
      dCopy: () => { closeModal(); location.hash = '#quote?copy=' + q.id; },
      dXlsx: () => excelQuote(q),
      dPdf: () => { toast('인쇄 창에서 대상을 "PDF로 저장"으로 선택하면 PDF 파일로 저장됩니다.'); printQuote(q); },
      dPreview: () => {
        openModal('견적서 미리보기 — ' + q.quoteNo, '<p class="muted small">고객사 제출용입니다. 내부 원가·원재료 매입단가·목표 이익률·예상이익은 포함되지 않습니다.</p><iframe class="preview" id="pv"></iframe>',
          { wide: true, noFocus: true, foot: '<button class="left" data-act="dBack">← 견적 상세로</button><button data-act="dXlsx">엑셀 저장</button><button class="pri" data-act="dPdf">PDF 저장 · 인쇄</button>' });
        $('#pv').srcdoc = quoteDocHtml(q);
      },
      dBack: () => detail(q.id),
    });
  }

  // ═════════════ 제품별 수익성 분석 ═════════════
  function spark(values) {
    if (values.length < 2) return '';
    const w = 110, h = 26, min = Math.min.apply(null, values), max = Math.max.apply(null, values), span = max - min || 1;
    const pts = values.map((v, i) => (4 + i * (w - 8) / (values.length - 1)).toFixed(1) + ',' + (h - 4 - (v - min) / span * (h - 8)).toFixed(1));
    const last = pts[pts.length - 1].split(',');
    return '<svg class="spark" width="' + w + '" height="' + h + '"><polyline fill="none" stroke="#1d6fb8" stroke-width="1.6" points="' + pts.join(' ') + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="#1d6fb8"/></svg>';
  }

  App.views.analysis = {
    render(main) {
      const rows = analysisRows().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.nowMargin || 0) - (b.nowMargin || 0));
      const cnt = (s) => rows.filter((r) => r.status === s).length;
      const withQ = rows.filter((r) => r.q && r.status !== 'error');
      const sales = withQ.reduce((s, r) => s + r.sales, 0), profit = withQ.reduce((s, r) => s + r.profit, 0);
      const cust = {};
      DB.quotes.forEach((q) => {
        const c = cust[q.customer] = cust[q.customer] || { n: 0, supply: 0, profit: 0, wonN: 0, won: 0, bad: 0 };
        c.n++; c.supply += rq(q).supply; c.profit += rq(q).profit; if (q.verdict !== 'ok') c.bad++;
        if (q.status === '수주') { c.wonN++; c.won += rq(q).supply; }
      });
      main.innerHTML = '<div class="head"><div><h1>제품별 수익성 분석</h1><p class="muted">제품별 <b>가장 최근 견적 단가</b>를 <b>현재 원가</b>(현재 원재료 단가·가공비)로 다시 계산해, 원가 상승으로 이익률이 떨어진 제품을 찾습니다.</p></div><div class="bar"><button data-act="exp">엑셀로 내보내기 (내부용)</button></div></div>' +
        '<div class="cards"><div class="stat ' + (cnt('loss') ? 'warn' : '') + '"><span>적자 제품</span><b>' + cnt('loss') + '개</b></div><div class="stat ' + (cnt('below') ? 'caution' : '') + '"><span>목표 이익률 미달</span><b>' + cnt('below') + '개</b></div><div class="stat good"><span>정상</span><b>' + cnt('ok') + '개</b></div>' +
        '<div class="stat"><span>견적 없음 / 원가 오류</span><b>' + cnt('none') + ' / ' + cnt('error') + '</b></div><div class="stat"><span>연간 예상 매출</span><b>' + F(sales, 0) + '</b><small>원 (연간 예상 생산량 × 최근 견적 단가)</small></div>' +
        '<div class="stat ' + (profit < 0 ? 'warn' : '') + '"><span>연간 예상 이익 (현재 원가)</span><b>' + F(profit, 0) + '</b><small>원 · 이익률 ' + (sales > 0 ? pct(profit / sales * 100, 1) : '-') + '</small></div></div>' +
        '<div class="card"><h2>제품별 현황</h2>' + (rows.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>제품</th><th>고객사</th><th class="r">최근 견적 단가</th><th>단가 추이</th><th class="r">당시 원가</th><th class="r">현재 원가</th><th class="r">원재료 단가<br>당시 → 현재</th><th class="r">당시 이익률</th><th class="r">현재 이익률</th><th class="r">변동</th><th class="r">연 예상 매출</th><th class="r">연 예상 이익</th><th>판정</th><th></th></tr></thead><tbody>' +
          rows.map((r) => {
            const p = r.p;
            if (!r.q) return '<tr><td><b>' + esc(p.code) + '</b> ' + esc(p.name) + sampleBadge(p) + '</td><td>' + esc(p.customer) + '</td><td class="r">-</td><td></td><td class="r">-</td><td class="r">' + F(r.cur.total, 2) + '</td><td class="r">' + F(r.cur.material.pricePerKg, 0) + '</td><td colspan="5" class="muted">견적 이력이 없습니다 (현재 원가는 ' + F(r.qty, 0) + '개 기준)</td><td>' + rowStatusBadge(r) + '</td><td></td></tr>';
            const prices = DB.quotes.filter((q) => q.productId === p.id).sort(byDate).map((q) => rq(q).unitPrice);
            const dm = r.nowMargin - r.thenMargin;
            return '<tr class="' + (r.status === 'loss' ? 'row-loss' : r.status === 'below' ? 'row-below' : '') + '"><td><b>' + esc(p.code) + '</b> ' + esc(p.name) + sampleBadge(p) + '</td><td>' + esc(p.customer) + '</td><td class="r">' + F(r.price, 2) + '<br><span class="small muted">' + esc(r.q.date) + ' · ' + F(r.qty, 0) + '개</span></td><td>' + spark(prices) + '<span class="small muted"> ' + r.count + '건</span></td>' +
              '<td class="r">' + F(r.thenCost, 2) + '</td><td class="r"><b>' + F(r.cur.total, 2) + '</b></td><td class="r">' + F(r.matThen, 0) + ' → ' + F(r.matNow, 0) + '</td><td class="r">' + pct(r.thenMargin, 1) + '</td><td class="r"><b>' + pct(r.nowMargin, 1) + '</b></td>' +
              '<td class="r" style="color:' + (dm < -0.05 ? 'var(--red)' : dm > 0.05 ? 'var(--green)' : 'inherit') + '">' + (dm > 0 ? '+' : '') + F(dm, 1) + '%p</td><td class="r">' + (r.annual ? F(r.sales, 0) : '-') + '</td><td class="r">' + (r.annual ? F(r.profit, 0) : '-') + '</td><td>' + rowStatusBadge(r) + '</td>' +
              '<td class="nowrap"><button class="sm" data-act="trend" data-id="' + p.id + '">단가 변동</button> <button class="sm" data-act="requote" data-id="' + p.id + '">재견적</button></td></tr>';
          }).join('') + '</tbody></table></div><p class="small muted" style="margin-top:8px">목표 이익률은 최근 견적에서 입력한 값(매출액 대비로 환산)을 기준으로 판정합니다. 연 예상 매출·이익은 제품 마스터의 연간(또는 월×12) 예상 생산량 기준이며, 미입력 시 "-"로 표시됩니다.</p>' : '<div class="empty">등록된 제품이 없습니다.</div>') + '</div>' +
        '<div class="card"><h2>고객사별 견적 내역</h2>' + (Object.keys(cust).length ? '<div class="scroll"><table class="tbl"><thead><tr><th>고객사</th><th class="r">견적 건수</th><th class="r">견적 공급가액 합계</th><th class="r">예상이익 합계</th><th class="r">평균 이익률</th><th class="r">수주 건수</th><th class="r">수주 공급가액</th><th class="r">손실·미달 견적</th><th></th></tr></thead><tbody>' +
          Object.keys(cust).sort((a, b) => cust[b].supply - cust[a].supply).map((k) => { const c = cust[k]; return '<tr><td><b>' + esc(k) + '</b></td><td class="r">' + c.n + '</td><td class="r">' + F(c.supply, 0) + '</td><td class="r">' + F(c.profit, 0) + '</td><td class="r">' + (c.supply > 0 ? pct(c.profit / c.supply * 100, 1) : '-') + '</td><td class="r">' + c.wonN + '</td><td class="r">' + F(c.won, 0) + '</td><td class="r">' + (c.bad ? '<span class="badge orange">' + c.bad + '건</span>' : '0') + '</td><td><button class="sm" data-act="cust" data-c="' + esc(k) + '">견적 보기</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">저장된 견적이 없습니다.</div>') + '</div>';
      App.actions = {
        requote: (el) => { location.hash = '#quote?product=' + el.dataset.id; },
        cust: (el) => { Object.assign(hf, { kw: '', customer: el.dataset.c, product: '', status: '', from: '', to: '', warn: false }); location.hash = '#history'; },
        open: (el) => { location.hash = '#history?open=' + el.dataset.id; },
        trend: (el) => {
          const p = prodById(el.dataset.id);
          const qs = DB.quotes.filter((q) => q.productId === p.id).sort(byDate);
          openModal('견적 단가 변동 — ' + p.code + ' ' + p.name, '<div class="scroll"><table class="tbl"><thead><tr><th>작성일</th><th>견적번호</th><th>고객사</th><th class="r">수량</th><th class="r">단가</th><th class="r">직전 대비</th><th class="r">당시 원가</th><th class="r">당시 원재료단가</th><th class="r">이익률</th><th>상태</th><th></th></tr></thead><tbody>' +
            qs.map((q, i) => { const prev = i ? rq(qs[i - 1]).unitPrice : null, dp = prev ? (rq(q).unitPrice - prev) / prev * 100 : null; return '<tr><td>' + esc(q.date) + '</td><td>' + esc(q.quoteNo) + '</td><td>' + esc(q.customer) + '</td><td class="r">' + F(q.qty, 0) + '</td><td class="r"><b>' + F(rq(q).unitPrice, 2) + '</b></td><td class="r">' + (dp === null ? '-' : (dp > 0 ? '+' : '') + F(dp, 1) + '%') + '</td><td class="r">' + F(rc(q).total, 2) + '</td><td class="r">' + F(rc(q).material.pricePerKg, 0) + '</td><td class="r">' + pct(rq(q).marginPct, 1) + '</td><td>' + esc(q.status) + '</td><td><button class="sm" data-act="open" data-id="' + q.id + '">상세</button></td></tr>'; }).reverse().join('') +
            '</tbody></table></div>', { wide: true, noFocus: true });
        },
        exp: () => {
          const head = ['제품코드', '제품명', '고객사', '최근 견적일', '기준 수량', '최근 견적 단가', '당시 개당원가', '현재 개당원가', '당시 원재료단가', '현재 원재료단가', '당시 이익률(%)', '현재 이익률(%)', '목표 이익률(%)', '연 예상 수량', '연 예상 매출', '연 예상 이익', '판정'];
          const label = { loss: '적자', below: '목표 미달', ok: '정상', none: '견적 없음', error: '원가 입력 오류' };
          saveXlsx('수익성분석_내부용_' + today() + '.xlsx', [{ name: '수익성(내부용)', cols: head.map(() => 14), rows: [head.map((h) => ({ v: h, s: 'head' }))].concat(rows.map((r) => r.q ?
            [r.p.code, r.p.name, r.p.customer, r.q.date, r.qty, r.price, Calc.roundTo(r.thenCost, 4), Calc.roundTo(r.cur.total, 4), r.matThen, r.matNow, Calc.roundTo(r.thenMargin, 2), Calc.roundTo(r.nowMargin, 2), Calc.roundTo(r.target, 2), r.annual || '', Math.round(r.sales), Math.round(r.profit), label[r.status]] :
            [r.p.code, r.p.name, r.p.customer, '', r.qty, '', '', Calc.roundTo(r.cur.total, 4), '', r.cur.material.pricePerKg, '', '', '', '', '', '', label[r.status]])) }]);
          toast('엑셀 파일을 저장했습니다. 내부 원가가 포함되어 있으니 외부로 보내지 마세요.', 'ok');
        },
      };
    },
  };
})();
