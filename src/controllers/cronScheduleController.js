// cronTasks.js
const cron = require('node-cron');
const { gestionAutomaticaNominas } = require('./googleController');
const volunteerApplication = require('../models/volunteerApplication');
const {
  processDailyLeaveStatusChanges,
  processDailyExpectedLeaveEndReminders
} = require('./leaveController');

let isRunning = false;
let isRunningDisableVolunteers = false;
let isRunningLeaves = false;

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

  // 3) Cada día a las 00:01: revisar bajas/excedencias y avisos de fin previsto
  cron.schedule('1 0 * * *', async () => {
    if (isRunningLeaves) {
      console.log('🕑 Aún sigue ejecutándose la revisión diaria de bajas/excedencias, esperando siguiente turno.');
      return;
    }

    isRunningLeaves = true;
    console.log('▶️ Iniciando revisión diaria de bajas/excedencias...');

    try {
      const statusRes = await processDailyLeaveStatusChanges();
      console.log('✅ processDailyLeaveStatusChanges() finalizado:', {
        todayMadrid: statusRes?.todayMadrid ?? null,
        startsToday: statusRes?.startsToday ?? 0,
        endedYesterday: statusRes?.endedYesterday ?? 0,
        affectedUsers: statusRes?.affectedUsers ?? 0,
        synced: statusRes?.synced?.length ?? 0,
        syncErrors: statusRes?.syncErrors?.length ?? 0,
        emailed: statusRes?.emailed?.length ?? 0,
        emailErrors: statusRes?.emailErrors?.length ?? 0,
      });

      const expectedEndRes = await processDailyExpectedLeaveEndReminders();
      console.log('✅ processDailyExpectedLeaveEndReminders() finalizado:', {
        todayMadrid: expectedEndRes?.todayMadrid ?? null,
        tomorrowMadrid: expectedEndRes?.tomorrowMadrid ?? null,
        reminders: expectedEndRes?.reminders ?? 0,
        emailed: expectedEndRes?.emailed?.length ?? 0,
        emailErrors: expectedEndRes?.emailErrors?.length ?? 0,
      });
    } catch (err) {
      console.error('❌ Error en revisión diaria de bajas/excedencias:', err);
    } finally {
      isRunningLeaves = false;
    }
  }, { timezone: 'Europe/Madrid' });
}


