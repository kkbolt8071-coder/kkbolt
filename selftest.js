/* 계산 자동 검증. 손으로 계산한 기대값과 계산 엔진의 결과를 비교합니다.
 * - 명령줄:  node tests/run-tests.js
 * - 앱 화면: [데이터 백업 및 복원] → [계산 자체 점검 실행]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SelfTest = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  async function run(deps) {
    const { Calc, XlsxLite, QuoteDoc } = deps;
    const results = [];
    let group = '';
    const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
    const check = (name, cond, detail) => results.push({ group, name, pass: !!cond, detail: detail || '' });
    const eq = (name, actual, expected, tol) => check(name, near(actual, expected, tol), '계산값 ' + actual + ' / 기대값 ' + expected);

    const mat = { id: 'm1', grade: 'TEST-STEEL', spec: 'Φ8', pricePerKg: 1450, scrapPricePerKg: 0 };
    const base = (over) => Object.assign({ code: 'T', name: 'T', netWeightG: 11.8, weightMode: 'direct', inputWeightG: 12.5, lossRatePct: 0, scrapRecoveryPct: 0, packUnit: 1000, costs: {} }, over);

    // 1. 원재료비
    group = '1. 원재료비';
    let m = Calc.calcMaterial(base(), mat);
    eq('투입중량 12.5g × 1,450원/kg = 18.125원', m.cost, 18.125);
    eq('g→kg 환산 (12.5g = 0.0125kg)', m.gross, 0.0125 * 1450);
    m = Calc.calcMaterial(base({ lossRatePct: 10 }), mat);
    eq('투입중량 직접입력 시 손실률을 다시 곱하지 않음(중복 방지)', m.cost, 18.125);
    eq('직접입력 시 손실률 자동 산출 (12.5−11.8)/12.5 = 5.6%', m.lossPct, 5.6, 1e-9);
    m = Calc.calcMaterial(base({ weightMode: 'rate', netWeightG: 9.5, lossRatePct: 5, inputWeightG: 999 }), { pricePerKg: 1500 });
    eq('손실률 방식: 9.5g ÷ (1−5%) = 10g', m.inputWeightG, 10, 1e-9);
    eq('손실률 방식 원재료비 10g × 1,500원/kg = 15원', m.cost, 15, 1e-9);
    m = Calc.calcMaterial(base({ netWeightG: 9, inputWeightG: 10, scrapRecoveryPct: 100 }), { pricePerKg: 1500, scrapPricePerKg: 300 });
    eq('스크랩 회수 100%: 15 − (1g×300원/kg) = 14.7원', m.cost, 14.7, 1e-9);
    m = Calc.calcMaterial(base({ netWeightG: 9, inputWeightG: 10, scrapRecoveryPct: 50 }), { pricePerKg: 1500, scrapPricePerKg: 300 });
    eq('스크랩 회수 50%: 15 − 0.15 = 14.85원', m.cost, 14.85, 1e-9);
    check('투입중량 < 순중량이면 오류', Calc.calcMaterial(base({ inputWeightG: 5 }), mat).errors.length > 0);
    m = Calc.calcMaterial(base({ weightMode: 'rate', lossRatePct: 100 }), mat);
    check('손실률 100%는 오류(0으로 나누기 방지)', m.errors.length > 0 && Number.isFinite(m.cost));
    check('순중량 미입력은 오류', Calc.calcMaterial(base({ netWeightG: 0 }), mat).errors.length > 0);
    check('원재료 미지정은 오류', Calc.calcMaterial(base(), null).errors.length > 0);
    check('5kg 초과 중량은 단위 확인 경고', Calc.calcMaterial(base({ netWeightG: 6000, inputWeightG: 6100 }), mat).warnings.length > 0);

    // 2. 원가 항목
    group = '2. 제조원가 항목';
    const rates = [
      { id: 'v1', vendor: 'A열처리', condition: '조질', unit: 'kg', tiers: [{ minQty: 1, price: 500 }, { minQty: 10000, price: 450 }], minCharge: 0 },
      { id: 'v2', vendor: 'B도금', condition: '아연', unit: 'kg', tiers: [{ minQty: 1, price: 500 }], minCharge: 50000 },
      { id: 'v3', vendor: 'C선별', condition: '', unit: 'ea', tiers: [{ minQty: 5000, price: 1.2 }], minCharge: 0 },
    ];
    const prod = base({
      netWeightG: 9, inputWeightG: 10,
      costs: {
        forging: { method: 'time', params: { hourlyRate: 30000, pcsPerHour: 3000, setupHours: 2 } },
        rolling: { method: 'direct', value: 3.2 },
        heat: { method: 'vendor', params: { vendorRateId: 'v1' } },
        plating: { method: 'vendor', params: { vendorRateId: 'v2' } },
        inspection: { method: 'vendor', params: { vendorRateId: 'v3' } },
        outsourcing: { method: 'none' },
        labor: { method: 'time', params: { hourlyRate: 20000, pcsPerHour: 4000, setupHours: 0 } },
        overhead: { method: 'rate', params: { pct: 150, base: 'labor' } },
        packing: { method: 'pack', params: { costPerPack: 2000 } },
        transport: { method: 'lot', params: { lotCost: 30000 } },
        tooling: { method: 'tooling', params: { totalCost: 2000000, basis: 'life', lifeQty: 500000 } },
        etc: { method: 'none' },
      },
    });
    const m15 = { pricePerKg: 1500, scrapPricePerKg: 0 };
    let c = Calc.calcCost(prod, m15, rates, 10000);
    const amt = (cc, k) => cc.items.find((i) => i.key === k).amount;
    eq('원재료비 15원', amt(c, 'material'), 15, 1e-9);
    eq('단조(시간): 30,000÷3,000 + 2h×30,000÷10,000 = 16원', amt(c, 'forging'), 16, 1e-9);
    eq('전조(직접입력) 3.2원', amt(c, 'rolling'), 3.2);
    eq('열처리(외주 kg): 10,000개 구간 450원/kg × 9g = 4.05원', amt(c, 'heat'), 4.05, 1e-9);
    eq('도금(외주): 4.5원×10,000=45,000 < 최소 50,000 → 5원', amt(c, 'plating'), 5, 1e-9);
    eq('선별(외주 개당) 1.2원', amt(c, 'inspection'), 1.2);
    eq('해당 없음 공정은 0원', amt(c, 'outsourcing'), 0);
    eq('노무비: 20,000÷4,000 = 5원', amt(c, 'labor'), 5, 1e-9);
    eq('제조간접비: 노무비 5원 × 150% = 7.5원', amt(c, 'overhead'), 7.5, 1e-9);
    eq('포장비: 10박스×2,000÷10,000 = 2원', amt(c, 'packing'), 2, 1e-9);
    eq('운송비: 30,000÷10,000 = 3원', amt(c, 'transport'), 3, 1e-9);
    eq('금형 배부: 2,000,000÷500,000 = 4원', amt(c, 'tooling'), 4, 1e-9);
    eq('총제조원가 = 13개 항목 합계 66.95원', c.total, 15 + 16 + 3.2 + 4.05 + 5 + 1.2 + 0 + 5 + 7.5 + 2 + 3 + 4 + 0, 1e-9);
    eq('자동계산 합계 + 직접입력 합계 = 총원가', c.autoTotal + c.directTotal, c.total, 1e-9);
    check('오류 없음', c.ok, c.errors.join(' / '));

    c = Calc.calcCost(prod, m15, rates, 1000);
    eq('수량 1,000개: 단조 준비비 배부 10 + 60 = 70원', amt(c, 'forging'), 70, 1e-9);
    eq('수량 1,000개: 열처리 기본 구간 500원/kg → 4.5원', amt(c, 'heat'), 4.5, 1e-9);
    eq('수량 1,000개: 도금 최소가공비 50,000÷1,000 = 50원', amt(c, 'plating'), 50, 1e-9);
    check('외주 최소 구간 미만 수량은 경고', c.warnings.some((w) => w.indexOf('최소 구간') >= 0));
    c = Calc.calcCost(prod, m15, rates, 2500);
    eq('포장 2,500개÷1,000 → 3박스 올림: 3×2,000÷2,500 = 2.4원', amt(c, 'packing'), 2.4, 1e-9);

    const bad = base({ netWeightG: 9, inputWeightG: 10, packUnit: 0, costs: {
      forging: { method: 'time', params: { hourlyRate: 30000, pcsPerHour: 0 } },
      packing: { method: 'pack', params: { costPerPack: 2000 } },
      tooling: { method: 'tooling', params: { totalCost: 100, basis: 'life', lifeQty: 0 } },
      heat: { method: 'vendor', params: { vendorRateId: '없는ID' } },
    } });
    c = Calc.calcCost(bad, m15, rates, 1000);
    check('0으로 나누는 입력은 오류 처리되고 NaN/무한대가 나오지 않음', c.errors.length >= 4 && Number.isFinite(c.total) && c.items.every((i) => Number.isFinite(i.amount)), c.errors.join(' / '));
    check('미입력 항목은 누락 경고', c.missing.length > 0 && c.warnings.some((w) => w.indexOf('미입력') >= 0));
    check('수량 0은 오류', Calc.calcCost(prod, m15, rates, 0).errors.length > 0);
    check('수량 소수는 오류', Calc.calcCost(prod, m15, rates, 10.5).errors.length > 0);

    // 수량 조건
    const withOv = Object.assign({}, prod, { qtyOverrides: [{ key: 'rolling', minQty: 10000, unitCost: 2.8 }, { key: 'rolling', minQty: 50000, unitCost: 2.5 }] });
    eq('수량조건 미달(5,000개)이면 기본 단가 3.2원 유지', amt(Calc.calcCost(withOv, m15, rates, 5000), 'rolling'), 3.2);
    eq('수량조건 10,000개 이상 → 2.8원', amt(Calc.calcCost(withOv, m15, rates, 10000), 'rolling'), 2.8);
    eq('수량조건 50,000개 이상 → 2.5원', amt(Calc.calcCost(withOv, m15, rates, 50000), 'rolling'), 2.5);
    const flat = base({ netWeightG: 9, inputWeightG: 10, costs: { rolling: { method: 'direct', value: 3 } } });
    eq('등록된 수량 조건이 없으면 수량이 늘어도 원가가 변하지 않음', Calc.calcCost(flat, m15, [], 1000).total, Calc.calcCost(flat, m15, [], 50000).total);

    // 3. 판매단가
    group = '3. 판매단가';
    const P = (o) => Object.assign({ mode: 'margin', ratePct: 20, decimals: 2, rounding: 'up', vatApply: true, vatRatePct: 10 }, o);
    eq('매출액 대비 이익률 20%: 80 ÷ (1−0.2) = 100원', Calc.calcPrice(80, P()).targetPrice, 100);
    eq('원가 가산율 20%: 80 × 1.2 = 96원', Calc.calcPrice(80, P({ mode: 'markup' })).targetPrice, 96);
    check('두 방식의 결과가 서로 다름(혼동 방지)', Calc.calcPrice(80, P()).targetPrice !== Calc.calcPrice(80, P({ mode: 'markup' })).targetPrice);
    eq('73.4567 ÷ 0.85 = 86.4196… → 소수 2자리 올림 86.42', Calc.calcPrice(73.4567, P({ ratePct: 15 })).targetPrice, 86.42);
    eq('소수 0자리 올림 87', Calc.calcPrice(73.4567, P({ ratePct: 15, decimals: 0 })).targetPrice, 87);
    eq('소수 1자리 내림 86.4', Calc.calcPrice(73.4567, P({ ratePct: 15, decimals: 1, rounding: 'down' })).targetPrice, 86.4);
    eq('딱 떨어지는 값은 올림해도 그대로(100.00)', Calc.calcPrice(80, P()).targetPrice, 100);
    check('이익률 100%는 오류(0으로 나누기 방지)', Calc.calcPrice(80, P({ ratePct: 100 })).errors.length > 0 && Number.isFinite(Calc.calcPrice(80, P({ ratePct: 100 })).targetPrice));
    check('이익률 음수는 오류', Calc.calcPrice(80, P({ ratePct: -5 })).errors.length > 0);
    eq('마진 20% = 가산율 25%', Calc.marginToMarkup(20), 25, 1e-9);
    eq('가산율 25% = 마진 20%', Calc.markupToMargin(25), 20, 1e-9);

    // 4. 견적금액
    group = '4. 견적금액·이익';
    let q = Calc.calcQuote(80, 10000, 100, true, 10);
    eq('공급가액 100원 × 10,000개 = 1,000,000', q.supply, 1000000);
    eq('부가가치세 10% = 100,000', q.vat, 100000);
    eq('총 견적금액 1,100,000', q.total, 1100000);
    eq('개당 이익 20원', q.profitPerUnit, 20);
    eq('전체 이익 200,000원', q.profit, 200000);
    eq('매출액 대비 이익률 20%', q.marginPct, 20, 1e-9);
    q = Calc.calcQuote(80, 10000, 100, false, 10);
    eq('부가세 미적용 시 세액 0, 총액 = 공급가액', q.vat + (q.total - q.supply), 0);
    eq('부동소수 오차 없음: 35.25 × 1,000 = 35,250', Calc.calcQuote(30, 1000, 35.25, true, 10).supply, 35250);
    eq('부가세 원 미만 절사: 12,345 × 10% = 1,234', Calc.calcQuote(1, 12345, 1, true, 10).vat, 1234);
    q = Calc.calcQuote(120, 1000, 100, true, 10);
    check('원가 > 단가이면 손실(음수 이익)', q.profit === -20000 && q.marginPct < 0);
    check('수량 0이어도 NaN 없음', Number.isFinite(Calc.calcQuote(80, 0, 100, true, 10).marginPct));

    let full = Calc.calcFull(prod, m15, rates, 10000, P());
    check('목표단가로 견적하면 판정 정상', full.verdict === 'ok');
    check('목표 이익률 이상 확보', full.quote.marginPct >= 20 - 0.005, full.quote.marginPct);
    full = Calc.calcFull(prod, m15, rates, 10000, P(), 70);
    check('단가를 낮추면 목표 미달 경고', full.verdict === 'below', full.verdict);
    full = Calc.calcFull(prod, m15, rates, 10000, P(), 60);
    check('원가보다 낮은 단가는 손실 경고', full.verdict === 'loss', full.verdict);

    // 5. 계산식 ↔ 계산결과 일치 (무작위 300건)
    group = '5. 계산식·결과 일치';
    let seed = 20261012;
    const rnd = (a, b) => { seed = (seed * 1103515245 + 12345) % 2147483648; return a + (seed / 2147483648) * (b - a); };
    const lastNum = (s) => { const all = s.match(/-?[\d,]+(?:\.\d+)?(?= 원)/g); return all ? Number(all[all.length - 1].replace(/,/g, '')) : null; };
    let mismatch = '', sumBad = '', priceBad = '', quoteBad = '';
    for (let i = 0; i < 300; i++) {
      const net = rnd(1, 300), qty = Math.round(rnd(1, 80000));
      const rp = base({
        netWeightG: net, weightMode: i % 2 ? 'rate' : 'direct', inputWeightG: net * rnd(1, 1.2), lossRatePct: rnd(0, 20), scrapRecoveryPct: rnd(0, 100), packUnit: Math.round(rnd(100, 5000)),
        costs: {
          forging: { method: 'time', params: { hourlyRate: rnd(10000, 60000), pcsPerHour: rnd(500, 9000), setupHours: rnd(0, 4) } },
          rolling: { method: 'direct', value: rnd(0.5, 20) },
          heat: { method: 'vendor', params: { vendorRateId: 'v1' } },
          plating: { method: 'vendor', params: { vendorRateId: 'v2' } },
          inspection: { method: 'vendor', params: { vendorRateId: 'v3' } },
          outsourcing: { method: i % 3 ? 'none' : 'direct', value: rnd(0.1, 5) },
          labor: { method: 'time', params: { hourlyRate: rnd(10000, 30000), pcsPerHour: rnd(500, 9000) } },
          overhead: { method: 'rate', params: { pct: rnd(10, 200), base: ['labor', 'conversion', 'materialConversion'][i % 3] } },
          packing: { method: 'pack', params: { costPerPack: rnd(500, 5000) } },
          transport: { method: 'lot', params: { lotCost: rnd(10000, 100000) } },
          tooling: { method: 'tooling', params: { totalCost: rnd(100000, 5000000), basis: i % 2 ? 'life' : 'order', lifeQty: rnd(10000, 1000000) } },
          etc: { method: 'direct', value: rnd(0.1, 3) },
        },
      });
      const rm = { pricePerKg: rnd(800, 4000), scrapPricePerKg: rnd(0, 500) };
      const pr = P({ mode: i % 2 ? 'margin' : 'markup', ratePct: rnd(0, 60), decimals: i % 3, rounding: ['up', 'round', 'down'][i % 3] });
      const r = Calc.calcFull(rp, rm, rates, qty, pr);
      r.cost.items.forEach((it) => {
        if (it.kind === 'none' || it.kind === 'unset') return;
        const shown = lastNum(it.formula);
        if (shown === null || Math.abs(shown - it.amount) > 0.00006) mismatch = it.name + ': 식 ' + shown + ' ≠ 결과 ' + it.amount;
      });
      if (!near(r.cost.items.reduce((s, x) => s + x.amount, 0), r.cost.total, 1e-9)) sumBad = '합계 불일치 #' + i;
      const back = pr.mode === 'margin' ? r.price.raw * (1 - pr.ratePct / 100) : r.price.raw / (1 + pr.ratePct / 100);
      if (!near(back, r.cost.total, 1e-7) || lastNum(r.price.formula) !== r.price.targetPrice) priceBad = '단가 역산 불일치 #' + i;
      const qq = r.quote;
      if (!near(qq.profit, qq.supply - r.cost.total * qty, 1e-6) || !near(qq.total, qq.supply + qq.vat, 0) || !near(qq.supply, Math.round(qq.unitPrice * qty), 1) ||
        !near(qq.marginPct, qq.profit / qq.supply * 100, 1e-9) || qq.vat !== Math.floor(qq.supply / 10 + 1e-7)) quoteBad = '견적금액 불일치 #' + i;
    }
    check('화면에 표시되는 계산식의 값 = 실제 계산 결과 (300건×13항목)', !mismatch, mismatch);
    check('항목 합계 = 총제조원가 (300건)', !sumBad, sumBad);
    check('판매단가를 역산하면 원가와 일치, 계산식 표시값 = 목표단가 (300건)', !priceBad, priceBad);
    check('공급가액·부가세·총액·이익·이익률 상호 일치 (300건)', !quoteBad, quoteBad);

    // 6. 견적 스냅샷 보존
    group = '6. 과거 견적 보존';
    const snapMat = { pricePerKg: 1500, scrapPricePerKg: 0 };
    const saved = JSON.parse(JSON.stringify(Calc.calcFull(prod, snapMat, rates, 10000, P())));
    const before = JSON.stringify(saved);
    snapMat.pricePerKg = 2000;
    const now = Calc.calcFull(prod, snapMat, rates, 10000, P());
    check('원재료 단가를 올려도 저장된 견적 결과는 그대로', JSON.stringify(saved) === before && saved.cost.material.pricePerKg === 1500);
    eq('현재 원가는 인상분 반영 (10g × 500원/kg = +5원)', now.cost.total - saved.cost.total, 5, 1e-9);

    // 7. 고객사 제출용 견적서 정보 차단
    group = '7. 견적서 내부정보 차단';
    const secretMat = { id: 'm9', grade: 'SCM435', spec: 'Φ7.77', pricePerKg: 1837.25, scrapPricePerKg: 263.5, supplier: '비밀매입처' };
    const sp = Object.assign({}, prod, { code: 'KB-TEST', name: '플랜지 볼트', spec: 'M8×1.25×25', drawingNo: 'DWG-1', drawingRev: 'B', customer: '고객A', note: '내부메모-유출금지' });
    const sr = Calc.calcFull(sp, secretMat, rates, 10000, P({ ratePct: 23.45 }));
    const quote = {
      quoteNo: 'KQ-TEST-01', date: '2026-01-02', customer: '고객A', manager: '홍길동', qty: 10000,
      delivery: '발주 후 30일', validity: '견적일로부터 30일', payment: '익월 말 현금', remarks: '테스트',
      pricing: P({ ratePct: 23.45 }), result: sr, snap: { product: sp, material: secretMat, vendorRates: rates },
      includeBreaks: true,
      breaks: [1000, 50000].map((qy) => { const b = Calc.calcFull(sp, secretMat, rates, qy, P({ ratePct: 23.45 })); return { qty: qy, unitCost: b.cost.total, unitPrice: b.quote.unitPrice, supply: b.quote.supply, profit: b.quote.profit, marginPct: b.quote.marginPct }; }),
    };
    const view = QuoteDoc.buildCustomerView(quote, { name: '금강볼트(주)', ceo: '', bizNo: '', address: '', tel: '', fax: '', email: '' });
    const html = QuoteDoc.renderHtml(view);
    const xbytes = XlsxLite.write([QuoteDoc.toSheet(view)]);
    const xrows = (await XlsxLite.read(xbytes))[0].rows;
    const xtext = xrows.map((r) => r.join('|')).join('\n');
    const viewJson = JSON.stringify(view);
    const secrets = [
      ['총제조원가', Calc.f(sr.cost.total, 2)], ['총제조원가(원값)', String(sr.cost.total)], ['원재료 매입단가', '1,837'], ['원재료 매입단가(원값)', '1837.25'],
      ['스크랩 단가', '263.5'], ['목표 이익률', '23.45'], ['예상이익', Calc.f(sr.quote.profit, 0)], ['개당 이익', Calc.f(sr.quote.profitPerUnit, 2)],
      ['매입처', '비밀매입처'], ['내부 메모', '내부메모'], ['외주업체', 'A열처리'], ['원재료비', Calc.f(sr.cost.material.cost, 2)],
    ];
    const words = ['원가', '이익', '마진', '매입', '손실률', '노무비', '가공비'];
    [['PDF용 견적서', html], ['엑셀 견적서', xtext], ['견적서 데이터', viewJson]].forEach(([label, text]) => {
      const hit = secrets.filter(([, v]) => text.indexOf(v) >= 0).map(([k]) => k).concat(words.filter((w) => text.indexOf(w) >= 0));
      check(label + '에 내부 원가·단가·이익 정보 없음', hit.length === 0, hit.join(', '));
    });
    check('수량별 단가표에도 원가·이익 없음', view.priceBreaks.every((b) => Object.keys(b).sort().join() === 'qty,supply,unitPrice'));
    check('견적서에 필수 항목 표시', ['금강볼트(주)', 'KQ-TEST-01', '2026-01-02', '고객A', '홍길동', 'KB-TEST', '플랜지 볼트', 'M8×1.25×25', 'SCM435', '10,000', '발주 후 30일', '견적일로부터 30일', '익월 말 현금', Calc.f(sr.quote.total, 0)].every((t) => html.indexOf(t) >= 0));
    check('엑셀 견적서의 단가·공급가액·총액 일치', xrows.some((r) => r.indexOf(sr.quote.unitPrice) >= 0 && r.indexOf(sr.quote.supply) >= 0) && xrows.some((r) => r.indexOf(sr.quote.total) >= 0));

    // 8. 엑셀 파일
    group = '8. 엑셀 파일 생성·읽기';
    const src = [['제품코드', '제품명', '순중량(g)'], ['KB-001', '육각 볼트 <M8> & "특수"', 11.8], ['KB-002', '', 0.5], ['', '빈 코드', 1234567]];
    const bytes = XlsxLite.write([{ name: '제품', rows: src }, { name: '둘째', rows: [[1, 2]] }]);
    check('ZIP(xlsx) 서명 PK', bytes[0] === 0x50 && bytes[1] === 0x4B);
    const back = await XlsxLite.read(bytes);
    check('시트 이름 보존', back.length === 2 && back[0].name === '제품' && back[1].name === '둘째');
    check('한글·특수문자·숫자 왕복 일치', JSON.stringify(back[0].rows) === JSON.stringify(src), JSON.stringify(back[0].rows));
    const objs = XlsxLite.toObjects(back[0].rows);
    check('머리글의 (단위) 표기를 무시하고 열 인식', objs.length === 3 && objs[0]['순중량'] === 11.8 && objs[0]['제품코드'] === 'KB-001');
    check('엑셀 날짜 일련번호 변환 (46000 → 2025-12-09)', XlsxLite.serialToDate(46000) === '2025-12-09');

    return results;
  }

  return { run };
});
