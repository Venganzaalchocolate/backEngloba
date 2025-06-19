const fs   = require('fs');
const fsp  = require('fs/promises');
const path = require('path');
const { PassThrough } = require('stream');
const { google } = require('googleapis');

/*──────────── CONFIG ───────────────────────────────────────────*/
const BACKUP_ROOT  = 'Z:';                       // raíz de backups
const MAPPING_FILE = 'Z:\\correlacion.json';     // carpeta → grupo
const STATE_DIR    = 'import_state';             // progreso resumible
const WORKERS      = 8;                          // ≤10 QPS
const MAX_SIZE     = 25 * 1024 * 1024;           // 25 MB duro API
/*────────────────────────────────────────────────────────────────*/

/*──────────── GOOGLE AUTH ─────────────────────────────────────*/
const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64')
        .toString('utf8')
);
const auth = new google.auth.JWT({
  email  : creds.client_email,
  key    : creds.private_key,
  subject: 'archi@engloba.org.es',            // super-admin
  scopes : [
    'https://www.googleapis.com/auth/admin.directory.group',
    'https://www.googleapis.com/auth/admin.directory.group.member',
    'https://www.googleapis.com/auth/apps.groups.settings',
    'https://www.googleapis.com/auth/apps.groups.migration'
  ],
});
const dirAPI  = google.admin({ version:'directory_v1',  auth });
const setAPI  = google.groupssettings({ version:'v1',   auth });
const migrAPI = google.groupsmigration({ version:'v1',  auth });

/*──────────── LOG + REPORT ────────────────────────────────────*/
const log  = fs.createWriteStream('importLog.txt', { flags:'a' });
const ts   = () => new Date().toISOString().replace('T',' ').slice(0,19);
function logLine(msg){ log.write(`${ts()}  ${msg}\n`); console.log(msg); }

const report = {};   // { key : {subidos, duplicados, omitidos, fallidos} }

/*──────────── STATE helpers (reanudar) ─────────────────────────*/
function statePath(group){
  if(!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR);
  return path.join(STATE_DIR, `${group}.ids`);
}
function loadState(group){
  return fs.existsSync(statePath(group))
    ? new Set(fs.readFileSync(statePath(group),'utf8')
                .trim().split('\n').filter(Boolean))
    : new Set();
}
function appendState(group, id){
  fs.appendFileSync(statePath(group), id + '\n');
}

/*──────────── GROUP helpers ───────────────────────────────────*/
async function ensureGroup(email, name){
  try{ await dirAPI.groups.get({ groupKey: email }); }
  catch{
    await dirAPI.groups.insert({ requestBody: { email, name } });
    logLine(`🆕  Grupo creado: ${email}`);
  }
  await setAPI.groups.patch({
    groupUniqueId: email,
    requestBody : { isArchived: 'true' }
  });
}

/*──────────── EMAIL utils ─────────────────────────────────────*/
function getMessageId(file){
  const fd  = fs.openSync(file,'r');
  const buf = Buffer.alloc(32768);
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const m = buf.toString('ascii').match(/^Message-ID:\s*<([^>]+)>/im);
  return m ? m[1].trim() : null;
}

async function listUnique(dir, seen){
  const out = [];
  async function walk(d){
    for(const e of await fsp.readdir(d,{withFileTypes:true})){
      const full = path.join(d, e.name);
      if(e.isDirectory()){ await walk(full); continue; }
      if(!full.toLowerCase().endsWith('.eml')) continue;
      const id = getMessageId(full);
      if(id && seen.has(id)) continue;          // ya subido/fallido antes
      out.push({ path: full, id });
    }
  }
  await walk(dir);
  return out;
}

function streamWithHeader(emlPath, header){
  const out = new PassThrough();
  out.write(header);
  fs.createReadStream(emlPath)
    .on('error', err => out.destroy(err))
    .pipe(out)
    .on('finish', () => out.end());
  return out;
}

