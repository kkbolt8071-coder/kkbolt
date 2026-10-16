/* 기준정보 화면: 제품 마스터 / 원재료 단가 / 외주가공 단가 / 회사 정보 / 백업·복원 */
'use strict';
(() => {
  // ═════════════ 제품 마스터 ═════════════
  let prodSearch = '';
  const PROC_SHORT = { forging: '단조', rolling: '전조', heat: '열처리', plating: '도금', inspection: '선별', outsourcing: '기타외주' };
  const PROC_ALIAS = { 단조: 'forging', 냉간단조: 'forging', 전조: 'rolling', 나사: 'rolling', 열처리: 'heat', 도금: 'plating', 선별: 'inspection', 검사: 'inspection', 기타외주: 'outsourcing', 외주: 'outsourcing' };
  const PROD_HEAD = ['제품코드*', '제품명*', '고객사명', '도면번호', '도면개정번호', '규격', '강종', '원재료규격', '순중량(g)', '투입중량(g)', '손실률(%)', '스크랩회수율(%)', '월예상생산량(개)', '연예상생산량(개)', '최소주문수량(개)', '포장단위(개)', '적용공정', '비고'];

  function newProduct() {
    return { id: uid(), code: '', name: '', customer: '', drawingNo: '', drawingRev: '', spec: '', materialId: '', netWeightG: '', weightMode: 'direct', inputWeightG: '', lossRatePct: '', scrapRecoveryPct: '', monthlyQty: '', annualQty: '', moq: '', packUnit: '', note: '', costs: {}, qtyOverrides: [] };
  }
  function procApplied(p, key) { return ((p.costs || {})[key] || {}).method !== 'none'; }
  function procText(p) { return PROCESS_ITEMS.filter((i) => procApplied(p, i.key)).map((i) => PROC_SHORT[i.key]).join(', '); }
  function setProcs(p, keys) {
    p.costs = p.costs || {};
    PROCESS_ITEMS.forEach((i) => {
      const cur = p.costs[i.key] || {};
      if (keys.includes(i.key)) { if (cur.method === 'none') p.costs[i.key] = Object.assign(cur, { method: 'unset' }); }
      else p.costs[i.key] = Object.assign(cur, { method: 'none' });
    });
  }
  function prodRow(p) {
    const m = matOf(p);
    return [p.code, p.name, p.customer, p.drawingNo, p.drawingRev, p.spec, m ? m.grade : '', m ? m.spec : '',
      N(p.netWeightG) || '', p.weightMode === 'direct' ? N(p.inputWeightG) || '' : '', p.weightMode === 'rate' ? N(p.lossRatePct) : '', N(p.scrapRecoveryPct) || '',
      N(p.monthlyQty) || '', N(p.annualQty) || '', N(p.moq) || '', N(p.packUnit) || '', procText(p), p.note || ''];
  }

  App.views.products = {
    render(main) {
      main.innerHTML = '<div class="head"><div><h1>제품 마스터</h1><p class="muted">제품을 한 번 등록하면 견적을 작성할 때마다 불러와 사용합니다.</p></div>' +
        '<div class="bar"><button data-act="tpl">엑셀 양식 받기</button><button data-act="imp">엑셀 일괄 등록</button><button data-act="exp">엑셀로 내보내기</button><button class="pri" data-act="add">+ 새 제품 등록</button></div></div>' +
        '<div class="filters"><input type="search" id="p-search" placeholder="제품코드·제품명·고객사·규격 검색" value="' + esc(prodSearch) + '"><span class="muted" id="p-count"></span></div><div id="p-list"></div>';
      const draw = () => {
        const kw = prodSearch.toLowerCase();
        const list = DB.products.filter((p) => !kw || [p.code, p.name, p.customer, p.spec, p.drawingNo].join(' ').toLowerCase().includes(kw)).sort((a, b) => a.code.localeCompare(b.code));
        $('#p-count').textContent = list.length + ' / ' + DB.products.length + '건';
        $('#p-list').innerHTML = list.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>제품코드</th><th>제품명</th><th>고객사</th><th>규격</th><th>재질</th><th class="r">순중량(g)</th><th class="r">투입중량(g)</th><th class="r">MOQ</th><th class="r">원가(원/개)</th><th>상태</th><th></th></tr></thead><tbody>' +
          list.map((p) => {
            const c = costOf(p, defaultQty(p));
            const st = c.errors.length ? '<span class="badge red" title="' + esc(c.errors.join('\n')) + '">입력 오류 ' + c.errors.length + '</span>' : c.missing.length ? '<span class="badge orange" title="' + esc(c.missing.join(', ')) + '">원가 미입력 ' + c.missing.length + '</span>' : '<span class="badge green">완료</span>';
            return '<tr><td class="nowrap"><b>' + esc(p.code) + '</b>' + sampleBadge(p) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.customer) + '</td><td>' + esc(p.spec) + '</td><td>' + esc(matLabel(matOf(p))) + '</td>' +
              '<td class="r">' + F(p.netWeightG, 3) + '</td><td class="r">' + F(c.material.inputWeightG, 3) + '</td><td class="r">' + F(p.moq, 0) + '</td><td class="r" title="수량 ' + F(c.qty, 0) + '개 기준">' + F(c.total, 2) + '</td><td>' + st + '</td>' +
              '<td class="nowrap"><button class="sm" data-act="edit" data-id="' + p.id + '">수정</button> <button class="sm" data-act="cost" data-id="' + p.id + '">원가</button> <button class="sm pri" data-act="quote" data-id="' + p.id + '">견적</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="card empty">' + (DB.products.length ? '검색 결과가 없습니다.' : '등록된 제품이 없습니다. [+ 새 제품 등록] 또는 [엑셀 일괄 등록]으로 시작하세요.') + '</div>';
      };
      draw();
      App.onInput = (e) => { if (e.target.id === 'p-search') { prodSearch = e.target.value; draw(); } };
      App.actions = {
        add: () => productForm(newProduct(), true),
        edit: (el) => productForm(clone(prodById(el.dataset.id)), false),
        cost: (el) => { location.hash = '#cost?id=' + el.dataset.id; },
        quote: (el) => { location.hash = '#quote?product=' + el.dataset.id; },
        tpl: () => saveXlsx('제품_일괄등록_양식.xlsx', [
          { name: '제품', rows: [PROD_HEAD.map((h) => ({ v: h, s: 'head' }))], cols: PROD_HEAD.map(() => 15) },
          { name: '작성 안내', cols: [22, 90], rows: [
            [{ v: '항목', s: 'head' }, { v: '설명', s: 'head' }],
            ['공통', '첫째 시트(제품)의 2행부터 입력합니다. * 표시는 필수입니다. 같은 제품코드가 이미 있으면 내용이 수정됩니다.'],
            ['강종 / 원재료규격', '[원재료 단가 관리]에 등록된 강종과 똑같이 입력해야 연결됩니다. 미등록 강종은 "원재료 미지정"으로 등록됩니다.'],
            ['순중량(g)', '제품 1개의 완성품 무게. 반드시 g(그램) 단위. 예) 11.8'],
            ['투입중량(g)', '제품 1개를 만드는 데 들어가는 원재료 무게(손실 포함). g 단위. 입력하면 손실률 칸은 무시됩니다.'],
            ['손실률(%)', '투입중량을 비워 둔 경우에만 사용. 투입중량 = 순중량 ÷ (1 − 손실률)로 계산합니다. 예) 5'],
            ['스크랩회수율(%)', '손실분 중 스크랩으로 판매·회수되는 비율. 없으면 비워 둡니다.'],
            ['적용공정', '쉼표로 구분: 단조, 전조, 열처리, 도금, 선별, 기타외주. 적지 않은 공정은 "해당 없음(0원)"이 됩니다. 칸을 비우면 전체 공정 적용.'],
            ['공정별 가공비', '엑셀로는 등록하지 않습니다. 등록 후 [제조원가 계산] 화면에서 입력하세요.'],
          ] },
          { name: '작성 예시(샘플)', cols: PROD_HEAD.map(() => 15), rows: [PROD_HEAD.map((h) => ({ v: h, s: 'head' })), ['EX-001', '(예시) 육각 플랜지 볼트', '(예시) 고객사', 'DWG-0001', 'A', 'M8×1.25×25', 'SCM435', '', 11.8, 12.5, '', 100, 20000, 240000, 5000, 2000, '단조,전조,열처리,도금,선별', '예시 행입니다']] },
        ]),
        exp: () => saveXlsx('제품목록_' + today() + '.xlsx', [{ name: '제품', cols: PROD_HEAD.map(() => 15), rows: [PROD_HEAD.map((h) => ({ v: h, s: 'head' }))].concat(DB.products.map(prodRow)) }]),
        imp: () => excelImport('제품 일괄 등록', parseProductRow, async (good) => {
          good.forEach((item) => {
            delete item.__new;
            item.updatedAt = new Date().toISOString();
            const i = DB.products.findIndex((p) => p.id === item.id);
            if (i >= 0) DB.products[i] = item; else DB.products.push(item);
          });
          await Store.save('products');
        }),
      };
    },
  };

  function parseProductRow(r, good) {
    const errors = [], warnings = [];
    const code = cellText(r['제품코드']), name = cellText(r['제품명']);
    if (!code) errors.push('제품코드가 없습니다.');
    if (!name) errors.push('제품명이 없습니다.');
    if (code && good.some((g) => g.code === code)) errors.push('파일 안에 제품코드 ' + code + '가 중복됩니다.');
    const existing = DB.products.find((p) => p.code === code);
    const item = existing ? clone(existing) : newProduct();
    item.__new = !existing;
    item.code = code; item.name = name;
    const text = (col, key) => { if (col in r) item[key] = cellText(r[col]); };
    const num = (col, key) => { if (col in r) item[key] = cellNum(r[col], col, errors); };
    text('고객사명', 'customer'); text('도면번호', 'drawingNo'); text('도면개정번호', 'drawingRev'); text('규격', 'spec'); text('비고', 'note');
    num('순중량', 'netWeightG'); num('스크랩회수율', 'scrapRecoveryPct');
    num('월예상생산량', 'monthlyQty'); num('연예상생산량', 'annualQty'); num('최소주문수량', 'moq'); num('포장단위', 'packUnit');
    if ('투입중량' in r || '손실률' in r) {
      const inp = cellNum(r['투입중량'], '투입중량', errors), loss = cellNum(r['손실률'], '손실률', errors);
      if (N(inp) > 0) {
        item.weightMode = 'direct'; item.inputWeightG = inp;
        if (N(loss) > 0) warnings.push('투입중량과 손실률이 모두 입력되어 투입중량만 적용합니다(손실률 중복 적용 방지).');
        if (N(item.netWeightG) > 0 && inp < N(item.netWeightG)) errors.push('투입중량이 순중량보다 작습니다.');
      } else if (loss !== '') {
        if (loss >= 100) errors.push('손실률은 100% 미만이어야 합니다.');
        item.weightMode = 'rate'; item.lossRatePct = loss;
      }
    }
    if (N(item.netWeightG) > 5000) warnings.push('순중량이 5kg을 넘습니다. g 단위가 맞는지 확인하세요.');
    if (N(item.scrapRecoveryPct) > 100) errors.push('스크랩회수율은 100% 이하여야 합니다.');
    if ('강종' in r) {
      const grade = cellText(r['강종']), spec = cellText(r['원재료규격']);
      if (grade) {
        const cands = DB.materials.filter((m) => m.grade.toLowerCase() === grade.toLowerCase());
        const m = cands.find((x) => spec && x.spec === spec) || (cands.length === 1 || !spec ? cands[0] : null);
        if (m) item.materialId = m.id;
        else warnings.push('강종 "' + grade + (spec ? ' / ' + spec : '') + '"이 원재료 단가에 없어 원재료 미지정으로 등록합니다.');
        if (m && cands.length > 1 && !spec) warnings.push('강종 "' + grade + '"이 여러 규격으로 등록되어 있어 첫 번째(' + m.spec + ')에 연결했습니다.');
      }
    }
    const procs = cellText(r['적용공정']);
    if (procs) {
      const keys = [];
      procs.split(/[,，\/\s]+/).filter(Boolean).forEach((t) => { if (PROC_ALIAS[t]) keys.push(PROC_ALIAS[t]); else warnings.push('알 수 없는 공정명 "' + t + '"은 무시합니다.'); });
      setProcs(item, keys);
    }
    return { item, errors, warnings };
  }

  function productForm(p, isNew) {
    const custList = Array.from(new Set(DB.products.map((x) => x.customer).filter(Boolean)));
    const matOpts = [['', '— 선택 —']].concat(DB.materials.map((m) => [m.id, matLabel(m) + ' (' + F(m.pricePerKg, 0) + '원/kg)' + (m.isSample ? ' [샘플]' : '')]));
    const body = '<datalist id="dl-cust">' + custList.map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>' +
      '<h3 style="margin-top:0">기본 정보</h3><div class="form">' +
      fld('제품코드', 'code', p.code, { req: true }) + fld('제품명', 'name', p.name, { req: true, cls: 'w2' }) + fld('고객사명', 'customer', p.customer, { list: 'dl-cust' }) +
      fld('도면번호', 'drawingNo', p.drawingNo) + fld('도면 개정번호', 'drawingRev', p.drawingRev) + fld('규격 및 호칭', 'spec', p.spec, { ph: '예) M8×1.25×25' }) + '</div>' +
      '<h3>원재료 · 중량 <span class="muted small">— 중량은 모두 g(그램) 단위입니다. 1 kg = 1,000 g</span></h3><div class="form">' +
      fld('재질(강종)', 'materialId', p.materialId, { options: matOpts, cls: 'w2', hint: DB.materials.length ? '' : '먼저 [원재료 단가 관리]에서 강종을 등록하세요.' }) +
      fld('제품 1개당 순중량', 'netWeightG', p.netWeightG, { type: 'number', unit: 'g', hint: '' }) +
      fld('투입중량 산정 방식', 'weightMode', p.weightMode, { options: [['direct', '투입중량 직접 입력 (손실 포함)'], ['rate', '순중량 ÷ (1 − 손실률)로 계산']], cls: 'w2', hint: '둘 중 한 가지만 적용되어 손실률이 중복 반영되지 않습니다.' }) +
      fld('원재료 투입중량 (소요량)', 'inputWeightG', p.inputWeightG, { type: 'number', unit: 'g', hint: '' }) +
      fld('원재료 손실률', 'lossRatePct', p.lossRatePct, { type: 'number', unit: '%', hint: '' }) +
      fld('스크랩 회수율', 'scrapRecoveryPct', p.scrapRecoveryPct, { type: 'number', unit: '%', hint: '손실분 중 스크랩으로 회수되는 비율 (없으면 0)' }) + '</div>' +
      '<div id="pf-mat"></div>' +
      '<h3>생산 · 주문</h3><div class="form">' +
      fld('월 예상 생산량', 'monthlyQty', p.monthlyQty, { type: 'number', unit: '개' }) + fld('연간 예상 생산량', 'annualQty', p.annualQty, { type: 'number', unit: '개' }) +
      fld('최소 주문 수량(MOQ)', 'moq', p.moq, { type: 'number', unit: '개' }) + fld('포장 단위', 'packUnit', p.packUnit, { type: 'number', unit: '개/박스' }) + '</div>' +
      '<h3>적용 공정 <span class="muted small">— 체크를 끄면 해당 공정 원가는 0원(해당 없음)으로 처리됩니다.</span></h3><div class="checks">' +
      PROCESS_ITEMS.map((i) => '<label><input type="checkbox" name="proc_' + i.key + '"' + (procApplied(p, i.key) ? ' checked' : '') + '>' + i.name.replace(/비$/, '').replace(' 가공', '') + '</label>').join('') + '</div>' +
      '<h3>비고</h3>' + '<textarea name="note">' + esc(p.note) + '</textarea>';
    const foot = (isNew ? '' : '<button class="danger left" data-act="pDel">삭제</button>') + '<button data-act="closeModal">취소</button><button data-act="pSaveCost">저장 후 원가 입력 →</button><button class="pri" data-act="pSave">저장</button>';
    const refresh = () => {
      const m = $('.modal-back.main');
      const f = readForm(m);
      const rate = f.weightMode === 'rate';
      $('[name=inputWeightG]', m).disabled = rate;
      $('[name=lossRatePct]', m).disabled = !rate;
      const tmp = Object.assign({}, p, f);
      const mc = Calc.calcMaterial(tmp, DB.materials.find((x) => x.id === f.materialId));
      $('[data-hint=netWeightG]', m).textContent = kgHint(f.netWeightG);
      $('[data-hint=inputWeightG]', m).textContent = rate ? '자동 계산: ' + F(mc.inputWeightG, 3) + ' g' : kgHint(f.inputWeightG);
      $('[data-hint=lossRatePct]', m).textContent = rate ? '손실중량 ÷ 투입중량 기준' : '자동 산출: ' + F(mc.lossPct, 2) + '% (참고용)';
      const filled = N(f.netWeightG) > 0 || f.materialId;
      $('#pf-mat', m).innerHTML = !filled ? '' : (mc.errors.length ? msgBox('err', '원재료비를 계산할 수 없습니다', mc.errors) : '<div class="msg info"><b>제품 1개당 원재료비 ' + F(mc.cost, 2) + '원</b><div class="formula">' + esc(mc.formula) + '</div></div>') + msgBox('warn', '단위 확인', mc.warnings);
    };
    openModal(isNew ? '새 제품 등록' : '제품 수정 — ' + p.code, body, { wide: true, foot, onInput: refresh, onChange: refresh });
    refresh();

    const save = async () => {
      const f = readForm($('.modal-back.main'));
      const procKeys = PROCESS_ITEMS.filter((i) => f['proc_' + i.key]).map((i) => i.key);
      Object.keys(f).filter((k) => k.indexOf('proc_') === 0).forEach((k) => delete f[k]);
      Object.assign(p, f);
      setProcs(p, procKeys);
      const errors = Calc.validateProduct(p);
      if (DB.products.some((x) => x.code === p.code && x.id !== p.id)) errors.push('제품코드 "' + p.code + '"는 이미 등록되어 있습니다.');
      if (p.weightMode === 'direct' && N(p.inputWeightG) > 0 && N(p.netWeightG) > N(p.inputWeightG)) errors.push('투입중량이 순중량보다 작습니다. g 단위로 다시 확인하세요.');
      if (p.weightMode === 'rate' && N(p.lossRatePct) >= 100) errors.push('손실률은 100% 미만이어야 합니다.');
      if (errors.length) { toast(errors[0], 'err'); return false; }
      p.updatedAt = new Date().toISOString();
      const i = DB.products.findIndex((x) => x.id === p.id);
      if (i >= 0) DB.products[i] = p; else DB.products.push(p);
      await Store.save('products');
      closeModal();
      toast('제품을 저장했습니다.', 'ok');
      return true;
    };
    App.actions.pSave = async () => { if (await save()) App.render(); };
    App.actions.pSaveCost = async () => { if (await save()) location.hash = '#cost?id=' + p.id; };
    App.actions.pDel = async () => {
      const used = DB.quotes.filter((q) => q.productId === p.id).length;
      if (!(await ask('<h2>제품 삭제</h2><p><b>' + esc(p.code + ' ' + p.name) + '</b>을(를) 삭제할까요?</p>' + (used ? '<p class="muted">이 제품의 견적 이력 ' + used + '건은 저장 당시 내용 그대로 보존됩니다.</p>' : ''), '삭제', true))) return;
      DB.products.splice(DB.products.findIndex((x) => x.id === p.id), 1);
      await Store.save('products');
      closeModal(); toast('삭제했습니다.'); App.render();
    };
  }
  App.openProductForm = (id) => productForm(clone(prodById(id)), false);

  // ═════════════ 원재료 단가 관리 ═════════════
  const MAT_HEAD = ['강종*', '규격', '매입처', '매입단가(원/kg)*', '스크랩단가(원/kg)', '적용일', '비고'];
  function newMaterial() { return { id: uid(), grade: '', spec: '', supplier: '', pricePerKg: '', scrapPricePerKg: '', effectiveDate: today(), note: '', history: [] }; }
  function applyPrice(m, oldPrice) {
    if (oldPrice !== null && N(oldPrice) !== N(m.pricePerKg)) {
      m.history = m.history || [];
      m.history.push({ changedAt: today(), effectiveDate: m.effectiveDate || today(), from: N(oldPrice), to: N(m.pricePerKg) });
    }
  }

  App.views.materials = {
    render(main) {
      main.innerHTML = '<div class="head"><div><h1>원재료 단가 관리</h1><p class="muted">단가는 <b>원/kg</b> 기준입니다. 단가를 바꿔도 이미 저장한 견적의 계산 결과는 바뀌지 않습니다.</p></div>' +
        '<div class="bar"><button data-act="tpl">엑셀 양식 받기</button><button data-act="imp">엑셀 일괄 등록</button><button data-act="exp">엑셀로 내보내기</button><button class="pri" data-act="add">+ 새 원재료 등록</button></div></div>' +
        (DB.materials.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>강종</th><th>규격</th><th>매입처</th><th class="r">매입단가(원/kg)</th><th class="r">스크랩 회수단가(원/kg)</th><th>적용일</th><th class="r">직전 단가</th><th class="r">사용 제품</th><th>비고</th><th></th></tr></thead><tbody>' +
          DB.materials.slice().sort((a, b) => (a.grade + a.spec).localeCompare(b.grade + b.spec)).map((m) => {
            const h = (m.history || [])[(m.history || []).length - 1];
            const diff = h ? (h.to - h.from) / (h.from || 1) * 100 : 0;
            return '<tr><td><b>' + esc(m.grade) + '</b>' + sampleBadge(m) + '</td><td>' + esc(m.spec) + '</td><td>' + esc(m.supplier) + '</td><td class="r"><b>' + F(m.pricePerKg, 2) + '</b></td><td class="r">' + F(m.scrapPricePerKg, 2) + '</td><td>' + esc(m.effectiveDate) + '</td>' +
              '<td class="r">' + (h ? F(h.from, 2) + ' <span style="color:' + (diff > 0 ? 'var(--red)' : 'var(--green)') + '">(' + (diff > 0 ? '+' : '') + F(diff, 1) + '%)</span>' : '-') + '</td>' +
              '<td class="r">' + DB.products.filter((p) => p.materialId === m.id).length + '</td><td class="small">' + esc(m.note) + '</td><td><button class="sm" data-act="edit" data-id="' + m.id + '">수정</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="card empty">등록된 원재료가 없습니다. SCM435 등 실제 사용하는 강종과 매입단가를 등록하세요.</div>');
      App.actions = {
        add: () => materialForm(newMaterial(), true),
        edit: (el) => materialForm(clone(DB.materials.find((m) => m.id === el.dataset.id)), false),
        tpl: () => saveXlsx('원재료단가_일괄등록_양식.xlsx', [
          { name: '원재료', rows: [MAT_HEAD.map((h) => ({ v: h, s: 'head' }))], cols: [14, 16, 18, 18, 18, 14, 30] },
          { name: '작성 안내', cols: [22, 90], rows: [[{ v: '항목', s: 'head' }, { v: '설명', s: 'head' }],
            ['공통', '첫째 시트(원재료)의 2행부터 입력합니다. 강종과 규격이 같은 자료가 이미 있으면 단가가 수정되고 변경 이력이 남습니다.'],
            ['매입단가(원/kg)', '반드시 1kg당 금액으로 입력합니다. (톤당 단가라면 1,000으로 나누어 입력)'],
            ['스크랩단가(원/kg)', '스크랩을 판매·회수할 때 받는 1kg당 금액. 없으면 비워 둡니다.'],
            ['적용일', '예) 2026-01-01']] },
        ]),
        exp: () => saveXlsx('원재료단가_' + today() + '.xlsx', [{ name: '원재료', cols: [14, 16, 18, 18, 18, 14, 30], rows: [MAT_HEAD.map((h) => ({ v: h, s: 'head' }))].concat(DB.materials.map((m) => [m.grade, m.spec, m.supplier, N(m.pricePerKg), N(m.scrapPricePerKg) || '', m.effectiveDate, m.note])) }]),
        imp: () => excelImport('원재료 단가 일괄 등록', (r, good) => {
          const errors = [], warnings = [];
          const grade = cellText(r['강종']), spec = cellText(r['규격']);
          if (!grade) errors.push('강종이 없습니다.');
          if (good.some((g) => g.grade === grade && g.spec === spec)) errors.push('파일 안에 같은 강종·규격이 중복됩니다.');
          const existing = DB.materials.find((m) => m.grade === grade && (m.spec || '') === spec);
          const item = existing ? clone(existing) : newMaterial();
          item.__new = !existing; item.__old = existing ? existing.pricePerKg : null;
          item.grade = grade; item.spec = spec;
          if ('매입처' in r) item.supplier = cellText(r['매입처']);
          if ('비고' in r) item.note = cellText(r['비고']);
          const price = cellNum(r['매입단가'], '매입단가', errors);
          if (!(N(price) > 0)) errors.push('매입단가(원/kg)가 없습니다.');
          else { item.pricePerKg = price; if (price < 100) warnings.push('단가가 100원/kg 미만입니다. 원/kg 단위가 맞는지 확인하세요.'); if (price > 100000) warnings.push('단가가 100,000원/kg을 넘습니다. 톤당 단가를 입력하지 않았는지 확인하세요.'); }
          if ('스크랩단가' in r) item.scrapPricePerKg = cellNum(r['스크랩단가'], '스크랩단가', errors);
          if (N(item.scrapPricePerKg) > N(item.pricePerKg)) warnings.push('스크랩단가가 매입단가보다 높습니다.');
          item.effectiveDate = cellDate(r['적용일']) || today();
          return { item, errors, warnings };
        }, async (good) => {
          good.forEach((item) => {
            const old = item.__old; delete item.__new; delete item.__old;
            applyPrice(item, old);
            const i = DB.materials.findIndex((m) => m.id === item.id);
            if (i >= 0) DB.materials[i] = item; else DB.materials.push(item);
          });
          await Store.save('materials');
        }),
      };
    },
  };

  function materialForm(m, isNew) {
    const oldPrice = isNew ? null : m.pricePerKg;
    const hist = (m.history || []).slice().reverse();
    const body = '<div class="form">' + fld('강종', 'grade', m.grade, { req: true, ph: '예) SCM435' }) + fld('원재료 규격', 'spec', m.spec, { ph: '예) Φ7.2 선재' }) + fld('매입처', 'supplier', m.supplier) +
      fld('매입단가', 'pricePerKg', m.pricePerKg, { type: 'number', unit: '원/kg', req: true, hint: '' }) + fld('스크랩 회수단가', 'scrapPricePerKg', m.scrapPricePerKg, { type: 'number', unit: '원/kg', hint: '회수하지 않으면 0 또는 빈칸' }) +
      fld('단가 적용일', 'effectiveDate', m.effectiveDate, { type: 'date' }) + fld('비고', 'note', m.note, { cls: 'full' }) + '</div>' +
      (hist.length ? '<h3>단가 변경 이력</h3><div class="scroll"><table class="tbl"><thead><tr><th>변경일</th><th>적용일</th><th class="r">변경 전(원/kg)</th><th class="r">변경 후(원/kg)</th><th class="r">변동률</th></tr></thead><tbody>' +
        hist.map((h) => '<tr><td>' + esc(h.changedAt) + '</td><td>' + esc(h.effectiveDate) + '</td><td class="r">' + F(h.from, 2) + '</td><td class="r">' + F(h.to, 2) + '</td><td class="r">' + (h.from ? (h.to > h.from ? '+' : '') + F((h.to - h.from) / h.from * 100, 1) + '%' : '-') + '</td></tr>').join('') + '</tbody></table></div>' : '');
    const hint = () => {
      const v = N($('.modal-back.main [name=pricePerKg]').value);
      $('.modal-back.main [data-hint=pricePerKg]').textContent = v > 0 ? '1kg당 ' + F(v, 2) + '원 = 1톤당 ' + F(v * 1000, 0) + '원' : '1kg당 금액 (톤당 단가 ÷ 1,000)';
    };
    openModal(isNew ? '새 원재료 등록' : '원재료 수정 — ' + m.grade, body, { foot: (isNew ? '' : '<button class="danger left" data-act="mDel">삭제</button>') + '<button data-act="closeModal">취소</button><button class="pri" data-act="mSave">저장</button>', onInput: hint });
    hint();
    App.actions.mSave = async () => {
      Object.assign(m, readForm($('.modal-back.main')));
      if (!m.grade) return toast('강종을 입력하세요.', 'err');
      if (!(N(m.pricePerKg) > 0)) return toast('매입단가(원/kg)를 0보다 크게 입력하세요.', 'err');
      if (N(m.scrapPricePerKg) < 0) return toast('스크랩 단가는 0 이상이어야 합니다.', 'err');
      if (DB.materials.some((x) => x.id !== m.id && x.grade === m.grade && (x.spec || '') === (m.spec || ''))) return toast('같은 강종·규격이 이미 등록되어 있습니다.', 'err');
      if ((N(m.pricePerKg) < 100 || N(m.pricePerKg) > 100000) && !(await ask('<h2>단위 확인</h2><p>매입단가가 <b>' + F(m.pricePerKg, 2) + ' 원/kg</b>입니다. 1kg당 금액이 맞습니까?</p>', '맞습니다'))) return;
      const affected = oldPrice !== null && N(oldPrice) !== N(m.pricePerKg) ? DB.products.filter((p) => p.materialId === m.id).length : 0;
      applyPrice(m, oldPrice);
      const i = DB.materials.findIndex((x) => x.id === m.id);
      if (i >= 0) DB.materials[i] = m; else DB.materials.push(m);
      await Store.save('materials');
      closeModal();
      toast(affected ? '저장했습니다. 이 원재료를 쓰는 제품 ' + affected + '개의 현재 원가가 바뀝니다. [수익성 분석]을 확인하세요.' : '저장했습니다.', 'ok');
      App.render();
    };
    App.actions.mDel = async () => {
      const used = DB.products.filter((p) => p.materialId === m.id);
      if (used.length) return toast('제품 ' + used.length + '개(' + used.slice(0, 3).map((p) => p.code).join(', ') + ')가 사용 중이라 삭제할 수 없습니다.', 'err');
      if (!(await ask('<h2>원재료 삭제</h2><p><b>' + esc(matLabel(m)) + '</b>을(를) 삭제할까요?</p>', '삭제', true))) return;
      DB.materials.splice(DB.materials.findIndex((x) => x.id === m.id), 1);
      await Store.save('materials');
      closeModal(); toast('삭제했습니다.'); App.render();
    };
  }

  // ═════════════ 외주가공 단가 ═════════════
  const VENDOR_PROCS = Calc.COST_ITEMS.filter((i) => i.methods.includes('vendor'));
  App.views.vendors = {
    render(main) {
      main.innerHTML = '<div class="head"><div><h1>외주가공 단가</h1><p class="muted">업체별 단가와 가공조건을 등록해 두면 [제조원가 계산]에서 "외주 단가표 적용"으로 자동 계산합니다.</p></div>' +
        '<div class="bar"><button class="pri" data-act="add">+ 새 외주 단가 등록</button></div></div>' +
        (DB.vendorRates.length ? '<div class="scroll"><table class="tbl"><thead><tr><th>공정</th><th>업체명</th><th>가공조건</th><th>단가 기준</th><th>수량 구간별 단가</th><th class="r">최소 가공비(원/로트)</th><th>적용일</th><th class="r">사용 제품</th><th></th></tr></thead><tbody>' +
          DB.vendorRates.slice().sort((a, b) => Calc.itemDef(a.process).no - Calc.itemDef(b.process).no).map((v) =>
            '<tr><td>' + Calc.itemDef(v.process).name + '</td><td><b>' + esc(v.vendor) + '</b>' + sampleBadge(v) + '</td><td>' + esc(v.condition) + '</td><td>' + (v.unit === 'kg' ? '원/kg (순중량 기준)' : '원/개') + '</td>' +
            '<td>' + (v.tiers || []).map((t) => F(t.minQty, 0) + '개 이상: <b>' + F(t.price, 2) + '</b>').join('<br>') + '</td><td class="r">' + (N(v.minCharge) ? F(v.minCharge, 0) : '-') + '</td><td>' + esc(v.effectiveDate) + '</td>' +
            '<td class="r">' + DB.products.filter((p) => Object.values(p.costs || {}).some((c) => c.method === 'vendor' && c.params && c.params.vendorRateId === v.id)).length + '</td>' +
            '<td><button class="sm" data-act="edit" data-id="' + v.id + '">수정</button></td></tr>').join('') + '</tbody></table></div>'
          : '<div class="card empty">등록된 외주 단가가 없습니다. 열처리·도금 등 외주 업체의 단가표를 등록하세요.</div>');
      App.actions = {
        add: () => vendorForm({ id: uid(), vendor: '', process: 'heat', condition: '', unit: 'kg', tiers: [{ minQty: 1, price: '' }], minCharge: '', effectiveDate: today(), note: '' }, true),
        edit: (el) => vendorForm(clone(DB.vendorRates.find((v) => v.id === el.dataset.id)), false),
      };
    },
  };

  function vendorForm(v, isNew) {
    const sync = () => {
      const m = $('.modal-back.main');
      if (!m) return;
      const f = readForm(m);
      ['vendor', 'process', 'condition', 'unit', 'minCharge', 'effectiveDate', 'note'].forEach((k) => { v[k] = f[k]; });
      v.tiers = $$('[data-tier]', m).map((row) => ({ minQty: $('.t-min', row).value, price: $('.t-price', row).value }));
    };
    const draw = () => {
      const unitLabel = v.unit === 'kg' ? '원/kg' : '원/개';
      const body = '<div class="form">' + fld('업체명', 'vendor', v.vendor, { req: true }) + fld('공정', 'process', v.process, { options: VENDOR_PROCS.map((i) => [i.key, i.name]) }) +
        fld('가공조건', 'condition', v.condition, { ph: '예) 조질 10.9급 / 아연니켈 8㎛', cls: 'w2' }) +
        fld('단가 기준', 'unit', v.unit, { options: [['kg', '원/kg — 제품 순중량 기준'], ['ea', '원/개']] }) +
        fld('최소 가공비 (로트당)', 'minCharge', v.minCharge, { type: 'number', unit: '원', hint: '로트 금액이 이보다 작으면 최소 가공비 적용. 없으면 빈칸' }) +
        fld('단가 적용일', 'effectiveDate', v.effectiveDate, { type: 'date' }) + fld('비고', 'note', v.note, { cls: 'full' }) + '</div>' +
        '<h3>수량 구간별 단가 <span class="muted small">— 주문 수량이 "이상"인 구간 중 가장 큰 구간의 단가를 적용합니다. 구간이 하나면 수량과 무관하게 같은 단가입니다.</span></h3>' +
        '<table class="tbl"><thead><tr><th>수량 (개 이상)</th><th>단가 (' + unitLabel + ')</th><th></th></tr></thead><tbody>' +
        v.tiers.map((t, i) => '<tr data-tier="' + i + '"><td><input type="number" class="t-min" min="1" step="1" value="' + esc(t.minQty) + '"></td><td><input type="number" class="t-price" min="0" step="any" value="' + esc(t.price) + '"></td><td>' + (v.tiers.length > 1 ? '<button class="sm" data-act="vTierDel" data-i="' + i + '">삭제</button>' : '') + '</td></tr>').join('') +
        '</tbody></table><p style="margin-top:8px"><button class="sm" data-act="vTierAdd">+ 수량 구간 추가</button></p>';
      openModal(isNew ? '새 외주 단가 등록' : '외주 단가 수정 — ' + v.vendor, body, { foot: (isNew ? '' : '<button class="danger left" data-act="vDel">삭제</button>') + '<button data-act="closeModal">취소</button><button class="pri" data-act="vSave">저장</button>', onChange: (e) => { if (e.target.name === 'unit') { sync(); draw(); } }, noFocus: !isNew });
    };
    draw();
    App.actions.vTierAdd = () => { sync(); v.tiers.push({ minQty: '', price: '' }); draw(); };
    App.actions.vTierDel = (el) => { sync(); v.tiers.splice(Number(el.dataset.i), 1); draw(); };
    App.actions.vSave = async () => {
      sync();
      if (!v.vendor) return toast('업체명을 입력하세요.', 'err');
      const tiers = v.tiers.map((t) => ({ minQty: N(t.minQty), price: N(t.price), blank: t.price === '' }));
      if (tiers.some((t) => !(t.minQty >= 1) || !Number.isInteger(t.minQty))) return toast('수량 구간은 1 이상의 정수로 입력하세요.', 'err');
      if (tiers.some((t) => t.blank || t.price < 0)) return toast('구간별 단가를 0 이상으로 입력하세요.', 'err');
      if (new Set(tiers.map((t) => t.minQty)).size !== tiers.length) return toast('같은 수량 구간이 중복됩니다.', 'err');
      v.tiers = tiers.map((t) => ({ minQty: t.minQty, price: t.price })).sort((a, b) => a.minQty - b.minQty);
      v.minCharge = N(v.minCharge) || '';
      const i = DB.vendorRates.findIndex((x) => x.id === v.id);
      if (i >= 0) DB.vendorRates[i] = v; else DB.vendorRates.push(v);
      await Store.save('vendorRates');
      closeModal(); toast('저장했습니다.', 'ok'); App.render();
    };
    App.actions.vDel = async () => {
      const used = DB.products.filter((p) => Object.values(p.costs || {}).some((c) => c.method === 'vendor' && c.params && c.params.vendorRateId === v.id));
      if (used.length) return toast('제품 ' + used.length + '개(' + used.slice(0, 3).map((p) => p.code).join(', ') + ')가 사용 중이라 삭제할 수 없습니다.', 'err');
      if (!(await ask('<h2>외주 단가 삭제</h2><p><b>' + esc(v.vendor) + '</b> 단가를 삭제할까요?</p>', '삭제', true))) return;
      DB.vendorRates.splice(DB.vendorRates.findIndex((x) => x.id === v.id), 1);
      await Store.save('vendorRates');
      closeModal(); toast('삭제했습니다.'); App.render();
    };
  }

  // ═════════════ 회사 정보 · 기본값 ═════════════
  App.views.settings = {
    render(main) {
      const s = DB.settings, c = s.company;
      main.innerHTML = '<div class="head"><div><h1>회사 정보 · 기본값</h1><p class="muted">견적서에 인쇄되는 회사 정보와 새 견적을 만들 때 미리 채워지는 값입니다.</p></div></div>' +
        '<div class="card" id="set-form"><h2>견적서에 표시되는 회사 정보</h2><div class="form">' +
        fld('회사명', 'c_name', c.name) + fld('대표자', 'c_ceo', c.ceo) + fld('사업자등록번호', 'c_bizNo', c.bizNo) + fld('주소', 'c_address', c.address, { cls: 'w2' }) +
        fld('전화', 'c_tel', c.tel) + fld('팩스', 'c_fax', c.fax) + fld('이메일', 'c_email', c.email) + fld('기본 견적 담당자', 'manager', s.manager) + '</div>' +
        '<h2 style="margin-top:22px">새 견적 기본값</h2><div class="form">' +
        fld('이익률 계산 방식', 'pricingMode', s.pricingMode, { options: [['margin', '매출액 대비 이익률 (판매가 기준)'], ['markup', '원가 가산율 (원가 기준)']], cls: 'w2' }) +
        fld('기본 목표 이익률', 'targetRatePct', s.targetRatePct, { type: 'number', unit: '%', hint: '비워 두면 견적마다 직접 입력합니다.' }) +
        fld('단가 소수 자릿수', 'decimals', s.decimals, { options: [[0, '원 단위 (소수 없음)'], [1, '소수 1자리'], [2, '소수 2자리']] }) +
        fld('단가 끝수 처리', 'rounding', s.rounding, { options: [['up', '올림 (목표 이익률 보장)'], ['round', '반올림'], ['down', '내림']] }) +
        fld('부가가치세율', 'vatRatePct', s.vatRatePct, { type: 'number', unit: '%' }) +
        fld('기본 납기', 'delivery', s.delivery, { ph: '예) 발주 후 30일' }) + fld('기본 견적 유효기간', 'validity', s.validity) + fld('기본 결제조건', 'payment', s.payment, { ph: '예) 월말 마감 익월 말 현금' }) +
        '</div><p style="margin-top:16px"><button class="pri big" data-act="save">저장</button></p></div>';
      App.actions = {
        save: async () => {
          const f = readForm($('#set-form'));
          if (N(f.targetRatePct) < 0 || (f.pricingMode === 'margin' && N(f.targetRatePct) >= 100)) return toast('목표 이익률은 0% 이상 100% 미만으로 입력하세요.', 'err');
          if (N(f.vatRatePct) < 0 || N(f.vatRatePct) > 100) return toast('부가가치세율을 확인하세요.', 'err');
          Object.keys(f).forEach((k) => { if (k.indexOf('c_') === 0) c[k.slice(2)] = f[k]; else s[k] = f[k]; });
          s.decimals = Number(s.decimals);
          await Store.save('settings');
          toast('저장했습니다.', 'ok');
        },
      };
    },
  };

  // ═════════════ 데이터 백업 및 복원 ═════════════
  App.views.backup = {
    render(main) {
      const last = DB.settings.lastBackupAt;
      const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
      const nSample = DB.materials.concat(DB.vendorRates, DB.products).filter((x) => x.isSample).length;
      main.innerHTML = '<div class="head"><div><h1>데이터 백업 및 복원</h1><p class="muted">자료는 이 컴퓨터의 브라우저 안에만 저장됩니다. 브라우저 기록(쿠키·사이트 데이터)을 지우면 함께 사라지므로 <b>정기적으로 백업 파일을 받아 두세요.</b></p></div></div>' +
        '<div class="cards"><div class="stat"><span>제품</span><b>' + DB.products.length + '</b></div><div class="stat"><span>원재료</span><b>' + DB.materials.length + '</b></div><div class="stat"><span>외주 단가</span><b>' + DB.vendorRates.length + '</b></div><div class="stat"><span>견적 이력</span><b>' + DB.quotes.length + '</b></div>' +
        '<div class="stat ' + (days === null || days > 7 ? 'caution' : 'good') + '"><span>마지막 백업</span><b>' + (last ? (days === 0 ? '오늘' : days + '일 전') : '없음') + '</b><small>' + (last ? new Date(last).toLocaleString('ko-KR') : '아직 백업한 적이 없습니다') + '</small></div></div>' +
        '<div class="card"><h2>① 백업 — 파일로 내려받기</h2><p>모든 제품·단가·견적 이력·설정을 파일 하나로 저장합니다. 받은 파일은 USB나 회사 공유폴더 등 <b>다른 장소</b>에도 복사해 두세요.</p><button class="pri big" data-act="backup">백업 파일 받기</button></div>' +
        '<div class="card"><h2>② 복원 — 백업 파일에서 되돌리기</h2><p>백업 파일의 내용으로 <b>현재 자료를 모두 바꿉니다.</b> 다른 컴퓨터로 옮길 때도 이 기능을 사용합니다.</p><button class="big" data-act="restore">백업 파일 선택하여 복원</button></div>' +
        '<div class="card"><h2>샘플 데이터</h2><p>화면을 익히기 위한 <b>가상의 숫자</b>입니다. 실제 회사 단가가 아니므로 실제 견적에 사용하지 마세요. 현재 샘플 ' + nSample + '건.</p><div class="bar"><button data-act="sampleLoad">샘플 데이터 불러오기</button><button class="danger" data-act="sampleDel"' + (nSample ? '' : ' disabled') + '>샘플 데이터 모두 삭제</button></div></div>' +
        '<div class="card"><h2>계산 자체 점검</h2><p>원재료비·제조원가·판매단가·견적금액 계산식과 견적서 정보 차단, 엑셀 생성을 자동으로 검사합니다.</p><button data-act="selftest">계산 자체 점검 실행</button><div id="st-out"></div></div>' +
        '<div class="card"><h2>전체 초기화</h2><p class="muted">모든 자료를 지우고 처음 상태로 되돌립니다. 되돌릴 수 없으니 먼저 백업하세요.</p><button class="danger" data-act="reset">모든 자료 삭제</button></div>';
      App.actions = {
        backup: async () => {
          DB.settings.lastBackupAt = new Date().toISOString();
          await Store.save('settings');
          const stamp = new Date().toTimeString().slice(0, 5).replace(':', '');
          download('금강볼트_견적앱_백업_' + today() + '_' + stamp + '.json', JSON.stringify(Store.exportData(), null, 1), 'application/json');
          toast('백업 파일을 저장했습니다. (다운로드 폴더)', 'ok');
          App.render();
        },
        restore: async () => {
          const file = await pickFile('.json');
          if (!file) return;
          let obj;
          try { obj = Store.checkBackup(JSON.parse(await file.text())); }
          catch (e) { return toast('복원할 수 없습니다: ' + (e instanceof SyntaxError ? '백업 파일 형식이 아닙니다.' : e.message), 'err'); }
          const d = obj.data;
          if (!(await ask('<h2>백업 복원</h2><p>파일: ' + esc(file.name) + '<br>백업 일시: ' + new Date(obj.exportedAt).toLocaleString('ko-KR') + '</p>' +
            '<div class="msg info">제품 ' + d.products.length + '건 · 원재료 ' + d.materials.length + '건 · 외주 단가 ' + d.vendorRates.length + '건 · 견적 ' + d.quotes.length + '건</div>' +
            '<div class="msg warn"><b>현재 자료(제품 ' + DB.products.length + '건, 견적 ' + DB.quotes.length + '건)는 모두 지워지고 백업 내용으로 바뀝니다.</b></div>', '복원', true))) return;
          await Store.importData(obj);
          toast('복원했습니다.', 'ok');
          App.render();
        },
        sampleLoad: async () => {
          const s = Sample.build();
          ['materials', 'vendorRates', 'products'].forEach((k) => s[k].forEach((item) => { if (!DB[k].some((x) => x.id === item.id)) DB[k].push(item); }));
          await Store.save('materials'); await Store.save('vendorRates'); await Store.save('products');
          toast('샘플 데이터를 불러왔습니다. 실제 값이 아닙니다.', 'ok');
          App.render();
        },
        sampleDel: async () => {
          if (!(await ask('<h2>샘플 데이터 삭제</h2><p>[샘플] 표시가 있는 제품·원재료·외주 단가 ' + nSample + '건을 삭제합니다. 샘플로 만든 견적 이력은 [견적 이력 조회]에서 따로 삭제하세요.</p>', '삭제', true))) return;
          ['materials', 'vendorRates', 'products'].forEach((k) => { DB[k] = DB[k].filter((x) => !x.isSample); });
          await Store.save('materials'); await Store.save('vendorRates'); await Store.save('products');
          toast('샘플 데이터를 삭제했습니다.', 'ok');
          App.render();
        },
        selftest: async () => {
          $('#st-out').innerHTML = '<p class="muted">점검 중…</p>';
          let res;
          try { res = await SelfTest.run({ Calc, XlsxLite, QuoteDoc }); }
          catch (e) { $('#st-out').innerHTML = '<div class="msg err">점검 중 오류: ' + esc(e.message) + '</div>'; return; }
          const fail = res.filter((r) => !r.pass);
          const groups = Array.from(new Set(res.map((r) => r.group)));
          $('#st-out').innerHTML = '<div class="msg big ' + (fail.length ? 'err' : 'ok') + '">' + res.length + '건 중 ' + (res.length - fail.length) + '건 통과' + (fail.length ? ', ' + fail.length + '건 실패' : ' — 모든 계산이 정상입니다.') + '</div>' +
            groups.map((g) => '<details' + (res.some((r) => r.group === g && !r.pass) ? ' open' : '') + '><summary><b>' + esc(g) + '</b> (' + res.filter((r) => r.group === g && r.pass).length + '/' + res.filter((r) => r.group === g).length + ')</summary><ul>' +
              res.filter((r) => r.group === g).map((r) => '<li style="color:' + (r.pass ? 'inherit' : 'var(--red)') + '">' + (r.pass ? '통과' : '<b>실패</b>') + ' — ' + esc(r.name) + (r.pass ? '' : ' <span class="small">(' + esc(r.detail) + ')</span>') + '</li>').join('') + '</ul></details>').join('');
        },
        reset: async () => {
          if (!(await ask('<h2>전체 초기화</h2><div class="msg err"><b>제품 ' + DB.products.length + '건, 견적 ' + DB.quotes.length + '건을 포함한 모든 자료가 삭제됩니다.</b> 되돌릴 수 없습니다.</div><p>백업 파일을 받아 두셨습니까?</p>', '모두 삭제', true))) return;
          if (!(await ask('<h2>마지막 확인</h2><p>정말 모든 자료를 삭제할까요?</p>', '삭제합니다', true))) return;
          await Store.resetAll();
          toast('초기화했습니다.');
          App.render();
        },
      };
    },
  };
})();
