// cronTasks.js
const cron = require("node-cron");

const { gestionAutomaticaNominas } = require("./googleController");
const volunteerApplication = require("../models/volunteerApplication");
const {
  processDailyLeaveStatusChanges,
  processDailyExpectedLeaveEndReminders,
} = require("./leaveController");
const { processHrHiringStartReminders } = require("./hiringController");
const {
  processSesameOpenEntryAlerts,
  processMonthlySesameNoClockInsAlerts,
} = require("./sesameController");
const {
  collectCommunicationMetrics,
} = require("../services/communicationMetricsService");
const {
  syncPendingCommunicationPublications,
} = require("./communicationPublicationController");

const TIMEZONE = "Europe/Madrid";
const isDev = process.env.NODE_ENV !== "production";

/* =========================================================
   BLOQUEOS DE EJECUCIÓN
   Evitan que una tarea vuelva a arrancar si la ejecución
   anterior todavía no ha terminado.
========================================================= */

let isRunningAutomaticPayrollManagement = false;
let isRunningDisableExpiredVolunteers = false;
let isRunningDailyLeaveReview = false;
let isRunningHiringReminders = false;
let isRunningSesameOpenEntryAlerts = false;
let isRunningMonthlySesameNoClockIns = false;
let isRunningCommunicationMetrics = false;
let isRunningCommunicationPublicationSync = false;

/* =========================================================
   GOOGLE DRIVE / NÓMINAS
========================================================= */

const runAutomaticPayrollManagement = async (origin = "cron") => {
  if (isRunningAutomaticPayrollManagement) {
    console.log(
      "🕑 gestionAutomaticaNominas() ya está ejecutándose. Se omite este turno."
    );
    return;
  }

  isRunningAutomaticPayrollManagement = true;
  console.log(`▶️ Iniciando gestionAutomaticaNominas() (${origin})...`);

  try {
    await gestionAutomaticaNominas();
    console.log(`✅ gestionAutomaticaNominas() finalizado (${origin}).`);
  } catch (error) {
    console.error(
      "❌ Error en gestionAutomaticaNominas():",
      error?.message || error
    );
  } finally {
    isRunningAutomaticPayrollManagement = false;
  }
};

/* =========================================================
   VOLUNTARIADO
========================================================= */

const runDisableExpiredVolunteers = async (origin = "cron") => {
  if (isRunningDisableExpiredVolunteers) {
    console.log(
      "🕑 disableExpired() de voluntariado ya está ejecutándose. Se omite este turno."
    );
    return;
  }

  isRunningDisableExpiredVolunteers = true;
  console.log(`▶️ Iniciando disableExpired() de voluntariado (${origin})...`);

  try {
    const result = await volunteerApplication.disableExpired();

    console.log("✅ disableExpired() de voluntariado finalizado:", {
      origin,
      matched: result?.matchedCount ?? result?.n ?? null,
      modified: result?.modifiedCount ?? result?.nModified ?? null,
    });
  } catch (error) {
    console.error(
      "❌ Error en disableExpired() de voluntariado:",
      error?.message || error
    );
  } finally {
    isRunningDisableExpiredVolunteers = false;
  }
};

/* =========================================================
   BAJAS Y EXCEDENCIAS
========================================================= */

