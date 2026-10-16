/* 데이터 저장소: 브라우저 내장 데이터베이스(IndexedDB)에 저장합니다.
 * 서버로 전송하지 않으며, 브라우저를 닫았다 열어도 유지됩니다.
 */
const Store = (() => {
  'use strict';
  const DB_NAME = 'kumkang-bolt-quote', OS = 'kv', LS_PREFIX = 'kumkang-bolt-quote:';
  const KEYS = ['settings', 'materials', 'vendorRates', 'products', 'quotes'];
  const APP_ID = 'kumkang-bolt-quote', VERSION = 1;

  function defaultSettings() {
    return {
      company: { name: '금강볼트(주)', ceo: '', bizNo: '', address: '', tel: '', fax: '', email: '' },
      manager: '',
      pricingMode: 'margin', targetRatePct: '', decimals: 2, rounding: 'up',
      vatApply: true, vatRatePct: 10,
      delivery: '', validity: '견적일로부터 30일', payment: '',
      lastBackupAt: null,
    };
  }
  const state = { settings: defaultSettings(), materials: [], vendorRates: [], products: [], quotes: [] };
  let db = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 없음'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(OS);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(OS).objectStore(OS).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbPut(key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OS, 'readwrite');
      tx.objectStore(OS).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  function assign(key, value) {
    if (key === 'settings') {
      const d = defaultSettings(), v = value || {};
      state.settings = Object.assign(d, v, { company: Object.assign(d.company, v.company || {}) });
    } else {
      state[key] = Array.isArray(value) ? value : [];
    }
  }

  async function load() {
    try { db = await openDb(); } catch (e) { db = null; }
    for (const key of KEYS) {
      let v;
      if (db) v = await idbGet(key);
      else { try { v = JSON.parse(localStorage.getItem(LS_PREFIX + key) || 'null'); } catch (e) { v = null; } }
      if (v !== undefined && v !== null) assign(key, v);
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    return state;
  }

  async function save(key) {
    const copy = JSON.parse(JSON.stringify(state[key]));
    if (db) await idbPut(key, copy);
    else localStorage.setItem(LS_PREFIX + key, JSON.stringify(copy));
  }

  function exportData() {
    return {
      app: APP_ID, version: VERSION, exportedAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify({ settings: state.settings, materials: state.materials, vendorRates: state.vendorRates, products: state.products, quotes: state.quotes })),
    };
  }

  // 백업 파일 검사. 문제가 있으면 한국어 오류 메시지를 던집니다.
  function checkBackup(obj) {
    if (!obj || obj.app !== APP_ID || !obj.data) throw new Error('이 앱에서 만든 백업 파일이 아닙니다.');
    if (obj.version > VERSION) throw new Error('더 새로운 버전의 앱에서 만든 백업 파일입니다.');
    for (const k of KEYS) {
      if (k === 'settings') { if (typeof obj.data.settings !== 'object' || !obj.data.settings) throw new Error('백업 파일에 설정 정보가 없습니다.'); }
      else if (!Array.isArray(obj.data[k])) throw new Error('백업 파일이 손상되었습니다. (' + k + ')');
    }
    return obj;
  }

  async function importData(obj) {
    checkBackup(obj);
    for (const k of KEYS) { assign(k, JSON.parse(JSON.stringify(obj.data[k]))); await save(k); }
  }

  async function resetAll() {
    for (const k of KEYS) { assign(k, k === 'settings' ? defaultSettings() : []); await save(k); }
  }

  return { state, load, save, exportData, checkBackup, importData, resetAll, usingIndexedDb: () => !!db };
})();
