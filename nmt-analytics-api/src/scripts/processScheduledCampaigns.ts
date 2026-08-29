import { processDueScheduledCampaigns } from '../lib/campaigns';

async function main() {
  const result = await processDueScheduledCampaigns();
  console.log(JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL processScheduledCampaigns:', err);
  process.exit(1);
});