const runDailyLeaveReview = async (origin = "cron") => {
  if (isRunningDailyLeaveReview) {
    console.log(
      "🕑 La revisión diaria de bajas y excedencias ya está ejecutándose."
    );
    return;
  }

  isRunningDailyLeaveReview = true;
  console.log(`▶️ Iniciando revisión diaria de bajas y excedencias (${origin})...`);

  try {
    const statusResult = await processDailyLeaveStatusChanges();

    console.log("✅ Cambios diarios de bajas y excedencias procesados:", {
      origin,
      todayMadrid: statusResult?.todayMadrid ?? null,
      startsToday: statusResult?.startsToday ?? 0,
      endedYesterday: statusResult?.endedYesterday ?? 0,
      affectedUsers: statusResult?.affectedUsers ?? 0,
      synced: statusResult?.synced?.length ?? 0,
      syncErrors: statusResult?.syncErrors?.length ?? 0,
      emailed: statusResult?.emailed?.length ?? 0,
      emailErrors: statusResult?.emailErrors?.length ?? 0,
    });

    const reminderResult = await processDailyExpectedLeaveEndReminders();

    console.log("✅ Avisos de fin previsto de bajas procesados:", {
      origin,
      todayMadrid: reminderResult?.todayMadrid ?? null,
      tomorrowMadrid: reminderResult?.tomorrowMadrid ?? null,
      reminders: reminderResult?.reminders ?? 0,
      emailed: reminderResult?.emailed?.length ?? 0,
      emailErrors: reminderResult?.emailErrors?.length ?? 0,
    });
  } catch (error) {
    console.error(
      "❌ Error en la revisión diaria de bajas y excedencias:",
      error?.message || error
    );
  } finally {
    isRunningDailyLeaveReview = false;
  }
};

/* =========================================================
   RECORDATORIOS DE CONTRATACIÓN
========================================================= */

const runHiringStartReminders = async (origin = "cron") => {
  if (isRunningHiringReminders) {
    console.log(
      "🕑 La comprobación de altas próximas ya está ejecutándose."
    );
    return;
  }

  isRunningHiringReminders = true;
  console.log(`▶️ Iniciando comprobación de altas próximas (${origin})...`);

  try {
    const result = await processHrHiringStartReminders();

    console.log("✅ Recordatorios de altas próximas procesados:", {
      origin,
      checkedUsers: result?.checkedUsers ?? 0,
      checkedPeriods: result?.checkedPeriods ?? 0,
      emailed: result?.emailed?.length ?? 0,
      emailErrors: result?.emailErrors?.length ?? 0,
    });
  } catch (error) {
    console.error(
      "❌ Error en la comprobación de altas próximas:",
      error?.message || error
    );
  } finally {
    isRunningHiringReminders = false;
  }
};

/* =========================================================
   SESAME
========================================================= */

const runSesameOpenEntryAlerts = async (origin = "cron") => {
  if (isRunningSesameOpenEntryAlerts) {
    console.log(
      "🕑 La revisión de fichajes abiertos en Sesame ya está ejecutándose."
    );
    return;
  }

  isRunningSesameOpenEntryAlerts = true;
  console.log(`▶️ Iniciando revisión de fichajes abiertos en Sesame (${origin})...`);

  try {
    const result = await processSesameOpenEntryAlerts();

    console.log("✅ Revisión de fichajes abiertos en Sesame finalizada:", {
      origin,
      checked: result?.checked ?? 0,
      openOver12Hours: result?.openOver12Hours ?? 0,
      sent12h: result?.sent12h ?? 0,
      sent24h: result?.sent24h ?? 0,
      sent48h: result?.sent48h ?? 0,
      deletedAlerts: result?.deletedAlerts ?? 0,
      errors: result?.errors?.length ?? 0,
    });
  } catch (error) {
    console.error(
      "❌ Error revisando fichajes abiertos en Sesame:",
      error?.message || error
    );
  } finally {
    isRunningSesameOpenEntryAlerts = false;
  }
};

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
    const result = await processMonthlySesameNoClockInsAlerts({ days: 30 });

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

/* =========================================================
   COMUNICACIÓN: ENLACES DE PUBLICACIONES
========================================================= */

const runCommunicationPublicationSync = async (origin = "cron") => {
  if (isRunningCommunicationPublicationSync) {
    console.log(
      "🕑 La sincronización de publicaciones ya está ejecutándose."
    );
    return;
  }

  isRunningCommunicationPublicationSync = true;
  console.log(`▶️ Iniciando sincronización de publicaciones (${origin})...`);

  try {
    const result = await syncPendingCommunicationPublications();

    console.log("✅ Publicaciones sincronizadas:", {
      origin,
      processed: result?.processed ?? 0,
      updated: result?.updated ?? 0,
    });
  } catch (error) {
    console.error(
      "❌ Error sincronizando publicaciones:",
      error?.message || error
    );
  } finally {
    isRunningCommunicationPublicationSync = false;
  }
};

