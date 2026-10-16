/* 화면 공통 도구 */
'use strict';
const App = { views: {}, actions: {}, onInput: null, onChange: null, params: {} };
const DB = Store.state;
const N = Calc.num, F = Calc.f;
const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

const STATUSES = ['작성중', '제출', '수주', '실주', '보류'];
const STATUS_CLASS = { 작성중: '', 제출: 'blue', 수주: 'green', 실주: 'red', 보류: '' };
const PROCESS_ITEMS = Calc.COST_ITEMS.filter((i) => i.process);
const STD_QTYS = [1000, 5000, 10000, 50000];

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function won(v, d) { return F(v, d === undefined ? 0 : d) + '원'; }
function pct(v, d) { return F(v, d === undefined ? 2 : d) + '%'; }
function kgHint(g) { return N(g) > 0 ? F(g, 3) + ' g = ' + F(N(g) / 1000, 6) + ' kg' : 'g(그램) 단위로 입력'; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ───────────── 입력 양식 ─────────────
function fld(label, name, value, o) {
  o = o || {};
  const v = value === null || value === undefined ? '' : value;
  let input;
  if (o.type === 'textarea') input = '<textarea name="' + name + '">' + esc(v) + '</textarea>';
  else if (o.options) {
    input = '<select name="' + name + '">' + o.options.map((op) => '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? ' selected' : '') + '>' + esc(op[1]) + '</option>').join('') + '</select>';
  } else {
    input = '<input name="' + name + '" value="' + esc(v) + '"' +
      (o.type === 'number' ? ' type="number" step="any" min="0"' : ' type="' + (o.type || 'text') + '"') +
      (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.list ? ' list="' + o.list + '"' : '') + (o.readonly ? ' readonly' : '') + '>';
  }
  return '<label class="fld ' + (o.cls || '') + '"><span>' + label + (o.req ? '<b class="req">*</b>' : '') + '</span>' +
    '<div class="inp">' + input + (o.unit ? '<em>' + o.unit + '</em>' : '') + '</div>' +
    (o.hint !== undefined ? '<small data-hint="' + name + '">' + o.hint + '</small>' : '') + '</label>';
}
function readForm(el) {
  const out = {};
  $$('input[name],select[name],textarea[name]', el).forEach((i) => {
    if (i.type === 'checkbox') out[i.name] = i.checked;
    else if (i.type === 'radio') { if (i.checked) out[i.name] = i.value; }
    else out[i.name] = i.type === 'number' ? (i.value === '' ? '' : Number(i.value)) : i.value.trim();
  });
  return out;
}
function msgBox(type, title, list) {
  if (!list || !list.length) return '';
  return '<div class="msg ' + type + '"><b>' + title + '</b><ul>' + list.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></div>';
}

// ───────────── 알림·창 ─────────────
function toast(text, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 6000 : 3000);
}
function closeModal() { $$('.modal-back.main').forEach((m) => m.remove()); }
function openModal(title, bodyHtml, o) {
  o = o || {};
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back main';
  back.innerHTML = '<div class="modal ' + (o.wide ? 'wide' : '') + '"><header><h2>' + esc(title) + '</h2><button data-act="closeModal" title="닫기">×</button></header>' +
    '<div class="modal-body">' + bodyHtml + '</div>' + (o.foot ? '<div class="modal-foot">' + o.foot + '</div>' : '') + '</div>';
  document.body.appendChild(back);
  if (o.onInput) back.addEventListener('input', o.onInput);
  if (o.onChange) back.addEventListener('change', o.onChange);
  const first = $('.modal-body input:not([readonly]), .modal-body select', back);
  if (first && !o.noFocus) first.focus();
  return back;
}
function ask(html, okLabel, danger) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.style.zIndex = 60;
    back.innerHTML = '<div class="modal"><div class="modal-body">' + html + '</div><div class="modal-foot"><button data-r="0">취소</button><button class="pri ' + (danger ? 'danger-fill' : '') + '" data-r="1">' + esc(okLabel || '확인') + '</button></div></div>';
    back.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      back.remove();
      resolve(b.dataset.r === '1');
    });
    document.body.appendChild(back);
    $('[data-r="1"]', back).focus();
  });
}

