export function installHealthRoutes(app, {status, probe, phoneOtpConfigured, commit = null}) {
  const body = persistence => ({ok:persistence.healthy,service:'aesd-server',commit,
    phoneOtpConfigured,persistence,time:new Date().toISOString()});
  app.get('/health', (_req,res) => {
    const persistence = status();
    res.set('Cache-Control','no-store').status(persistence.healthy ? 200 : 503).json(body(persistence));
  });
  app.get('/ready', async (_req,res) => {
    let persistence;
    try { persistence = await probe(); }
    catch { persistence = {...status(),healthy:false,error:'PERSISTENCE_UNAVAILABLE'}; }
    const ready = persistence.configured && persistence.snapshotExists && persistence.healthy;
    res.set('Cache-Control','no-store').status(ready ? 200 : 503).json({...body(persistence),ok:ready});
  });
}
