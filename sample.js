/* 샘플 데이터 — 화면을 둘러보기 위한 "가상의 숫자"입니다.
 * 금강볼트(주)의 실제 단가·가공비·임률이 아니므로 실제 견적에 사용하면 안 됩니다.
 * 모든 샘플에는 isSample 표시가 붙어 화면에 [샘플] 배지가 나타나고, 한 번에 삭제할 수 있습니다.
 */
const Sample = (() => {
  'use strict';
  const NOTE = '샘플(가상 값) — 실제 자료로 교체 필요';
  function build() {
    const materials = [
      { id: 's-m1', grade: 'SCM435', spec: 'Φ7.2 (샘플)', supplier: '[샘플] 가상 선재', pricePerKg: 1500, scrapPricePerKg: 300, effectiveDate: '2026-01-01', note: NOTE, history: [], isSample: true },
      { id: 's-m2', grade: 'SWCH45K', spec: 'Φ9.0 (샘플)', supplier: '[샘플] 가상 선재', pricePerKg: 1200, scrapPricePerKg: 250, effectiveDate: '2026-01-01', note: NOTE, history: [], isSample: true },
      { id: 's-m3', grade: 'SWCH10A', spec: 'Φ3.5 (샘플)', supplier: '[샘플] 가상 선재', pricePerKg: 1100, scrapPricePerKg: 0, effectiveDate: '2026-01-01', note: NOTE, history: [], isSample: true },
    ];
    const vendorRates = [
      { id: 's-v1', vendor: '[샘플] 가상열처리', process: 'heat', condition: '조질(QT) 10.9급', unit: 'kg', tiers: [{ minQty: 1, price: 400 }, { minQty: 50000, price: 360 }], minCharge: 30000, effectiveDate: '2026-01-01', note: NOTE, isSample: true },
      { id: 's-v2', vendor: '[샘플] 가상도금', process: 'plating', condition: '아연니켈 도금', unit: 'kg', tiers: [{ minQty: 1, price: 600 }], minCharge: 40000, effectiveDate: '2026-01-01', note: NOTE, isSample: true },
      { id: 's-v3', vendor: '[샘플] 가상선별', process: 'inspection', condition: '화상 전수선별', unit: 'ea', tiers: [{ minQty: 1, price: 1 }, { minQty: 10000, price: 0.8 }], minCharge: 0, effectiveDate: '2026-01-01', note: NOTE, isSample: true },
    ];
    const now = new Date().toISOString();
    const products = [
      {
        id: 's-p1', code: 'SAMPLE-001', name: '[샘플] 육각 플랜지 볼트', customer: '[샘플] 가상자동차부품', drawingNo: 'SMP-0001', drawingRev: 'A',
        spec: 'M8×1.25×25', materialId: 's-m1', netWeightG: 11.8, weightMode: 'direct', inputWeightG: 12.5, lossRatePct: 0, scrapRecoveryPct: 100,
        monthlyQty: 20000, annualQty: 240000, moq: 5000, packUnit: 2000, note: NOTE, isSample: true, updatedAt: now,
        costs: {
          forging: { method: 'time', params: { hourlyRate: 30000, pcsPerHour: 3600, setupHours: 1 } },
          rolling: { method: 'direct', value: 1.5 },
          heat: { method: 'vendor', params: { vendorRateId: 's-v1' } },
          plating: { method: 'vendor', params: { vendorRateId: 's-v2' } },
          inspection: { method: 'vendor', params: { vendorRateId: 's-v3' } },
          outsourcing: { method: 'none' },
          labor: { method: 'time', params: { hourlyRate: 20000, pcsPerHour: 4000, setupHours: 0 } },
          overhead: { method: 'rate', params: { pct: 100, base: 'labor' } },
          packing: { method: 'pack', params: { costPerPack: 1500 } },
          transport: { method: 'lot', params: { lotCost: 50000 } },
          tooling: { method: 'tooling', params: { totalCost: 1500000, basis: 'life', lifeQty: 300000 } },
          etc: { method: 'none' },
        },
        qtyOverrides: [{ key: 'rolling', minQty: 50000, unitCost: 1.3 }],
      },
      {
        id: 's-p2', code: 'SAMPLE-002', name: '[샘플] 육각 볼트', customer: '[샘플] 가상중장비', drawingNo: 'SMP-0002', drawingRev: 'B',
        spec: 'M10×1.5×40', materialId: 's-m2', netWeightG: 28.4, weightMode: 'rate', inputWeightG: 0, lossRatePct: 4, scrapRecoveryPct: 0,
        monthlyQty: 8000, annualQty: 96000, moq: 3000, packUnit: 1000, note: NOTE, isSample: true, updatedAt: now,
        costs: {
          forging: { method: 'direct', value: 12 },
          rolling: { method: 'direct', value: 2.5 },
          heat: { method: 'vendor', params: { vendorRateId: 's-v1' } },
          plating: { method: 'none' },
          inspection: { method: 'direct', value: 1 },
          outsourcing: { method: 'none' },
          labor: { method: 'direct', value: 6 },
          overhead: { method: 'rate', params: { pct: 80, base: 'labor' } },
          packing: { method: 'pack', params: { costPerPack: 1500 } },
          transport: { method: 'lot', params: { lotCost: 50000 } },
          tooling: { method: 'tooling', params: { totalCost: 2000000, basis: 'order' } },
          etc: { method: 'none' },
        },
        qtyOverrides: [],
      },
      {
        id: 's-p3', code: 'SAMPLE-003', name: '[샘플] 접시머리 소형 나사 (원가 미입력 예시)', customer: '[샘플] 가상전자', drawingNo: 'SMP-0003', drawingRev: '',
        spec: 'M4×0.7×10', materialId: 's-m3', netWeightG: 1.1, weightMode: 'direct', inputWeightG: 1.15, lossRatePct: 0, scrapRecoveryPct: 0,
        monthlyQty: 100000, annualQty: 1200000, moq: 50000, packUnit: 10000, note: NOTE, isSample: true, updatedAt: now,
        costs: { forging: { method: 'direct', value: 1.2 }, rolling: { method: 'direct', value: 0.4 }, heat: { method: 'none' }, outsourcing: { method: 'none' } },
        qtyOverrides: [],
      },
    ];
    return { materials, vendorRates, products };
  }
  return { build };
})();
