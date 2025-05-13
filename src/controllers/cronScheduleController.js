// cronTasks.js
const cron = require('node-cron');
const { gestionAutomaticaNominas } = require('./googleController');

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
}


