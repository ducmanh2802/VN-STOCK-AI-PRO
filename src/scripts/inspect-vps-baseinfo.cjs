const fs = require('fs');
const file = process.argv[2] || '/tmp/vps/hpg_baseinfo.json';
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log('TOP KEYS:', Object.keys(d));
console.log('coban:', JSON.stringify(d.coban).slice(0, 1200));
console.log('ttQuy len:', (d.ttQuy || []).length);
(d.ttQuy || []).forEach((q) =>
  console.log('  PERIOD:', JSON.stringify({ tc: q.TermCode, yr: q.YearPeriod, pe: q.PeriodEnd, pb: q.PeriodBegin, tn: q.TermName, row: q.Row, id: q.ID, ord: q.DisplayOrdering, total: q.TotalRow }))
);
for (const k of Object.keys(d)) {
  const v = d[k];
  if (k === 'symbol' || k === 'ttQuy' || k === 'coban') continue;
  if (Array.isArray(v)) {
    console.log('=== SECTION', k, 'len', v.length);
    for (const row of v) {
      console.log('   ', JSON.stringify({
        name: row.NameEn || row.Name,
        v1: row.Value1, v2: row.Value2, v3: row.Value3, v4: row.Value4, vl: row.Vl,
        unit: row.Unit || row.UnitEn, norm: row.ReportNormID, pn: row.ParentReportNormID,
        comp: row.ReportComponentNameEn,
      }));
    }
  } else {
    console.log('=== SCALAR', k, '=', JSON.stringify(v).slice(0, 500));
  }
}