/*──────────── SUBE 1 mensaje (a prueba de fallos) ─────────────*/
async function upload(obj, group, key, processed){
  const { path: eml, id } = obj;
  const base = path.basename(eml);

  /* A) Demasiado grande */
  if(fs.statSync(eml).size > MAX_SIZE){
    logLine(`⚠️  OMITIDO_25MB ${base}`);
    report[key].omitidos.push(base);
    return;
  }

  /* B) Preparar stream con cabecera */
  const relMailbox = path.relative(BACKUP_ROOT, path.dirname(eml)).replace(/\\/g,'/');
  const header     = `X-Original-Mailbox: ${relMailbox}\r\n`;
  const media      = { mimeType:'message/rfc822',
                       body: streamWithHeader(eml, header) };

  /* C) Intentos con back-off ↓ */
  let delay = 200;
  for (let attempt = 0; attempt < 6; attempt++){
    try{
      const { data } = await migrAPI.archive.insert({ groupId: group, media });
      const dup = data.responseCode === 'DUPLICATE';

      dup
        ? (logLine(`🔁 DUPLICATE ${base} → ${group}`),
           report[key].duplicados.push(base))
        : (logLine(`✅ SUBIDO ${base} → ${group}`),
           report[key].subidos.push(base));

      if(id){ processed.add(id); appendState(group,id); }
      return;                               // → OK
    }catch(e){
      /* Clasificar el error */
      const status  = e.response?.status;
      const reason  = e.response?.data?.error?.errors?.[0]?.reason || '';
      const msg     = e.response?.data?.error?.message || '';

      const invalid = status === 400 &&
                      (reason === 'invalid' || /unable to parse/i.test(msg));

      const quota   = [429,503].includes(status);
      const net     = ['ECONNRESET','ETIMEDOUT','EPIPE'].includes(e.code);

      /* 1) Archivo malformado ⇒ FALLIDO */
      if(invalid){
        logLine(`⚠️  FALLIDO (malformado) ${base}`);
        report[key].fallidos.push(base);
        if(id){ processed.add(id); appendState(group,id); }
        return;
      }

      /* 2) Red / cuota ⇒ reintento */
      if(net || quota){
        logLine(`↻ Retry ${attempt+1}/5 (${e.code||status}) ${base}`);
        await new Promise(r => setTimeout(r, delay + Math.random()*100));
        delay *= 2;
        continue;
      }

      /* 3) Cualquier otra cosa ⇒ FALLIDO */
      logLine(`⚠️  FALLIDO (OTHER) ${base} – ${e.message || e.code || status}`);
      report[key].fallidos.push(base);
      if(id){ processed.add(id); appendState(group,id); }
      return;
    }
  }

  /* Agotados reintentos */
  logLine(`❌ ERROR_RETRIES ${base}`);
  report[key].fallidos.push(base);
  if(id){ processed.add(id); appendState(group,id); }
}

/*──────────── POOL de workers ─────────────────────────────────*/
async function pool(arr, group, key, processed){
  let idx = 0;
  const next = () => arr[idx++];
  const worker = async () => {
    for(let o; (o = next()); ) await upload(o, group, key, processed);
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
}

/*──────────── MAIN ────────────────────────────────────────────*/
const ejecutarBackup = async () => {
  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE,'utf8'));

  for(const [folder, group] of Object.entries(mapping)){
    const absFolder = path.join(BACKUP_ROOT, folder);
    const repKey    = `${folder} → ${group}`;
    report[repKey]  = { subidos:[], duplicados:[], omitidos:[], fallidos:[] };

    await ensureGroup(group, 'Histórico '+folder);

    const processed = loadState(group);
    const pendings  = await listUnique(absFolder, processed);

    logLine(`📂  ${folder}: ${pendings.length} pendientes → ${group}`);

    await pool(pendings, group, repKey, processed);

    logLine(`🏁  Grupo ${group} completado\n`);
  }

  fs.writeFileSync('importDetalle.json', JSON.stringify(report,null,2));
  logLine('🏁  Migración finalizada — importDetalle.json');
  log.end();
};







const prueba=async()=>{
// await clearGroupArchive(
//   'pruebamigracion@engloba.org.es',
//   'Prueba Migración',
//   true
// );
//
/* 2. Lanzar de nuevo la importación */
await ejecutarBackup();
}

// prueba();
// //sddsadsf



module.exports = { ejecutarBackup};
