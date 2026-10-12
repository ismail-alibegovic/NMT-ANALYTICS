import { mkdir, writeFile } from 'node:fs/promises';

const supabaseUrl = process.env.TRAVLINE_SUPABASE_URL;
const anonKey = process.env.TRAVLINE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.TRAVLINE_SUPABASE_SERVICE_ROLE_KEY;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerMailbox = managerEmail?.split('@')[0];
const evidenceDir = process.env.ACCEPTANCE_EVIDENCE_DIR || 'acceptance-evidence';

if (!supabaseUrl || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(supabaseUrl)) {
  throw new Error('Acceptance service checks require a local Supabase URL.');
}
if (!anonKey || !serviceRoleKey || !managerEmail) {
  throw new Error('Acceptance service checks require local Supabase keys and a synthetic manager email.');
}

const serviceHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};
const userHeaders = {
  apikey: anonKey,
  'Content-Type': 'application/json',
};

async function expectOk(response, label) {
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

const bucketId = `acceptance-${Date.now()}`;
const objectPath = 'synthetic-check.txt';
const objectBody = 'Travline isolated acceptance evidence';

const bucket = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
  method: 'POST',
  headers: serviceHeaders,
  body: JSON.stringify({ id: bucketId, name: bucketId, public: false }),
});
await expectOk(bucket, 'Storage bucket creation');

try {
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${bucketId}/${objectPath}`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'x-upsert': 'false' },
    body: objectBody,
  });
  await expectOk(upload, 'Storage upload');

  const download = await fetch(`${supabaseUrl}/storage/v1/object/${bucketId}/${objectPath}`, {
    headers: serviceHeaders,
  });
  await expectOk(download, 'Storage download');
  const downloadedBody = await download.text();
  if (downloadedBody !== objectBody) {
    throw new Error('Storage round-trip returned unexpected content.');
  }

  const recovery = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({ email: managerEmail }),
  });
  await expectOk(recovery, 'Synthetic Auth recovery email request');

  const smtp = await fetch(
    `http://127.0.0.1:54324/api/v1/mailbox/${encodeURIComponent(managerMailbox)}`,
  );
  await expectOk(smtp, 'Local Inbucket API');
  const messages = await smtp.json();
  const messageList = Array.isArray(messages) ? messages : messages.messages || [];
  const delivered = messageList.some((message) => {
    const raw = JSON.stringify(message).toLowerCase();
    return raw.includes(managerEmail.toLowerCase());
  });
  if (!delivered) {
    throw new Error(`Local Inbucket did not contain a message for ${managerEmail}.`);
  }

  await mkdir(evidenceDir, { recursive: true });
  await writeFile(`${evidenceDir}/services.json`, JSON.stringify({
    storage: { bucket: bucketId, upload: 'PASS', download: 'PASS', contentRoundTrip: 'PASS' },
    smtp: { provider: 'local-inbucket', recipient: managerEmail, delivery: 'PASS' },
  }, null, 2));
} finally {
  const removedObject = await fetch(`${supabaseUrl}/storage/v1/object/${bucketId}/${objectPath}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!removedObject.ok && removedObject.status !== 404) {
    throw new Error(`Storage object cleanup failed with HTTP ${removedObject.status}: ${await removedObject.text()}`);
  }
  const removed = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, {
    method: 'DELETE',
    headers: serviceHeaders,
  });
  await expectOk(removed, 'Storage bucket cleanup');
}
