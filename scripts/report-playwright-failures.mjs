import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const decode = value => value.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function sanitize(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n').filter(line => !/authorization|api.?key|password|secret|cookie|bearer|credential|postgres(?:ql)?:\/\/|access_token|refresh_token|token_hash|signature=/i.test(line)).join('\n')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[URL]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN]')
    .slice(0, 3000);
}
const escape = value => value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
export function failureAnnotations(xml) {
  const annotations = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g)) {
    const failure = match[2].match(/<failure\b[^>]*>([\s\S]*?)<\/failure>/);
    if (!failure) continue;
    const attr = name => decode((match[1].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || '');
    const file = attr('classname').replace(/^.*?(?=e2e\/)/, '');
    const path = /^e2e\/[\w./-]+\.spec\.ts$/.test(file) ? `nmt-analytics-admin/${file}` : '.github/workflows/staging-acceptance.yml';
    const detail = decode(failure[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, ''));
    annotations.push(`::error file=${path},line=1,title=Authenticated acceptance failed::${escape(sanitize(attr('name') + '\n' + detail))}`);
    if (annotations.length === 25) break;
  }
  return annotations;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (file && existsSync(file)) {
    const annotations = failureAnnotations(readFileSync(file, 'utf8'));
    for (const annotation of annotations) console.log(annotation);
    console.log(`Authenticated acceptance: ${annotations.length} sanitized failing-test annotation(s).`);
  } else console.log('No authenticated JUnit report available; inspect the failed prerequisite step.');
}
