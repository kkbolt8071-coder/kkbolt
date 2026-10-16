/* 금강볼트(주) 견적·원가 계산 엔진
 * 화면과 분리된 순수 계산 모듈입니다. 브라우저와 Node(자동 테스트) 양쪽에서 같은 코드를 사용합니다.
 *
 * [원재료비]
 *   투입중량(g)  = (직접입력)  또는  순중량(g) ÷ (1 − 손실률)      ← 둘 중 하나만 적용(손실률 중복 방지)
 *   원재료 투입액 = 투입중량(g) ÷ 1,000 × 매입단가(원/kg)
 *   스크랩 회수액 = (투입중량 − 순중량)(g) ÷ 1,000 × 스크랩단가(원/kg) × 회수율
 *   원재료비      = 원재료 투입액 − 스크랩 회수액
 * [판매단가]
 *   매출액 대비 이익률(마진) : 단가 = 총원가 ÷ (1 − 이익률)
 *   원가 가산율(마크업)      : 단가 = 총원가 × (1 + 가산율)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COST_ITEMS = [
    { key: 'material', no: 1, name: '원재료비', methods: ['material'] },
    { key: 'forging', no: 2, name: '냉간단조 가공비', methods: ['direct', 'time', 'vendor'], process: true },
    { key: 'rolling', no: 3, name: '전조 및 나사 가공비', methods: ['direct', 'time', 'vendor'], process: true },
    { key: 'heat', no: 4, name: '열처리비', methods: ['direct', 'vendor'], process: true },
    { key: 'plating', no: 5, name: '도금비', methods: ['direct', 'vendor'], process: true },
    { key: 'inspection', no: 6, name: '선별 및 검사비', methods: ['direct', 'time', 'vendor'], process: true },
    { key: 'outsourcing', no: 7, name: '기타 외주가공비', methods: ['direct', 'vendor'], process: true },
    { key: 'labor', no: 8, name: '직접노무비', methods: ['direct', 'time'] },
    { key: 'overhead', no: 9, name: '제조간접비', methods: ['direct', 'rate'] },
    { key: 'packing', no: 10, name: '포장비', methods: ['direct', 'pack'] },
    { key: 'transport', no: 11, name: '운송비', methods: ['direct', 'lot'] },
    { key: 'tooling', no: 12, name: '금형·치공구 배부액', methods: ['direct', 'tooling'] },
    { key: 'etc', no: 13, name: '기타 비용', methods: ['direct', 'lot'] },
  ];

  const METHOD_LABELS = {
    unset: '미입력',
    none: '해당 없음 (0원)',
    direct: '직접 입력 (원/개)',
    vendor: '외주 단가표 적용',
    time: '시간당 비용 ÷ 시간당 생산량',
    rate: '배부율(%) 적용',
    pack: '포장 단위당 비용',
    lot: '건당 비용 ÷ 수량',
    tooling: '금형비 총액 ÷ 배부수량',
  };

  const OVERHEAD_BASES = {
    labor: '직접노무비',
    conversion: '가공비 합계(2~8번)',
    materialConversion: '원재료비+가공비(1~8번)',
  };
  const CONVERSION_KEYS = ['forging', 'rolling', 'heat', 'plating', 'inspection', 'outsourcing', 'labor'];

  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function f(n, d) {
    if (d === undefined) d = 2;
    return num(n).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  // 부동소수 오차(예: 35.25 × 1000 = 35249.99…)를 제거한 뒤 자릿수 처리
  function roundTo(x, d, mode) {
    const m = Math.pow(10, d || 0);
    const v = parseFloat((num(x) * m).toPrecision(12));
    const r = mode === 'up' ? Math.ceil(v) : mode === 'down' ? Math.floor(v) : Math.round(v);
    return r / m;
  }

  function itemDef(key) {
    return COST_ITEMS.find((i) => i.key === key);
  }

  // ───────────── 원재료비 ─────────────
  function calcMaterial(product, material) {
    const p = product || {};
    const errors = [], warnings = [];
    const net = num(p.netWeightG);
    const mode = p.weightMode === 'rate' ? 'rate' : 'direct';
    const price = material ? num(material.pricePerKg) : 0;
    const scrapPrice = material ? num(material.scrapPricePerKg) : 0;
    let input = 0, lossPct = 0, inputFormula = '';

    if (!(net > 0)) errors.push('제품 1개당 순중량(g)이 입력되지 않았습니다.');
    if (!material) errors.push('원재료(강종)가 지정되지 않았습니다.');
    else if (!(price > 0)) errors.push('원재료 매입단가(원/kg)가 등록되지 않았습니다.');

    if (mode === 'rate') {
      lossPct = num(p.lossRatePct);
      if (lossPct < 0 || lossPct >= 100) {
        errors.push('손실률은 0% 이상 100% 미만이어야 합니다.');
        lossPct = 0;
        input = net;
      } else {
        input = net / (1 - lossPct / 100);
      }
      inputFormula = '투입중량 = 순중량 ' + f(net, 3) + ' g ÷ (1 − ' + f(lossPct, 2) + '%) = ' + f(input, 3) + ' g';
    } else {
      input = num(p.inputWeightG);
      if (!(input > 0)) errors.push('원재료 투입중량(g)이 입력되지 않았습니다.');
      else if (net > 0 && input < net) errors.push('투입중량(' + f(input, 3) + ' g)이 순중량(' + f(net, 3) + ' g)보다 작습니다.');
      lossPct = input > 0 ? Math.max(0, (input - net) / input * 100) : 0;
      inputFormula = '투입중량 = ' + f(input, 3) + ' g (직접 입력, 손실 포함) → 손실률 ' + f(lossPct, 2) + '% (자동 산출, 추가 적용 안 함)';
    }

    if (net > 5000) warnings.push('순중량이 5kg을 넘습니다. 단위가 g(그램)이 맞는지 확인하세요.');
    if (net > 0 && net < 0.05) warnings.push('순중량이 0.05g 미만입니다. kg으로 입력하지 않았는지 확인하세요.');
    if (lossPct > 30) warnings.push('손실률이 30%를 넘습니다. 투입중량과 순중량을 확인하세요.');
    if (price > 0 && price < 100) warnings.push('원재료 단가가 100원/kg 미만입니다. 원/kg 단위가 맞는지 확인하세요.');

    const scrapG = Math.max(0, input - net);
    const gross = input / 1000 * price;
    const recoveryPct = Math.min(100, Math.max(0, num(p.scrapRecoveryPct)));
    const recovery = scrapG / 1000 * scrapPrice * recoveryPct / 100;
    const cost = Math.max(0, gross - recovery);

    const lines = [
      inputFormula,
      '원재료 투입액 = ' + f(input, 3) + ' g ÷ 1,000 × ' + f(price, 2) + ' 원/kg = ' + f(gross, 4) + ' 원',
    ];
    if (recovery > 0) {
      lines.push('스크랩 회수액 = ' + f(scrapG, 3) + ' g ÷ 1,000 × ' + f(scrapPrice, 2) + ' 원/kg × ' + f(recoveryPct, 1) + '% = ' + f(recovery, 4) + ' 원');
    } else {
      lines.push('스크랩 회수액 = 0 원 (회수 조건 미등록)');
    }
    lines.push('원재료비 = ' + f(gross, 4) + ' − ' + f(recovery, 4) + ' = ' + f(cost, 4) + ' 원/개');

    return {
      mode, netWeightG: net, inputWeightG: input, lossPct, scrapG,
      pricePerKg: price, scrapPricePerKg: scrapPrice, recoveryPct,
      gross, recovery, cost, formula: lines.join('\n'), errors, warnings,
    };
  }

  // ───────────── 외주 단가표 ─────────────
  function pickTier(rate, qty) {
    const tiers = (rate.tiers || [])
      .map((t) => ({ minQty: num(t.minQty), price: num(t.price) }))
      .sort((a, b) => a.minQty - b.minQty);
    if (!tiers.length) return null;
    let chosen = null;
    for (const t of tiers) if (qty >= t.minQty) chosen = t;
    return chosen ? { tier: chosen, below: false } : { tier: tiers[0], below: true };
  }

  function calcVendor(rate, qty, netWeightG) {
    const errors = [], warnings = [];
    const picked = pickTier(rate, qty);
    if (!picked) return { amount: 0, formula: '단가 구간이 등록되지 않았습니다.', errors: ['외주 단가표 [' + (rate.vendor || '') + ']에 단가가 없습니다.'], warnings };
    if (picked.below) warnings.push('수량이 외주 단가표 최소 구간(' + f(picked.tier.minQty, 0) + '개)보다 적어 최소 구간 단가를 적용했습니다.');
    const price = picked.tier.price;
    let per, formula;
    const head = '[' + (rate.vendor || '업체 미지정') + (rate.condition ? ' / ' + rate.condition : '') + '] ' + f(picked.tier.minQty, 0) + '개 이상 구간: ';
    if (rate.unit === 'kg') {
      per = price * netWeightG / 1000;
      formula = head + f(price, 2) + ' 원/kg × 순중량 ' + f(netWeightG, 3) + ' g ÷ 1,000 = ' + f(per, 4) + ' 원/개';
      if (!(netWeightG > 0)) errors.push('kg당 외주 단가를 적용하려면 순중량(g)이 필요합니다.');
    } else {
      per = price;
      formula = head + f(price, 4) + ' 원/개';
    }
    const minCharge = num(rate.minCharge);
    if (minCharge > 0 && per * qty < minCharge) {
      formula += '\n로트 금액 ' + f(per * qty, 0) + '원 < 최소 가공비 ' + f(minCharge, 0) + '원 → ' + f(minCharge, 0) + ' ÷ ' + f(qty, 0) + '개 = ' + f(minCharge / qty, 4) + ' 원/개';
      per = minCharge / qty;
    }
    return { amount: per, formula, errors, warnings };
  }

  // ───────────── 개별 원가 항목 ─────────────
  function calcItem(def, cfg, ctx) {
    cfg = cfg || {};
    const method = def.methods.concat(['none', 'unset']).includes(cfg.method) ? cfg.method : 'unset';
    const pr = cfg.params || {};
    const qty = ctx.qty;
    const out = { key: def.key, no: def.no, name: def.name, method, kind: 'auto', amount: 0, formula: '', errors: [], warnings: [] };
    const fail = (msg) => { out.errors.push(def.name + ': ' + msg); out.amount = 0; };

    if (method === 'unset') {
      out.kind = 'unset';
      out.formula = '아직 입력하지 않았습니다. 금액을 입력하거나 "해당 없음"을 선택하세요.';
    } else if (method === 'none') {
      out.kind = 'none';
      out.formula = '해당 없는 공정·비용 → 0원';
    } else if (method === 'direct') {
      out.kind = 'direct';
      out.amount = num(cfg.value);
      out.formula = '직접 입력: ' + f(out.amount, 4) + ' 원/개';
      if (out.amount < 0) fail('금액은 0 이상이어야 합니다.');
      else if (out.amount === 0) out.warnings.push(def.name + ': 직접 입력 금액이 0원입니다. 해당 없으면 "해당 없음"으로 지정하세요.');
    } else if (method === 'vendor') {
      const rate = (ctx.vendorRates || []).find((r) => r.id === pr.vendorRateId);
      if (!rate) fail('적용할 외주 단가표가 선택되지 않았거나 삭제되었습니다.');
      else {
        const r = calcVendor(rate, qty, ctx.netWeightG);
        out.amount = r.amount; out.formula = r.formula;
        r.errors.forEach((e) => out.errors.push(def.name + ': ' + e));
        r.warnings.forEach((w) => out.warnings.push(def.name + ': ' + w));
        out.vendorRateId = rate.id;
      }
    } else if (method === 'time') {
      const rate = num(pr.hourlyRate), pph = num(pr.pcsPerHour), setup = num(pr.setupHours);
      if (!(pph > 0)) fail('시간당 생산량(개/시간)은 0보다 커야 합니다.');
      else if (rate < 0 || setup < 0) fail('시간당 비용과 준비시간은 0 이상이어야 합니다.');
      else {
        const run = rate / pph, set = rate * setup / qty;
        out.amount = run + set;
        out.formula = f(rate, 0) + ' 원/시간 ÷ ' + f(pph, 1) + ' 개/시간 = ' + f(run, 4) + ' 원/개';
        if (setup > 0) out.formula += '\n준비·교체 ' + f(setup, 2) + ' 시간 × ' + f(rate, 0) + ' 원/시간 ÷ ' + f(qty, 0) + '개 = ' + f(set, 4) + ' 원/개\n합계 ' + f(out.amount, 4) + ' 원/개';
      }
    } else if (method === 'rate') {
      const pct = num(pr.pct), baseKey = OVERHEAD_BASES[pr.base] ? pr.base : 'labor';
      let base = 0;
      if (baseKey === 'labor') base = ctx.amounts.labor || 0;
      else {
        base = CONVERSION_KEYS.reduce((s, k) => s + (ctx.amounts[k] || 0), 0);
        if (baseKey === 'materialConversion') base += ctx.amounts.material || 0;
      }
      if (pct < 0) fail('배부율은 0% 이상이어야 합니다.');
      else {
        out.amount = base * pct / 100;
        out.formula = OVERHEAD_BASES[baseKey] + ' ' + f(base, 4) + ' 원 × ' + f(pct, 2) + '% = ' + f(out.amount, 4) + ' 원/개';
      }
    } else if (method === 'pack') {
      const unit = num(ctx.packUnit), cost = num(pr.costPerPack);
      if (!(unit > 0)) fail('제품 마스터에 포장 단위(개/박스)를 입력해야 합니다.');
      else if (cost < 0) fail('포장 단위당 비용은 0 이상이어야 합니다.');
      else {
        const boxes = Math.ceil(qty / unit);
        out.amount = boxes * cost / qty;
        out.formula = '포장 ' + f(boxes, 0) + '박스(' + f(qty, 0) + '개 ÷ ' + f(unit, 0) + '개/박스, 올림) × ' + f(cost, 0) + ' 원 ÷ ' + f(qty, 0) + '개 = ' + f(out.amount, 4) + ' 원/개';
      }
    } else if (method === 'lot') {
      const lot = num(pr.lotCost);
      if (lot < 0) fail('건당 비용은 0 이상이어야 합니다.');
      else {
        out.amount = lot / qty;
        out.formula = '건당 ' + f(lot, 0) + ' 원 ÷ ' + f(qty, 0) + '개 = ' + f(out.amount, 4) + ' 원/개';
      }
    } else if (method === 'tooling') {
      const total = num(pr.totalCost);
      const basis = pr.basis === 'order' ? 'order' : 'life';
      const div = basis === 'order' ? qty : num(pr.lifeQty);
      if (total < 0) fail('금형비 총액은 0 이상이어야 합니다.');
      else if (!(div > 0)) fail('금형 수명(배부 수량)은 0보다 커야 합니다.');
      else {
        out.amount = total / div;
        out.formula = '금형·치공구 ' + f(total, 0) + ' 원 ÷ ' + (basis === 'order' ? '이번 견적 수량 ' : '금형 수명 ') + f(div, 0) + '개 = ' + f(out.amount, 4) + ' 원/개';
      }
    }
    return out;
  }

  // 수량 구간별 직접 단가: 등록된 조건이 있을 때만 적용
  function pickQtyOverride(overrides, key, qty) {
    let chosen = null;
    (overrides || []).forEach((o) => {
      if (o.key !== key) return;
      const mq = num(o.minQty);
      if (mq > 0 && qty >= mq && (!chosen || mq > num(chosen.minQty))) chosen = o;
    });
    return chosen;
  }

  // ───────────── 제품 1개당 총제조원가 ─────────────
  function calcCost(product, material, vendorRates, qtyInput) {
    const p = product || {};
    const errors = [], warnings = [];
    let qty = num(qtyInput);
    if (!(qty >= 1) || !Number.isInteger(qty)) {
      errors.push('수량은 1 이상의 정수여야 합니다.');
      qty = qty >= 1 ? Math.floor(qty) : 1;
    }
    const mat = calcMaterial(p, material);
    mat.errors.forEach((e) => errors.push('원재료비: ' + e));
    mat.warnings.forEach((w) => warnings.push('원재료비: ' + w));

    const amounts = { material: mat.cost };
    const items = [{
      key: 'material', no: 1, name: '원재료비', method: 'material', kind: 'auto',
      amount: mat.cost, formula: mat.formula, errors: [], warnings: [],
    }];
    const ctx = { qty, vendorRates: vendorRates || [], netWeightG: mat.netWeightG, packUnit: p.packUnit, amounts };
    const vendorUsed = [];

    COST_ITEMS.slice(1).forEach((def) => {
      let it = calcItem(def, (p.costs || {})[def.key], ctx);
      const ov = pickQtyOverride(p.qtyOverrides, def.key, qty);
      if (ov) {
        it = {
          key: def.key, no: def.no, name: def.name, method: it.method, kind: 'qty',
          amount: Math.max(0, num(ov.unitCost)), errors: [], warnings: [],
          formula: '수량 조건(' + f(ov.minQty, 0) + '개 이상) 등록 단가: ' + f(ov.unitCost, 4) + ' 원/개',
        };
      }
      if (it.vendorRateId) vendorUsed.push(it.vendorRateId);
      amounts[def.key] = it.amount;
      it.errors.forEach((e) => errors.push(e));
      it.warnings.forEach((w) => warnings.push(w));
      items.push(it);
    });

    const missing = items.filter((i) => i.kind === 'unset').map((i) => i.name);
    if (missing.length) warnings.push('미입력 원가 항목 ' + missing.length + '개: ' + missing.join(', '));

    const total = items.reduce((s, i) => s + i.amount, 0);
    const autoTotal = items.filter((i) => i.kind === 'auto').reduce((s, i) => s + i.amount, 0);
    const directTotal = items.filter((i) => i.kind === 'direct' || i.kind === 'qty').reduce((s, i) => s + i.amount, 0);
    return { qty, material: mat, items, total, autoTotal, directTotal, missing, vendorUsed, errors, warnings, ok: errors.length === 0 };
  }

  // ───────────── 판매단가 ─────────────
  function marginToMarkup(marginPct) { const m = num(marginPct) / 100; return m < 1 ? m / (1 - m) * 100 : Infinity; }
  function markupToMargin(markupPct) { const k = num(markupPct) / 100; return k > -1 ? k / (1 + k) * 100 : 0; }

  function calcPrice(unitCost, pricing) {
    const pr = pricing || {};
    const errors = [];
    const mode = pr.mode === 'markup' ? 'markup' : 'margin';
    const rate = num(pr.ratePct);
    const decimals = [0, 1, 2].includes(num(pr.decimals)) ? num(pr.decimals) : 2;
    const rounding = ['up', 'round', 'down'].includes(pr.rounding) ? pr.rounding : 'up';
    let raw = 0, formula = '', targetMarginPct = 0;
    if (rate < 0) errors.push('목표 이익률은 0% 이상이어야 합니다.');
    else if (mode === 'margin') {
      if (rate >= 100) errors.push('매출액 대비 이익률은 100% 미만이어야 합니다. (1 − 이익률이 0이 되어 계산할 수 없습니다)');
      else {
        raw = unitCost / (1 - rate / 100);
        targetMarginPct = rate;
        formula = '총원가 ' + f(unitCost, 4) + ' 원 ÷ (1 − ' + f(rate, 2) + '%) = ' + f(raw, 4) + ' 원';
      }
    } else {
      raw = unitCost * (1 + rate / 100);
      targetMarginPct = markupToMargin(rate);
      formula = '총원가 ' + f(unitCost, 4) + ' 원 × (1 + ' + f(rate, 2) + '%) = ' + f(raw, 4) + ' 원';
    }
    const targetPrice = roundTo(raw, decimals, rounding);
    const roundLabel = { up: '올림', round: '반올림', down: '내림' }[rounding];
    if (formula) formula += ' → 소수 ' + decimals + '자리 ' + roundLabel + ' = ' + f(targetPrice, decimals) + ' 원';
    return { mode, ratePct: rate, decimals, rounding, raw, targetPrice, targetMarginPct, formula, errors };
  }

  // ───────────── 견적금액·이익 ─────────────
  function calcQuote(unitCost, qty, unitPrice, vatApply, vatRatePct) {
    qty = num(qty); unitPrice = num(unitPrice); unitCost = num(unitCost);
    const supply = roundTo(unitPrice * qty, 0, 'round');
    const vatRate = vatApply ? num(vatRatePct) : 0;
    const vat = vatApply ? roundTo(supply * vatRate / 100, 0, 'down') : 0;
    const costTotal = unitCost * qty;
    const profit = supply - costTotal;
    return {
      qty, unitCost, unitPrice, supply, vatApply: !!vatApply, vatRatePct: vatRate, vat, total: supply + vat,
      costTotal, profitPerUnit: unitPrice - unitCost, profit,
      marginPct: supply > 0 ? profit / supply * 100 : 0,
      markupPct: costTotal > 0 ? profit / costTotal * 100 : 0,
    };
  }

  // 원가 → 단가 → 견적금액을 한 번에. manualPrice가 있으면 목표단가 대신 그 단가로 견적.
  function calcFull(product, material, vendorRates, qty, pricing, manualPrice) {
    const pr = pricing || {};
    const cost = calcCost(product, material, vendorRates, qty);
    const price = calcPrice(cost.total, pr);
    const hasManual = manualPrice !== null && manualPrice !== undefined && manualPrice !== '' && num(manualPrice) > 0;
    const unitPrice = hasManual ? num(manualPrice) : price.targetPrice;
    const quote = calcQuote(cost.total, cost.qty, unitPrice, pr.vatApply !== false, pr.vatRatePct === undefined ? 10 : pr.vatRatePct);
    const errors = cost.errors.concat(price.errors);
    // 판정: 손실 / 목표 미달 / 정상 (반올림 오차 0.005%p 허용)
    let verdict = 'ok';
    if (quote.profit < 0) verdict = 'loss';
    else if (quote.marginPct < price.targetMarginPct - 0.005) verdict = 'below';
    return { cost, price, quote, manual: hasManual, verdict, errors, warnings: cost.warnings, ok: errors.length === 0 };
  }

  function validateProduct(p) {
    const errors = [];
    if (!String(p.code || '').trim()) errors.push('제품코드를 입력하세요.');
    if (!String(p.name || '').trim()) errors.push('제품명을 입력하세요.');
    ['netWeightG', 'inputWeightG', 'lossRatePct', 'scrapRecoveryPct', 'annualQty', 'monthlyQty', 'moq', 'packUnit'].forEach((k) => {
      if (num(p[k]) < 0) errors.push('음수는 입력할 수 없습니다: ' + k);
    });
    if (num(p.scrapRecoveryPct) > 100) errors.push('스크랩 회수율은 100% 이하여야 합니다.');
    return errors;
  }

  return {
    COST_ITEMS, METHOD_LABELS, OVERHEAD_BASES, itemDef, num, f, roundTo,
    calcMaterial, calcVendor, calcItem, calcCost, calcPrice, calcQuote, calcFull,
    marginToMarkup, markupToMargin, validateProduct,
  };
});
