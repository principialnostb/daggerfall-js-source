// The desktop test client reads its EMC index before the game's loaders evaluate.
async function startTestBuild() {
  if (globalThis.daggerShell?.testEmc) {
    await import('./systems/enhancedModResources.js').then((mod) => mod.initEnhancedModResources());
    (await import('./systems/enhancedModProfile.js')).enableStandardModProfile();
  }
  await import('./main.js');
}

startTestBuild().catch(console.error);
