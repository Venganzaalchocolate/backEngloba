// cronTasks.js
const cron = require('node-cron');
const fs = require('fs').promises;
const OneTimeCode = require('../models/OneTimeCode');
const { gestionAutomaticaNominas } = require('./googleController');

let isRunning = false;
let isCleaning = false;

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


// 2) Cada 5 min: limpieza de OTP expirados y sus archivos
cron.schedule('*/5 * * * *', async () => {
  if (isCleaning) {
    console.log('🕑 Limpieza anterior aún en curso.');
    return;
  }
  isCleaning = true;
  console.log('▶️ Iniciando limpieza de OTP expirados...');
  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const expirados = await OneTimeCode.find({ createdAt: { $lt: cutoff } });
    for (const doc of expirados) {
      try {
        await fs.unlink(doc.filePath);
        console.log(`🗑️  Borrado tmp: ${doc.filePath}`);
      } catch (e) {
        console.warn(`⚠️  No pude borrar ${doc.filePath}:`, e.message);
      }
      await OneTimeCode.deleteOne({ _id: doc._id });
    }
    console.log('✅ Limpieza de OTP completada.');
  } catch (err) {
    console.error('❌ Error en limpieza de OTP expirados:', err);
  } finally {
    isCleaning = false;
  }
}, { timezone: 'Europe/Madrid' });
