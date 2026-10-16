/* 제조원가 계산 화면: 제품별 13개 원가 항목 입력 + 계산 근거 확인 */
'use strict';
(() => {
  let cd = null; // { draft, qty, dirty }
  App.costDirty = () => !!(cd && cd.dirty);

  const pin = (key, param, value, label, unit) => '<label>' + label + ' <input type="number" step="any" min="0" data-key="' + key + '" data-param="' + param + '" value="' + esc(value === undefined || value === null ? '' : value) + '">' + (unit || '') + '</label>';

  function paramsHtml(def, cfg) {
    const pr = cfg.params || {}, k = def.key;
    switch (cfg.method) {
      case 'direct': return pin(k, '@value', cfg.value, '', '원/개');
      case 'vendor': {
        const list = DB.vendorRates.filter((v) => v.process === k);
        if (!list.length) return '<span class="small" style="color:var(--red)">이 공정의 외주 단가가 없습니다. <a href="#vendors">[외주가공 단가]</a>에서 먼저 등록하세요.</span>';
        return '<select data-key="' + k + '" data-param="vendorRateId"><option value="">— 업체·조건 선택 —</option>' + list.map((v) => '<option value="' + v.id + '"' + (pr.vendorRateId === v.id ? ' selected' : '') + '>' + esc(v.vendor + (v.condition ? ' / ' + v.condition : '') + ' (' + (v.unit === 'kg' ? '원/kg' : '원/개') + ')') + '</option>').join('') + '</select>';
      }
      case 'time': return pin(k, 'hourlyRate', pr.hourlyRate, '시간당 비용', '원/시간') + pin(k, 'pcsPerHour', pr.pcsPerHour, '시간당 생산량', '개/시간') + pin(k, 'setupHours', pr.setupHours, '준비·교체', '시간');
      case 'rate': return pin(k, 'pct', pr.pct, '배부율', '%') + '<label>기준 <select data-key="' + k + '" data-param="base">' + Object.keys(Calc.OVERHEAD_BASES).map((b) => '<option value="' + b + '"' + ((pr.base || 'labor') === b ? ' selected' : '') + '>' + Calc.OVERHEAD_BASES[b] + '</option>').join('') + '</select></label>';
      case 'pack': return pin(k, 'costPerPack', pr.costPerPack, '포장 단위(박스)당', '원') + '<span class="small muted">포장 단위 ' + (N(cd.draft.packUnit) ? F(cd.draft.packUnit, 0) + '개/박스' : '미입력') + '</span>';
      case 'lot': return pin(k, 'lotCost', pr.lotCost, '건당(1회 납품·1로트)', '원');
      case 'tooling': return pin(k, 'totalCost', pr.totalCost, '금형·치공구 총액', '원') + '<label>배부 <select data-key="' + k + '" data-param="basis" data-redraw="1"><option value="life"' + (pr.basis !== 'order' ? ' selected' : '') + '>금형 수명 기준</option><option value="order"' + (pr.basis === 'order' ? ' selected' : '') + '>이번 견적 수량에 전액</option></select></label>' + (pr.basis === 'order' ? '' : pin(k, 'lifeQty', pr.lifeQty, '금형 수명', '개'));
      case 'none': return '<span class="muted small">0원 처리</span>';
      default: return '<span class="small" style="color:var(--orange)">계산 방식을 선택하세요. 해당 없는 항목은 "해당 없음"을 선택합니다.</span>';
    }
  }

  function rowsHtml() {
    return Calc.COST_ITEMS.slice(1).map((def) => {
      const cfg = cd.draft.costs[def.key] || { method: 'unset' };
      const methods = ['unset', 'none'].concat(def.methods);
      return '<tr><td>' + def.no + '</td><td class="nowrap"><b>' + def.name + '</b></td>' +
        '<td><select class="method" data-method="' + def.key + '">' + methods.map((m) => '<option value="' + m + '"' + ((cfg.method || 'unset') === m ? ' selected' : '') + '>' + (m === 'unset' ? '— 선택하세요 —' : Calc.METHOD_LABELS[m]) + '</option>').join('') + '</select></td>' +
        '<td><div class="params">' + paramsHtml(def, cfg) + '</div></td><td id="kind-' + def.key + '"></td><td class="r" id="amt-' + def.key + '"></td><td class="formula" id="fx-' + def.key + '"></td></tr>';
    }).join('');
  }

  function ovHtml() {
    const d = cd.draft;
    return (d.qtyOverrides || []).map((o, i) => '<tr><td><select data-ov="' + i + '" data-ovf="key">' + Calc.COST_ITEMS.slice(1).map((it) => '<option value="' + it.key + '"' + (o.key === it.key ? ' selected' : '') + '>' + it.no + '. ' + it.name + '</option>').join('') + '</select></td>' +
      '<td><input type="number" min="1" step="1" data-ov="' + i + '" data-ovf="minQty" value="' + esc(o.minQty) + '"></td><td><input type="number" min="0" step="any" data-ov="' + i + '" data-ovf="unitCost" value="' + esc(o.unitCost) + '"></td>' +
      '<td><button class="sm" data-act="ovDel" data-i="' + i + '">삭제</button></td></tr>').join('') || '<tr><td colspan="4" class="muted">등록된 수량 조건이 없습니다. 조건이 없으면 수량이 늘어도 해당 항목의 개당 원가는 변하지 않습니다.</td></tr>';
  }

  function update() {
    const d = cd.draft, m = matOf(d);
    const c = Calc.calcCost(d, m, DB.vendorRates, cd.qty);
    const mc = c.material;
    $('#c-mat').innerHTML = '<div class="kv"><div><span>적용 매입단가</span><b>' + F(mc.pricePerKg, 2) + ' 원/kg</b></div><div><span>순중량</span><b>' + F(mc.netWeightG, 3) + ' g</b></div><div><span>투입중량' + (mc.mode === 'rate' ? ' (자동 계산)' : '') + '</span><b>' + F(mc.inputWeightG, 3) + ' g</b></div>' +
      '<div><span>손실률' + (mc.mode === 'direct' ? ' (자동 산출)' : '') + '</span><b>' + F(mc.lossPct, 2) + '%</b></div><div><span>스크랩 회수액</span><b>' + F(mc.recovery, 2) + ' 원</b></div><div class="hl"><span>제품 1개당 원재료비</span><b>' + F(mc.cost, 2) + ' 원</b></div></div>' +
      '<div class="formula" style="margin-top:10px">' + esc(mc.formula) + '</div>';
    c.items.slice(1).forEach((it) => {
      $('#kind-' + it.key).innerHTML = kindBadge(it.kind);
      $('#amt-' + it.key).innerHTML = '<b>' + F(it.amount, 2) + '</b>';
      $('#fx-' + it.key).innerHTML = (it.errors.length ? '<span style="color:var(--red)">' + esc(it.errors.join(' ')) + '</span>' : esc(it.formula));
    });
    $('#c-total').textContent = F(c.total, 2);
    $('#c-split').textContent = '자동계산 ' + F(c.autoTotal, 2) + '원 + 직접입력 ' + F(c.directTotal, 2) + '원 (원재료비 ' + F(mc.cost, 2) + '원 포함)';
    $('#c-msgs').innerHTML = msgBox('err', '오류 — 수정해야 견적을 작성할 수 있습니다', c.errors) + msgBox('warn', '확인 필요', c.warnings) +
      (!c.errors.length && !c.warnings.length ? '<div class="msg ok">모든 원가 항목이 입력되었습니다.</div>' : '');
    const qtys = Array.from(new Set(STD_QTYS.concat([cd.qty]))).filter((q) => q >= 1).sort((a, b) => a - b);
    const base = c.total;
    $('#c-preview').innerHTML = '<div class="scroll"><table class="tbl"><thead><tr><th>수량</th>' + qtys.map((q) => '<th class="r">' + F(q, 0) + '개' + (q === cd.qty ? ' (기준)' : '') + '</th>').join('') + '</tr></thead><tbody><tr><td>제품 1개당 총제조원가</td>' +
      qtys.map((q) => { const t = Calc.calcCost(d, m, DB.vendorRates, q).total; return '<td class="r"><b>' + F(t, 2) + '</b>' + (q !== cd.qty && base > 0 ? '<br><span class="small" style="color:' + (t > base ? 'var(--red)' : 'var(--green)') + '">' + (t > base ? '+' : '') + F((t - base) / base * 100, 1) + '%</span>' : '') + '</td>'; }).join('') + '</tr></tbody></table></div>';
    $('#c-dirty').innerHTML = cd.dirty ? '<span class="badge orange">저장하지 않은 변경이 있습니다</span>' : '';
  }

  App.views.cost = {
    render(main, params) {
      const id = params.id || (cd && cd.draft.id);
      const p = id ? prodById(id) : null;
      const picker = '<select id="c-prod" style="min-width:380px">' + productOptions(p ? p.id : '') + '</select>';
      if (!p) {
        cd = null;
        main.innerHTML = '<div class="head"><div><h1>제조원가 계산</h1><p class="muted">제품을 선택하면 원재료비와 공정별 원가를 입력하고 계산 근거를 확인할 수 있습니다.</p></div></div><div class="card">' +
          (DB.products.length ? '<label class="fld"><span>제품 선택</span>' + picker + '</label>' : '<div class="empty">등록된 제품이 없습니다. <a href="#products">[제품 마스터]</a>에서 먼저 제품을 등록하세요.</div>') + '</div>';
        App.onChange = (e) => { if (e.target.id === 'c-prod' && e.target.value) location.hash = '#cost?id=' + e.target.value; };
        return;
      }
      if (!cd || cd.draft.id !== p.id || !cd.dirty) cd = { draft: clone(p), qty: cd && cd.draft.id === p.id ? cd.qty : defaultQty(p), dirty: false };
      const d = cd.draft;
      d.costs = d.costs || {}; d.qtyOverrides = d.qtyOverrides || [];
      const rate = d.weightMode === 'rate';
      const matOpts = [['', '— 선택 —']].concat(DB.materials.map((m) => [m.id, matLabel(m) + ' (' + F(m.pricePerKg, 0) + '원/kg)' + (m.isSample ? ' [샘플]' : '')]));
      const dn = (f, label, unit, disabled, hint) => '<label class="fld"><span>' + label + '</span><div class="inp"><input type="number" step="any" min="0" data-f="' + f + '" value="' + esc(d[f] === undefined ? '' : d[f]) + '"' + (disabled ? ' disabled' : '') + '><em>' + unit + '</em></div><small>' + (hint || '') + '</small></label>';
      main.innerHTML = '<div class="head"><div><h1>제조원가 계산</h1><p class="muted">금액은 모두 <b>제품 1개당 원</b>입니다. 입력하면 바로 계산되며, [저장]을 눌러야 제품에 반영됩니다.</p></div>' +
        '<div class="bar"><span id="c-dirty"></span><button data-act="editProd">제품 기본정보 수정</button><button data-act="toQuote">이 제품으로 견적 작성</button><button class="pri big" data-act="save">저장</button></div></div>' +
        '<div class="card"><div class="form"><label class="fld w2"><span>제품</span>' + picker + '</label>' +
        '<label class="fld"><span>기준 수량</span><div class="inp"><input type="number" id="c-qty" min="1" step="1" value="' + cd.qty + '"><em>개</em></div><small>준비비·금형비·포장비 등 수량에 따라 달라지는 항목의 계산 기준</small></label></div>' +
        (d.isSample ? '<div class="msg warn">샘플 제품입니다. 표시된 단가와 가공비는 가상의 값입니다.</div>' : '') + '</div>' +

        '<div class="card"><h2>1. 원재료비 <span class="badge auto">자동계산</span></h2><div class="form">' +
        '<label class="fld w2"><span>재질(강종) — <a href="#materials">단가 수정</a></span><select data-f="materialId" data-redraw="1">' + matOpts.map((o) => '<option value="' + o[0] + '"' + (o[0] === (d.materialId || '') ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select><small></small></label>' +
        dn('netWeightG', '제품 1개당 순중량', 'g', false, '완성품 1개의 무게') +
        '<label class="fld w2"><span>투입중량 산정 방식</span><select data-f="weightMode" data-redraw="1"><option value="direct"' + (rate ? '' : ' selected') + '>투입중량 직접 입력 (손실 포함)</option><option value="rate"' + (rate ? ' selected' : '') + '>순중량 ÷ (1 − 손실률)로 계산</option></select><small>한 가지 방식만 적용 → 손실률 중복 반영 없음</small></label>' +
        dn('inputWeightG', '원재료 투입중량', 'g', rate, rate ? '손실률로 자동 계산됩니다' : '제품 1개에 들어가는 소재 무게(스크랩·공정손실 포함)') +
        dn('lossRatePct', '스크랩·공정 손실률', '%', !rate, rate ? '손실중량 ÷ 투입중량' : '투입중량에서 자동 산출됩니다') +
        dn('scrapRecoveryPct', '스크랩 회수율', '%', false, '손실분 중 스크랩으로 회수(판매)되는 비율') + '</div><div id="c-mat" style="margin-top:12px"></div></div>' +

        '<div class="card"><h2>2 ~ 13. 가공비 및 기타 원가</h2><div class="scroll"><table class="tbl"><thead><tr><th>No</th><th>원가 항목</th><th>계산 방식</th><th>입력값</th><th>구분</th><th class="r">금액(원/개)</th><th>계산 근거</th></tr></thead>' +
        '<tbody id="c-rows">' + rowsHtml() + '</tbody><tfoot><tr><td colspan="5">제품 1개당 총제조원가 (원재료비 포함, 수량 <span id="c-qty-label">' + F(cd.qty, 0) + '</span>개 기준)</td><td class="r" id="c-total" style="font-size:18px"></td><td class="small muted" id="c-split"></td></tr></tfoot></table></div>' +
        '<div id="c-msgs"></div></div>' +

        '<div class="card"><h2>수량 구간별 조건 <span class="muted small">(선택)</span></h2><p class="muted">주문 수량이 일정 수량 이상일 때 실제로 적용되는 개당 단가가 있으면 등록합니다. <b>등록한 조건만</b> 수량별 견적에 반영됩니다. (외주 단가의 수량 구간은 [외주가공 단가]에서 관리)</p>' +
        '<table class="tbl" style="max-width:820px"><thead><tr><th>원가 항목</th><th>수량 (개 이상)</th><th>적용 단가 (원/개)</th><th></th></tr></thead><tbody id="c-ov">' + ovHtml() + '</tbody></table><p style="margin-top:8px"><button class="sm" data-act="ovAdd">+ 수량 조건 추가</button></p></div>' +

        '<div class="card"><h2>수량별 원가 미리보기</h2><div id="c-preview"></div></div>' +
        '<p><button class="pri big" data-act="save">저장</button></p>';
      update();

      const touch = () => { cd.dirty = true; update(); };
      App.onInput = (e) => {
        const t = e.target, ds = t.dataset;
        const val = t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value;
        if (t.id === 'c-qty') { cd.qty = Math.max(1, Math.floor(N(t.value)) || 1); $('#c-qty-label').textContent = F(cd.qty, 0); update(); return; }
        if (ds.f) { d[ds.f] = val; return touch(); }
        if (ds.key && ds.param) {
          const cfg = d.costs[ds.key] = d.costs[ds.key] || { method: 'unset' };
          if (ds.param === '@value') cfg.value = val;
          else { cfg.params = cfg.params || {}; cfg.params[ds.param] = val; }
          return touch();
        }
        if (ds.ov !== undefined && ds.ovf) { d.qtyOverrides[Number(ds.ov)][ds.ovf] = val; return touch(); }
      };
      App.onChange = (e) => {
        const t = e.target;
        if (t.id === 'c-prod') {
          if (t.value && t.value !== d.id) { cd.dirty = false; location.hash = '#cost?id=' + t.value; }
          return;
        }
        if (t.dataset.method) {
          const cfg = d.costs[t.dataset.method] = d.costs[t.dataset.method] || {};
          cfg.method = t.value;
          cd.dirty = true;
          $('#c-rows').innerHTML = rowsHtml();
          update();
        } else if (t.dataset.redraw) {
          if (t.dataset.f) App.render(); else { $('#c-rows').innerHTML = rowsHtml(); update(); }
        }
      };
      App.actions = {
        ovAdd: () => { d.qtyOverrides.push({ key: 'forging', minQty: '', unitCost: '' }); cd.dirty = true; $('#c-ov').innerHTML = ovHtml(); update(); },
        ovDel: (el) => { d.qtyOverrides.splice(Number(el.dataset.i), 1); cd.dirty = true; $('#c-ov').innerHTML = ovHtml(); update(); },
        editProd: async () => {
          if (cd.dirty && !(await ask('<p>저장하지 않은 원가 변경이 있습니다. 먼저 [저장]한 뒤 기본정보를 수정하세요.</p><p>변경을 버리고 계속할까요?</p>', '변경 버리고 계속'))) return;
          cd.dirty = false;
          App.openProductForm(d.id);
        },
        toQuote: async () => {
          if (cd.dirty && !(await ask('<p>저장하지 않은 변경은 견적에 반영되지 않습니다. 그대로 이동할까요?</p>', '이동'))) return;
          location.hash = '#quote?product=' + d.id;
        },
        save: async () => {
          const errors = Calc.validateProduct(d);
          const ovBad = d.qtyOverrides.some((o) => (o.minQty !== '' || o.unitCost !== '') && (!(N(o.minQty) >= 1) || o.unitCost === '' || N(o.unitCost) < 0));
          if (ovBad) errors.push('수량 조건의 수량(1 이상)과 단가(0 이상)를 모두 입력하세요.');
          if (errors.length) return toast(errors[0], 'err');
          d.qtyOverrides = d.qtyOverrides.filter((o) => o.minQty !== '' && o.unitCost !== '').map((o) => ({ key: o.key, minQty: Math.floor(N(o.minQty)), unitCost: N(o.unitCost) }));
          d.updatedAt = new Date().toISOString();
          DB.products[DB.products.findIndex((x) => x.id === d.id)] = clone(d);
          await Store.save('products');
          cd.dirty = false;
          const c = costOf(d, cd.qty);
          toast(c.errors.length ? '저장했습니다. 다만 오류 ' + c.errors.length + '건이 남아 있어 견적에 사용할 수 없습니다.' : c.missing.length ? '저장했습니다. 미입력 항목 ' + c.missing.length + '개가 남아 있습니다.' : '저장했습니다. 총제조원가 ' + F(c.total, 2) + '원/개', c.errors.length ? 'err' : 'ok');
          App.render();
        },
      };
    },
  };
})();