// ───────────── 파일 ─────────────
function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function saveXlsx(filename, sheets) {
  download(filename, XlsxLite.write(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}
function safeName(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }

// ───────────── 자료 조회 ─────────────
function matOf(p) { return DB.materials.find((m) => m.id === (p && p.materialId)) || null; }
function matLabel(m) { return m ? m.grade + (m.spec ? ' / ' + m.spec : '') : '(미지정)'; }
function prodById(id) { return DB.products.find((p) => p.id === id) || null; }
function costOf(p, qty) { return Calc.calcCost(p, matOf(p), DB.vendorRates, qty); }
function sampleBadge(x) { return x && x.isSample ? ' <span class="badge sample">샘플</span>' : ''; }
function hasSample() { return DB.materials.concat(DB.vendorRates, DB.products).some((x) => x.isSample); }
function verdictBadge(v) {
  if (v === 'loss') return '<span class="badge red">손실</span>';
  if (v === 'below') return '<span class="badge orange">목표 미달</span>';
  if (v === 'ok') return '<span class="badge green">정상</span>';
  return '<span class="badge">-</span>';
}
function kindBadge(kind) {
  return { auto: '<span class="badge auto">자동계산</span>', direct: '<span class="badge direct">직접입력</span>', qty: '<span class="badge direct">직접입력·수량조건</span>', none: '<span class="badge">해당없음</span>', unset: '<span class="badge orange">미입력</span>' }[kind] || '';
}
function defaultQty(p) { return N(p && p.moq) >= 1 ? Math.floor(N(p.moq)) : 10000; }
function productOptions(selected) {
  return '<option value="">— 제품을 선택하세요 —</option>' + DB.products.slice().sort((a, b) => a.code.localeCompare(b.code)).map((p) =>
    '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.code + ' | ' + p.name + (p.spec ? ' | ' + p.spec : '') + (p.customer ? ' | ' + p.customer : '')) + '</option>').join('');
}

// 원가 내역표(읽기 전용). 견적 작성·이력 상세에서 공통 사용
function costTableHtml(cost, compare) {
  return '<div class="scroll"><table class="tbl"><thead><tr><th>No</th><th>원가 항목</th><th>구분</th><th class="r">금액(원/개)</th>' +
    (compare ? '<th class="r">현재 기준(원/개)</th><th class="r">차이</th>' : '') + '<th>계산 근거</th></tr></thead><tbody>' +
    cost.items.map((it, i) => {
      const cur = compare ? compare.items[i].amount : 0, diff = cur - it.amount;
      return '<tr><td>' + it.no + '</td><td>' + it.name + '</td><td>' + kindBadge(it.kind) + '</td><td class="r">' + F(it.amount, 2) + '</td>' +
        (compare ? '<td class="r">' + F(cur, 2) + '</td><td class="r" style="color:' + (diff > 0.005 ? 'var(--red)' : diff < -0.005 ? 'var(--green)' : 'inherit') + '">' + (diff > 0 ? '+' : '') + F(diff, 2) + '</td>' : '') +
        '<td class="formula">' + esc(it.formula) + '</td></tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="3">제품 1개당 총제조원가</td><td class="r">' + F(cost.total, 2) + '</td>' +
    (compare ? '<td class="r">' + F(compare.total, 2) + '</td><td class="r">' + (compare.total - cost.total > 0 ? '+' : '') + F(compare.total - cost.total, 2) + '</td>' : '') +
    '<td class="small muted">자동계산 ' + F(cost.autoTotal, 2) + '원 + 직접입력 ' + F(cost.directTotal, 2) + '원</td></tr></tfoot></table></div>';
}

// ───────────── 견적서 출력 ─────────────
function quoteDocHtml(q) { return QuoteDoc.renderHtml(QuoteDoc.buildCustomerView(q, DB.settings.company)); }
function quoteFileName(q) { return safeName('견적서_' + q.quoteNo + '_' + (q.customer || '')); }
function printQuote(q) {
  const old = $('#print-frame');
  if (old) old.remove();
  const fr = document.createElement('iframe');
  fr.id = 'print-frame';
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  fr.onload = () => {
    const title = document.title;
    document.title = quoteFileName(q);
    setTimeout(() => {
      fr.contentWindow.focus();
      fr.contentWindow.print();
      setTimeout(() => { document.title = title; }, 1000);
    }, 100);
  };
  fr.srcdoc = quoteDocHtml(q);
  document.body.appendChild(fr);
}
function excelQuote(q) {
  saveXlsx(quoteFileName(q) + '.xlsx', [QuoteDoc.toSheet(QuoteDoc.buildCustomerView(q, DB.settings.company))]);
  toast('엑셀 견적서를 저장했습니다. (다운로드 폴더)', 'ok');
}

// 엑셀 일괄 등록 공통: 파일 선택 → 분석 → 미리보기 → 확인 후 반영
async function excelImport(title, parseRow, apply) {
  const file = await pickFile('.xlsx');
  if (!file) return;
  let rows;
  try {
    const sheets = await XlsxLite.read(await file.arrayBuffer());
    rows = XlsxLite.toObjects(sheets[0] ? sheets[0].rows : []);
  } catch (e) { toast('엑셀 파일을 읽지 못했습니다: ' + e.message, 'err'); return; }
  if (!rows.length) { toast('등록할 데이터가 없습니다. 첫 줄은 머리글, 둘째 줄부터 데이터를 입력하세요.', 'err'); return; }
  const good = [], errors = [], warns = [];
  rows.forEach((r) => {
    const res = parseRow(r, good);
    (res.warnings || []).forEach((w) => warns.push(r.__row + '행: ' + w));
    if (res.errors && res.errors.length) errors.push(r.__row + '행: ' + res.errors.join(' '));
    else good.push(res.item);
  });
  const nNew = good.filter((g) => g.__new).length;
  const ok = await ask('<h2>' + esc(title) + '</h2><p>파일: ' + esc(file.name) + '</p>' +
    '<div class="msg info">신규 등록 <b>' + nNew + '건</b>, 기존 자료 수정 <b>' + (good.length - nNew) + '건</b>, 오류로 제외 <b>' + errors.length + '건</b></div>' +
    msgBox('err', '오류 (등록되지 않습니다)', errors.slice(0, 15)) + msgBox('warn', '확인 필요', warns.slice(0, 15)) +
    (good.length ? '<p>위 내용대로 등록할까요?</p>' : '<p>등록할 수 있는 행이 없습니다.</p>'), '등록');
  if (!ok || !good.length) return;
  await apply(good);
  toast(good.length + '건을 등록했습니다.', 'ok');
  App.render();
}
function cellText(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function cellNum(v, label, errors) {
  if (v === '' || v === null || v === undefined) return '';
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) { errors.push(label + ' 값이 숫자가 아닙니다(' + v + ').'); return ''; }
  if (n < 0) { errors.push(label + ' 값이 음수입니다.'); return ''; }
  return n;
}
function cellDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return XlsxLite.serialToDate(v);
  const s = cellText(v).replace(/[./]/g, '-');
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) ? s.split('-').map((x, i) => (i ? x.padStart(2, '0') : x)).join('-') : '';
}
// 단가 표시: 소수 자릿수를 고정(예: 94.10)해 견적서 표기와 맞춤
function PF(v, d) { return N(v).toLocaleString('ko-KR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
