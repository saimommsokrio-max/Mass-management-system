const AdmZip = require('adm-zip');
const zip = new AdmZip('Mess_Management_System (1).xlsx');
const sstEntry = zip.getEntry('xl/sharedStrings.xml');
let sst = [];
if (sstEntry) {
  const sstXml = sstEntry.getData().toString('utf8');
  sst = (sstXml.match(/<si>(.*?)<\/si>/gs) || []).map(m => {
    const t = m.match(/<t[^>]*>(.*?)<\/t>/gs);
    return t ? t.map(x => x.replace(/<[^>]+>/g, '')).join('') : '';
  });
}

function dump(sheetFile, title) {
  console.log(`\n================== ${title} ==================`);
  const xml = zip.getEntry(sheetFile).getData().toString('utf8');
  const rowMatches = xml.match(/<row [^>]+>.*?<\/row>/gs) || [];
  for (const r of rowMatches) {
    const rNum = parseInt((r.match(/r="(\d+)"/) || [])[1]);
    if (rNum >= 14 && rNum <= 32) {
      const cells = (r.match(/<c [^>]+>(.*?)<\/c>/gs) || []).map(c => {
        const ref = (c.match(/r="([A-Z0-9]+)"/) || [])[1];
        const isStr = c.includes('t="s"');
        const val = (c.match(/<v>(.*?)<\/v>/) || [])[1] || '';
        const f = (c.match(/<f[^>]*>(.*?)<\/f>/) || [])[1] || '';
        return `${ref}: ${f ? '[' + f + '] ' : ''}${isStr ? sst[parseInt(val)] : val}`;
      });
      console.log(`Row ${rNum}: ${cells.join(' | ')}`);
    }
  }
}

dump('xl/worksheets/sheet3.xml', 'Oct-2026');
