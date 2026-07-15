// cronTasks.js
const cron = require('node-cron');
const { gestionAutomaticaNominas } = require('./googleController');
const volunteerApplication = require('../models/volunteerApplication');
const {
  processDailyLeaveStatusChanges,
  processDailyExpectedLeaveEndReminders
} = require('./leaveController');
const { processHrHiringStartReminders } = require('./hiringController');

const {
  processSesameOpenEntryAlerts,
  processMonthlySesameNoClockInsAlerts,
} = require("./sesameController");

let isRunning = false;
let isRunningDisableVolunteers = false;
let isRunningLeaves = false;
let isRunningHiringReminders = false;
let isRunningSesameAlerts = false;
let isRunningMonthlySesameNoClockIns = false;

const runMonthlySesameNoClockIns = async (origin = "cron") => {
  if (isRunningMonthlySesameNoClockIns) {
    console.log(
      "🕑 La revisión mensual de personas sin fichajes ya está ejecutándose."
    );
    return;
  }

  isRunningMonthlySesameNoClockIns = true;

  console.log(
    `▶️ Iniciando revisión mensual de personas sin fichajes en Sesame (${origin})...`
  );

  try {
    const result = await processMonthlySesameNoClockInsAlerts({
      days: 30,
    });

    console.log(
      "✅ Revisión mensual de personas sin fichajes finalizada:",
      {
        origin,
        from: result?.from ?? null,
        to: result?.to ?? null,
        activeSesameEmployees: result?.activeSesameEmployees ?? 0,
        workEntries: result?.workEntries ?? 0,
        withoutClockIns: result?.withoutClockIns ?? 0,
        eligible: result?.eligible ?? 0,
        sentEmployeeEmails: result?.sentEmployeeEmails ?? 0,
        sentManagerEmails: result?.sentManagerEmails ?? 0,
        summaryEmployees: result?.summaryEmployees ?? 0,
        summaryEmailSent: result?.summaryEmailSent ?? false,
        skippedActiveLeave: result?.skippedActiveLeave?.length ?? 0,
        skippedNoManager: result?.skippedNoManager?.length ?? 0,
        errors: result?.errors?.length ?? 0,
      }
    );
  } catch (error) {
    console.error(
      "❌ Error en la revisión mensual de personas sin fichajes:",
      error?.message || error
    );
  } finally {
    isRunningMonthlySesameNoClockIns = false;
  }
};

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

  // 4) Cada día a la 01:00: avisar a RRHH de altas próximas en 24h/48h
  cron.schedule('0 1 * * *', async () => {
    if (isRunningHiringReminders) {
      console.log('🕑 Aún sigue ejecutándose la comprobación de altas próximas, esperando siguiente turno.');
      return;
    }

    isRunningHiringReminders = true;
    console.log('▶️ Iniciando comprobación de altas próximas...');

    try {
      const res = await processHrHiringStartReminders();

      console.log('✅ processHrHiringStartReminders() finalizado:', {
        checkedUsers: res?.checkedUsers ?? 0,
        checkedPeriods: res?.checkedPeriods ?? 0,
        emailed: res?.emailed?.length ?? 0,
        emailErrors: res?.emailErrors?.length ?? 0,
      });
    } catch (err) {
      console.error('❌ Error en comprobación de altas próximas:', err);
    } finally {
      isRunningHiringReminders = false;
    }
  }, { timezone: 'Europe/Madrid' });
  // Cada hora: revisar fichajes abiertos en Sesame
cron.schedule(
  "0 * * * *",
  async () => {
    if (isRunningSesameAlerts) {
      console.log(
        "🕑 La revisión de fichajes abiertos en Sesame todavía está ejecutándose."
      );
      return;
    }

    isRunningSesameAlerts = true;

    console.log(
      "▶️ Iniciando revisión de fichajes abiertos en Sesame..."
    );

    try {
      const result =
        await processSesameOpenEntryAlerts();

      console.log(
        "✅ Revisión de fichajes abiertos en Sesame finalizada:",
        {
          checked: result?.checked ?? 0,
          openOver12Hours:
            result?.openOver12Hours ?? 0,
          sent12h:
            result?.sent12h ?? 0,
          sent24h:
            result?.sent24h ?? 0,
          sent48h:
            result?.sent48h ?? 0,
          deletedAlerts:
            result?.deletedAlerts ?? 0,
          errors:
            result?.errors?.length ?? 0,
        }
      );
    } catch (error) {
      console.error(
        "❌ Error revisando fichajes abiertos en Sesame:",
        error?.message || error
      );
    } finally {
      isRunningSesameAlerts = false;
    }
  },
  { timezone: "Europe/Madrid",});
  // Ejecución puntual: 15/07/2026 a las 14:45, hora de Madrid
const sesameFirstRunDateTime = new Date("2026-07-15T14:45:00+02:00");
const millisecondsUntilFirstRun = sesameFirstRunDateTime.getTime() - Date.now();

if (millisecondsUntilFirstRun > 0) {
  console.log(
    `🕒 Revisión inicial de Sesame programada para ${sesameFirstRunDateTime.toLocaleString(
      "es-ES",
      { timeZone: "Europe/Madrid" }
    )}`
  );

  setTimeout(() => {
    runMonthlySesameNoClockIns("ejecución inicial programada");
  }, millisecondsUntilFirstRun);
} else {
  console.log(
    "ℹ️ La fecha de la ejecución inicial de Sesame ya ha pasado."
  );
}

// Día 1 de cada mes a las 03:30
cron.schedule(
  "30 3 1 * *",
  () => runMonthlySesameNoClockIns("cron mensual"),
  {
    timezone: "Europe/Madrid",
  }
);
}