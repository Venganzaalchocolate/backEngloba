// cronTasks.js
const cron = require('node-cron');
const { gestionAutomaticaNominas } = require('./googleController');
const volunteerApplication = require('../models/volunteerApplication');
const { syncSesameResponsibilities } = require('./sesameController');

let isRunning = false;

const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  console.log('🚀 Corriendo en localhost (desarrollo)');
} else {
  // 1) Cada 15 min: ejecución serial de tu proceso de Google Drive
  cron.schedule('*/15 * * * *', async () => {
    if (isRunning) {
      console.log('🕑 Aún sigue ejecutándose gestionAutomaticaNominas(), esperando siguiente turno.');
      return;
    }
    isRunning = true;
    console.log('▶️ Iniciando gestionAutomaticaNominas()...');
    try {
      await gestionAutomaticaNominas();
      console.log('✅ gestionAutomaticaNominas() finalizado.');
    } catch (err) {
      console.error('❌ Error en gestionAutomaticaNominas():', err);
    } finally {
      isRunning = false;
    }
  }, { timezone: 'Europe/Madrid' });

  // 2) Cada día a las 03:10: deshabilitar solicitudes de voluntariado caducadas (2 años)
  cron.schedule('10 3 * * *', async () => {
    if (isRunningDisableVolunteers) {
      console.log('🕑 Aún sigue ejecutándose disableExpired() de voluntariado, esperando siguiente turno.');
      return;
    }
    isRunningDisableVolunteers = true;
    console.log('▶️ Iniciando disableExpired() (VolunteerApplication)...');

    try {
      const res = await volunteerApplication.disableExpired();
      // res suele tener matchedCount/modifiedCount en mongoose moderno
      console.log('✅ disableExpired() finalizado:', {
        matched: res?.matchedCount ?? res?.n ?? null,
        modified: res?.modifiedCount ?? res?.nModified ?? null,
      });
    } catch (err) {
      console.error('❌ Error en disableExpired() (VolunteerApplication):', err);
    } finally {
      isRunningDisableVolunteers = false;
    }
  }, { timezone: 'Europe/Madrid' });
}



cron.schedule(
  "30 3 * * *",
  async () => {
    try {
      const batchSize = 20;
      const delayMs = 800;
      let startFrom = 0;
      let totalProcessed = 0;
      let totalSaved = 0;
      let totalErrors = 0;

      while (true) {
        const result = await syncSesameResponsibilities({
          startFrom,
          limitUsers: batchSize,
          delayMs,
        });

        console.log(`Lote desde ${startFrom}:`, result);

        if (!result.processedUsers) break;

        totalProcessed += result.processedUsers;
        totalSaved += result.totalResponsibilitiesSaved || 0;
        totalErrors += result.totalErrors || 0;

        startFrom += batchSize;
      }

      console.log({
        ok: true,
        totalProcessed,
        totalSaved,
        totalErrors,
      });
    } catch (error) {
      console.error("[CRON] Error syncing Sesame responsibilities:", error);
    }
  },
  {
    timezone: "Europe/Madrid",
  }
);