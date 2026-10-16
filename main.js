/* 시작·화면 전환 */
'use strict';
(() => {
  App.view = 'dashboard';

  App.render = () => {
    App.actions = {}; App.onInput = null; App.onChange = null;
    const main = $('#main');
    try { App.views[App.view].render(main, App.params); }
    catch (e) { console.error(e); main.innerHTML = '<div class="msg err"><b>화면을 표시하는 중 오류가 발생했습니다.</b><br>' + esc(e.message) + '</div>'; }
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + App.view));
    const notes = [];
    if (hasSample()) notes.push('샘플 데이터(가상 값)가 포함되어 있습니다. [샘플] 표시가 있는 단가·가공비는 실제 회사 자료가 아니므로, 실제 사용 전에 회사 자료로 교체하세요. (삭제: 데이터 백업 및 복원 → 샘플 데이터 모두 삭제)');
    if (!Store.usingIndexedDb()) notes.push('이 브라우저에서는 저장 공간이 제한됩니다. Edge 또는 Chrome 사용을 권장하며, 자주 백업하세요.');
    $('#banner').innerHTML = notes.map((n) => '<div class="bn">' + esc(n) + '</div>').join('');
  };

  function route() {
    const [name, query] = location.hash.replace(/^#/, '').split('?');
    const view = App.views[name] ? name : 'dashboard';
    if (App.view === 'cost' && view !== 'cost' && App.costDirty()) toast('제조원가 화면에 저장하지 않은 변경이 남아 있습니다. 돌아가서 [저장]을 눌러 주세요.', 'err');
    const params = {};
    (query || '').split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); params[k] = decodeURIComponent(v || ''); });
    closeModal();
    const changed = view !== App.view;
    App.view = view; App.params = params;
    App.render();
    if (changed) window.scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.act === 'closeModal') return closeModal();
    const fn = App.actions[el.dataset.act];
    if (!fn) return;
    try { Promise.resolve(fn(el, e)).catch((err) => { console.error(err); toast('오류: ' + err.message, 'err'); }); }
    catch (err) { console.error(err); toast('오류: ' + err.message, 'err'); }
  });
  document.addEventListener('input', (e) => { if (App.onInput && e.target.closest('#main')) App.onInput(e); });
  document.addEventListener('change', (e) => { if (App.onChange && e.target.closest('#main')) App.onChange(e); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (App.costDirty()) { e.preventDefault(); e.returnValue = ''; } });

  Store.load().then(route).catch((e) => {
    console.error(e);
    $('#main').innerHTML = '<div class="msg err"><b>저장된 자료를 불러오지 못했습니다.</b><br>' + esc(e.message) + '</div>';
  });
})();
