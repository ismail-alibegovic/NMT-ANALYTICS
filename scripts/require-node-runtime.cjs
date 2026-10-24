// One supported major for local builds, CI, containers and the Zo launcher.
function requireSupportedNode() {
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    console.error(`[production] Travline requires Node.js 24 LTS; found ${process.versions.node}. Select Node 24 before installing, building or starting.`);
    process.exit(1);
  }
}
module.exports = { requireSupportedNode };
if (require.main === module) requireSupportedNode();
