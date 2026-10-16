// 계산 자동 검증 실행:  node tests/run-tests.js
const path = require('path');
const js = (f) => require(path.join(__dirname, '..', 'js', f));

js('selftest.js').run({ Calc: js('calc.js'), XlsxLite: js('xlsx-lite.js'), QuoteDoc: js('quote-doc.js') }).then((results) => {
  let group = '';
  results.forEach((r) => {
    if (r.group !== group) { group = r.group; console.log('\n[' + group + ']'); }
    console.log((r.pass ? '  통과  ' : '  실패  ') + r.name + (r.pass ? '' : '\n         → ' + r.detail));
  });
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n총 ' + results.length + '건 중 ' + (results.length - failed) + '건 통과, ' + failed + '건 실패');
  process.exit(failed ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
