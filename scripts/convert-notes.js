#!/usr/bin/env node
'use strict';
// Creates a markdown copy of every .pdf and .docx in knowledge/study-notes/.
// Originals are kept. Output: <name>.<ext>.md next to the original.
// Re-run any time; existing copies are refreshed.
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'knowledge', 'study-notes');

async function pdfToMd(file) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: fs.readFileSync(file) });
  try {
    const res = await parser.getText();
    return res.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } finally {
    if (parser.destroy) await parser.destroy();
  }
}

async function docxToMd(file) {
  const mammoth = require('mammoth');
  const res = await mammoth.convertToMarkdown({ path: file });
  if (res.messages && res.messages.length) console.warn(`  notes for ${path.basename(file)}:`, res.messages.map((m) => m.message).join('; '));
  return res.value.replace(/\n{3,}/g, '\n\n').trim();
}

(async () => {
  if (!fs.existsSync(DIR)) { console.log('No knowledge/study-notes folder.'); return; }
  const files = fs.readdirSync(DIR).filter((f) => /\.(pdf|docx)$/i.test(f)).sort();
  if (!files.length) { console.log('No .pdf or .docx files in knowledge/study-notes yet.'); return; }
  for (const f of files) {
    const src = path.join(DIR, f);
    try {
      const body = /\.pdf$/i.test(f) ? await pdfToMd(src) : await docxToMd(src);
      const header = `<!-- Converted from ${f} by scripts/convert-notes.js. Edit the original, then re-run npm run convert:notes. Check tables and diagrams by hand. -->\n\n# ${f.replace(/\.[^.]+$/, '')}\n\n`;
      fs.writeFileSync(`${src}.md`, header + body + '\n');
      console.log(`converted ${f} -> ${f}.md (${body.length} chars)`);
    } catch (e) {
      console.error(`could not convert ${f}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  console.log('Now run npm run build so the app picks up the new notes.');
})();
