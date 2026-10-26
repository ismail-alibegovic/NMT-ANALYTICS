import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureAnnotations, sanitize } from './report-playwright-failures.mjs';
test('preserves useful assertions while suppressing credentials and signed links',()=>{
 const result=sanitize('Expected: 200\nReceived: 500\npassword: synthetic-hidden\nCookie: synthetic-cookie\nAuthorization: Bearer hidden\nhttps://example.test/verify?token_hash=hidden\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature\nFinal assertion');
 assert.match(result,/Expected: 200/);assert.match(result,/Received: 500/);assert.match(result,/Final assertion/);
 assert.doesNotMatch(result,/synthetic-hidden|synthetic-cookie|Bearer|https:|eyJ|token_hash/);
});
test('publishes only failures and escapes workflow command injection',()=>{
 const xml='<testsuite><testcase name="passed" classname="e2e/passed.spec.ts"></testcase><testcase name="hotel &amp; tenant" classname="e2e/pilot-hotel-read.spec.ts"><failure message="failed"><![CDATA[Expected: 200\nReceived: 500\n::warning::injected % marker]]></failure></testcase></testsuite>';
 const result=failureAnnotations(xml);assert.equal(result.length,1);assert.match(result[0],/file=nmt-analytics-admin\/e2e\/pilot-hotel-read.spec.ts/);assert.match(result[0],/hotel & tenant/);assert.match(result[0],/%0AReceived: 500/);assert.match(result[0],/%0A::warning::injected %25 marker/);assert.equal(result[0].split('\n').length,1);
});
test('handles XML escaping and rejects an unsafe source path',()=>{
 const result=failureAnnotations('<testcase name="bad&#10;title" classname="unsafe,path"><failure>expected &quot;yes&quot; &lt; actual</failure></testcase>');
 assert.equal(result.length,1);assert.match(result[0],/file=\.github\/workflows\/staging-acceptance.yml/);assert.match(result[0],/bad%0Atitle/);assert.match(result[0],/expected "yes" < actual/);
});