/* =========================================================
   COMUNICACIÓN: MÉTRICAS
========================================================= */

const runCommunicationMetrics = async (origin = "cron") => {
  if (isRunningCommunicationMetrics) {
    console.log(
      "🕑 La actualización de métricas de comunicación ya está ejecutándose."
    );
    return;
  }

  isRunningCommunicationMetrics = true;
  console.log(
    `▶️ Iniciando actualización de métricas de comunicación (${origin})...`
  );

  try {
    const result = await collectCommunicationMetrics();

    console.log("✅ Métricas de comunicación actualizadas:", {
      origin,
      processed: result?.processed ?? 0,
      wordpressUpdated: result?.wordpressUpdated ?? 0,
      instagramUpdated: result?.instagramUpdated ?? 0,
      saved: result?.saved ?? 0,
      analyticsError: result?.analyticsError ?? null,
      errors: result?.errors?.length ?? 0,
    });

    if (result?.analyticsError) {
      console.error("❌ Error de Google Analytics:", result.analyticsError);
    }

    if (result?.errors?.length) {
      console.error("❌ Errores actualizando métricas:", result.errors);
    }
  } catch (error) {
    console.error(
      "❌ Error actualizando métricas de comunicación:",
      error?.message || error
    );
  } finally {
    isRunningCommunicationMetrics = false;
  }
};

/* =========================================================
   PROGRAMACIÓN DE TAREAS
   Solo se registran los cron en producción.
========================================================= */

if (isDev) {
  console.log("🚀 Corriendo en localhost: tareas cron desactivadas.");
} else {
  const schedule = (expression, task) =>
    cron.schedule(expression, task, {
      timezone: TIMEZONE,
    });

  /* =========================================================
     TAREAS FRECUENTES
  ========================================================= */

  // Nóminas y documentos de Google Drive.
  // Se ejecuta a los minutos 00, 15, 30 y 45 de cada hora.
  schedule("0,15,30,45 * * * *", () =>
    runAutomaticPayrollManagement("cron cada 15 minutos")
  );

  // Localizar publicaciones programadas que ya se hayan publicado.
  // Se ejecuta a los minutos 07, 22, 37 y 52 para no coincidir
  // con la gestión de nóminas.
  schedule("7,22,37,52 * * * *", () =>
    runCommunicationPublicationSync("cron cada 15 minutos")
  );

  // Revisar fichajes abiertos en Sesame.
  // Se ejecuta en el minuto 17 de cada hora.
  schedule("17 * * * *", () =>
    runSesameOpenEntryAlerts("cron cada hora")
  );

  /* =========================================================
     TAREAS DIARIAS
  ========================================================= */

  // 00:02 - Revisar bajas, excedencias y avisos de fin previsto.
  schedule("2 0 * * *", () =>
    runDailyLeaveReview("cron diario")
  );

  // 01:08 - Avisar a RRHH de altas previstas en 24 o 48 horas.
  schedule("8 1 * * *", () =>
    runHiringStartReminders("cron diario")
  );

  // 03:12 - Deshabilitar solicitudes de voluntariado caducadas.
  schedule("12 3 * * *", () =>
    runDisableExpiredVolunteers("cron diario")
  );

  // 04:40 - Actualizar métricas de WordPress e Instagram.
  schedule("40 4 * * *", () =>
    runCommunicationMetrics("cron diario")
  );

  /* =========================================================
     TAREAS MENSUALES
  ========================================================= */

  // Día 1 de cada mes a las 03:40.
  // Revisar personas activas en Sesame sin fichajes recientes.
  schedule("40 3 1 * *", () =>
    runMonthlySesameNoClockIns("cron mensual")
  );
}

module.exports = {
  runAutomaticPayrollManagement,
  runDisableExpiredVolunteers,
  runDailyLeaveReview,
  runHiringStartReminders,
  runSesameOpenEntryAlerts,
  runMonthlySesameNoClockIns,
  runCommunicationPublicationSync,
  runCommunicationMetrics,
};