// import-to-francisca.js

const fs    = require('fs');
const fsp   = require('fs/promises');
const path  = require('path');
const { google } = require('googleapis');

/*──────────── CONFIG ───────────────────────────────────────────*/
const BACKUP_FOLDER = 'Z:/malaga_dir';           // carpeta raíz a leer
const TARGET_EMAIL  = 'santiago.ruizgalacho@engloba.org.es';  
const MAX_SIZE      = 25 * 1024 * 1024;                // 25 MB máximo API

/*──────────── GOOGLE AUTH ─────────────────────────────────────*/
const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64')
        .toString('utf8')
);
const auth = new google.auth.JWT({
  email  : creds.client_email,
  key    : creds.private_key,
  subject: TARGET_EMAIL,       // impersonamos a Francisca
  scopes : ['https://mail.google.com/']
});
const gmail = google.gmail({ version:'v1', auth });

/*──────────── LOG ──────────────────────────────────────────────*/
const log = fs.createWriteStream('importLog.txt', { flags:'a' });
const ts  = () => new Date().toISOString().replace('T',' ').slice(0,19);
function logLine(msg){
  log.write(`${ts()}  ${msg}\n`);
  console.log(msg);
}

/*──────────── RECURSIVE LIST of .eml ──────────────────────────*/
async function listEmls(dir){
  let results = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await listEmls(full));
    } else if (full.toLowerCase().endsWith('.eml')) {
      results.push(full);
    }
  }
  return results;
}

/*──────────── UPLOAD SINGLE .eml ─────────────────────────────*/
async function uploadEml(emlPath){
  const base = path.basename(emlPath);
  const { size } = await fsp.stat(emlPath);
  if (size > MAX_SIZE) {
    logLine(`⚠️ OMITIDO (>25MB): ${base}`);
    return;
  }

  try {
    await gmail.users.messages.import({
      userId: 'me',
      media: {
        mimeType: 'message/rfc822',
        body    : fs.createReadStream(emlPath)
      },
      requestBody: {
        internalDateSource: 'receivedTime',
        labelIds: ['INBOX']
      }
    });
    logLine(`✅ SUBIDO: ${base}`);
  } catch (err) {
    logLine(`❌ ERROR: ${base} → ${err.message||err.code||err}`);
  }
}

// /*──────────── MAIN EXECUTION ─────────────────────────────────*/
// (async () => {
//   logLine(`🚀 Inicio importación de ${BACKUP_FOLDER} → ${TARGET_EMAIL}`);

//   let emls;
//   try {
//     emls = await listEmls(BACKUP_FOLDER);
//     logLine(`   Encontrados ${emls.length} archivos .eml`);
//   } catch (err) {
//     logLine(`❌ ERROR al leer carpeta: ${err.message}`);
//     process.exit(1);
//   }

//   for (const eml of emls) {
// const base = path.basename(eml)
// if(base.split('.')[0]>2278)await uploadEml(eml);
//   }

//   logLine('🏁 Importación completada');
//   log.end();
// })();
