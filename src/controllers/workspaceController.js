
const { google } = require('googleapis');
const { User, Program } = require('../models/indexModels');
const mongoose = require('mongoose');
const { catchAsync } = require('../utils/catchAsync');
const { response } = require('../utils/response');
const { error } = require('pdf-lib');
const { ClientError } = require('../utils/clientError');

// 1. Decodificamos las credenciales
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);

// 2. Extraemos client_email y private_key del JSON
const { client_email, private_key } = credentials;

const SCOPES = [
  'https://www.googleapis.com/auth/drive',                       // Drive
  'https://www.googleapis.com/auth/admin.directory.orgunit',     // OUs (R/W)
  'https://www.googleapis.com/auth/admin.directory.user',        // Users (R/W)
  'https://www.googleapis.com/auth/admin.directory.group',       // Groups (R/W)
  'https://www.googleapis.com/auth/admin.directory.group.member', // Group members (R/W)
  'https://www.googleapis.com/auth/admin.directory.user.security',
  'https://www.googleapis.com/auth/drive',                       // Drive
  'https://www.googleapis.com/auth/apps.groups.settings',
  'https://www.googleapis.com/auth/apps.groups.migration',
];
// 3. Creamos la autenticación JWT con el 'subject'
//ss
const auth = new google.auth.JWT({
  email: client_email,
  key: private_key,
  scopes: SCOPES,
  subject: 'archi@engloba.org.es',  // aquí se “impersona” a este usuario
});
//hjbg
const directory = google.admin({ version: 'directory_v1', auth });
const groupsSettings  = google.groupssettings({ version: 'v1', auth });
const groupsMigration = google.groupsmigration({ version: 'v1', auth });
const DOMAIN = 'engloba.org.es';
// ————————————————————————————————————————————————————————————————————————
// UTIL: Normalizar cadenas (sin tildes ni espacios) para emails de grupo
// ————————————————————————————————————————————————————————————————————————

// -----------------------------------------------------------------------------
// client y scopes ya definidos más arriba (auth, directory, groupsSettings)
// -----------------------------------------------------------------------------

/** Devuelve todos los grupos del dominio, paginando de 200 en 200. */
async function listAllGroups() {
  const groups = [];
  let pageToken;
  do {
    const res = await directory.groups.list({
      domain: DOMAIN,             // 'engloba.org.es'
      maxResults: 200,
      pageToken,
    });
    groups.push(...(res.data.groups || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return groups;
}

/** Hace patch(isArchived='true') con hasta 6 reintentos y back-off exponencial. */
async function patchWithBackoff(email) {
  let delay = 400;                     // empieza en 0,4 s
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await groupsSettings.groups.patch({
        groupUniqueId: email,
        requestBody: { isArchived: 'true' },
      });
      console.log(`✔ Historial activado en ${email}`);
      return;
    } catch (err) {
      const apiErr = err?.errors?.[0] || {};
      const retryable =
        ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'].includes(apiErr.reason) ||
        [429, 503].includes(err.code);

      if (!retryable) {                        // error permanente
        console.error(`❌ Error definitivo en ${email}:`,
                      apiErr.message || err.message);
        return;
      }

      // error de cuota o backend: back-off
      console.warn(`↻ Reintento ${attempt} en ${email} (${apiErr.reason || err.code})`);
      await new Promise(r => setTimeout(r, delay + Math.random() * 200));
      delay *= 2;                              // 0,4 → 0,8 → 1,6 → …
    }
  }
  console.error(`❌ No se pudo actualizar ${email} tras 6 intentos`);
}


function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina tildes
    .replace(/\s+/g, '')             // elimina espacios y guiones
    .replace(/[^a-z0-9]/g, '');      // solo alfanuméricos
}

// ————————————————————————————————————————————————————————————————————————
// UTIL: Construir email de Workspace para un usuario
//    basándose en firstName.lastName@DOMAIN
// ————————————————————————————————————————————————————————————————————————

function buildUserEmail(user) {
  if(!user) return ''
  const first = (user.firstName || '').trim().toLowerCase();
  const last = (user.lastName || '').trim().toLowerCase();
  const normalizedFirst = first
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const normalizedLast = last
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  return `${normalizedFirst}.${normalizedLast}@${DOMAIN}`;

}



//------------------USUARIOS---------------------
const createUserWS = async (userId, contador=0) => {

  if (!userId) throw new ClientError('Falta el ID del usuario', 400);

  const user = await User.findById(userId).lean();
  if (!user) throw new ClientError('Usuario no encontrado', 404);

  let userEmail = buildUserEmail(user);
  if (contador > 0) {
    const [local, domain] = userEmail.split('@');
    userEmail = `${local}${contador}@${domain}`; // Ej: juan.perez1@dominio.com
  }
  const givenName = (user.firstName || '').trim();
  const familyName = (user.lastName || '').trim();

  try {
    const { data } = await directory.users.insert({
      requestBody: {
        primaryEmail: userEmail,
        name: {
          givenName,
          familyName
        },
        password: 'Temporal123*',  // Puedes hacer esto configurable
        changePasswordAtNextLogin: true,
      }
    });

    return {
      id: data.id,
      email: data.primaryEmail,
      name: data.name.fullName,
    };
  } catch (err) {
    const reason = err?.errors?.[0]?.reason;
    if (reason === 'duplicate') {
      // Llamada recursiva, importante usar return
      return await createUserWS(userId, contador + 1);
    }
    throw err;
  }
};

  
const deleteUserByEmailWS = async (email) => {
  if (!email || typeof email !== 'string') {
    throw new ClientError('Email requerido y debe ser válido', 400);
  }

  await directory.users.delete({
    userKey: email
  }).catch(err => {
    const reason = err?.errors?.[0]?.reason;

    if (reason === 'notFound') {
      throw new ClientError('Usuario no encontrado en Workspace', 404);
    }

    // Otros errores se propagan
    throw err;
  });

  return { email, deleted: true };
};

const updateUserWS = async (req, res) => {
  const { userId, updates } = req.body;

  if (!userId || !updates || typeof updates !== 'object') {
    throw new ClientError('Parámetros inválidos', 400);
  }

  const user = await User.findById(userId).lean();
  if (!user) throw new ClientError('Usuario no encontrado', 404);

  const userEmail = buildUserEmail(user);

  await directory.users.update({
    userKey: userEmail,
    requestBody: updates,
  }).catch(err => {
    const reason = err?.errors?.[0]?.reason;
    if (reason === 'notFound') {
      throw new ClientError('Usuario no encontrado en Workspace', 404);
    }
    throw err;
  });

  response(res, 200, { email: userEmail, updated: true });
};


//------------GRUPOS--------------------------

async function addUserToGroup(userId, groupEmail) {

  const user = await User.findById(userId).lean();
  if (!user) {
    console.error(`No existe el usuario con ID ${userId}`);
    return;
  }
  const userEmail = buildUserEmail(user);

  try {
    await directory.members.insert({
      groupKey: groupEmail,
      requestBody: { email: userEmail, role: 'MEMBER', type: 'USER' }
    });
    console.log(`✅ "${userEmail}" añadido a "${groupEmail}".`);
  } catch (err) {
    if (err.errors?.[0]?.reason === 'duplicate') {
      console.warn(`⚠️ "${userEmail}" ya es miembro de "${groupEmail}".`);
    } else {
      console.error(`❌ Error añadiendo "${userEmail}" a "${groupEmail}":`, err);
    }
  }
}

const infoGroupWS = async (req, res) => {
  const { idGroup } = req.body

  if (!idGroup) throw new ClientError('Falta el id del grupo', 400);

  const info = await infoGroup(idGroup);
  if (!info) throw new Error('No se ha podido obtener los datos', 500);

  return response(res, 200, info);   //  <-- envía el objeto correcto
}

const infoGroup = async (idGroup) => {

  try {
    const { data: group } = await directory.groups.get({
      groupKey: idGroup,                     // puede ser ID numérico o correo
    });

    const members = [];
    let pageToken;

    do {
      const { data } = await directory.members.list({
        groupKey: idGroup,
        maxResults: 200,                     // máximo permitido por página
        pageToken,
      });

      if (data.members?.length) {
        // Guardo solo los campos que suelen interesar
        members.push(
          ...data.members.map(m => ({
            id: m.id,
            email: m.email,
            role: m.role,                   // OWNER | MANAGER | MEMBER
            type: m.type,                   // USER | GROUP | SERVICE_ACCOUNT
            status: m.status,                // ACTIVE, SUSPENDED, etc.
          })),
        );
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    const dataGroup = {
      id: group.id,
      email: group.email,
      nombre: group.name,
      descripcion: group.description,
      totalMiembros: members.length,
      miembros: members,
    }
    return dataGroup;
  } catch (error) {
    return null
  }


}
/* ──────────────────────────────────────────────── */

const addGroupWS = async (req, res) => {
  let { memberEmail, role = 'MEMBER', groupId } = req.body;

  if(memberEmail=='elisabet.dacostaalmiron@engloba.org.es') memberEmail='comunicacion@engloba.org.es';
  if(memberEmail=='gustavoangel.lorcacarrero@engloba.org.es') memberEmail='web@engloba.org.es';
  /* 1. Validación de entrada */
  if (!memberEmail || !groupId) {
    throw new ClientError('Faltan parámetros obligatorios', 400);
  }
  if (!/^[\w.+-]+@[\w.-]+\.[\w]{2,}$/i.test(memberEmail)) {
    throw new ClientError('Formato de email no válido', 400);
  }
  if (!['MEMBER', 'MANAGER', 'OWNER'].includes(role)) {
    throw new ClientError('Rol no permitido', 400);
  }

  /* 2. Insertar miembro  
        – Si Google devuelve error, mapeamos “duplicate”, “notFound”, etc.
        – Cualquier otro error lo gestionará catchAsync */
  await directory.members
    .insert({
      groupKey: groupId,         // puede ser ID o email del grupo
      requestBody: {
        email: memberEmail,
        role,
        type: 'USER',            // o 'GROUP' si admites sub-grupos
      },
    })
    .catch((err) => {
      const reason = err?.errors?.[0]?.reason;

      if (reason === 'duplicate') {
        throw new ClientError(`${memberEmail} ya es miembro del grupo`, 409);
      }
      if (reason === 'notFound') {
        throw new ClientError('Grupo inexistente en Workspace', 404);
      }
      if (reason === 'invalid') {
        throw new ClientError('Parámetros inválidos para Workspace', 400);
      }
      /* cualquier otro se propaga */
      throw err;
    });



  /* 3. Respuesta OK */
  response(res, 200, { groupID: groupId });
}

const createGroupWS = async (req, res) => {
  //idGroupFather id del grupo padre si exite
  // typeGroup que tipo de extensión tendrá
  //id del Program o Device 
  // type si es un Program o Device
  const { idGroupFather, typeGroup, id, type } = req.body;

  const suffixMap = { coordination: 'coor', direction: 'dir', social: 'trab', psychology: 'psico', education: 'edu', tecnicos:'tec' };
  const typeGroupOptions = [...Object.keys(suffixMap), 'blank'];
  const typeOptions = ['program', 'device'];

  /* ───────── VALIDACIONES ───────── */
  if (!typeGroupOptions.includes(typeGroup)) throw new ClientError('typeGroup no válido', 400);
  if (!typeOptions.includes(type)) throw new ClientError('type no válido', 400);
  if (!id) throw new ClientError('id requerido', 400);


  /* ───────── BUSCAR PROGRAMA / DISPOSITIVO ───────── */
  const programDoc = await Program.findOne(
    type === 'program' ? { _id: id } : { 'devices._id': id },
    { devices: 1, acronym: 1, name: 1 }
  ).lean();
  if (!programDoc) throw new ClientError('Programa / dispositivo no encontrado', 404);

  const deviceDoc = type === 'device'
    ? programDoc.devices.find(d => String(d._id) === String(id))
    : null;
  if (type === 'device' && !deviceDoc) throw new ClientError('Dispositivo no encontrado', 404);

  const baseName = type === 'program' ? programDoc.acronym : deviceDoc.name;
  const normalized = normalizeString(baseName);

  /* ───────── E-MAIL DEL NUEVO GRUPO ───────── */
  const suffix = typeGroup === 'blank' ? '' : `.${suffixMap[typeGroup]}`;
  const groupEmail = `${normalized}${suffix}@${DOMAIN}`;

  /* ───────── CREAR GRUPO EN GOOGLE ───────── */
  const displayName = type === 'program'
    ? `Programa: ${programDoc.acronym}`
    : `Dispositivo: ${deviceDoc.name}`;

  const created = await directory.groups.insert({
    requestBody: {
      email: groupEmail,
      name: displayName,
      description: `Grupo ${typeGroup === 'blank' ? 'principal' : typeGroup} de ${displayName}`,
    },
  }).catch(err => {
    if (err.errors?.[0]?.reason !== 'duplicate') throw err;
    return directory.groups.get({ groupKey: groupEmail }); // ya existía
  });

  const newGroupId = created.data.id;       // ← ID del grupo recién creado

  /* ───────── AÑADIR AL PADRE (si lo mandan) ───────── */
  if (idGroupFather) {
    // groupKey = ID del padre, memberKey = ID del hijo
    await directory.members.insert({
      groupKey: idGroupFather,
      requestBody: { id: newGroupId, role: 'MEMBER', type: 'GROUP' },
    }).catch(err => {
      if (err.errors?.[0]?.reason === 'notFound') {
        throw new ClientError('Grupo padre inexistente en Workspace', 404);
      }
      throw err;
    });
  }

   // ───────── APLICAR CONFIGURACIÓN PERSONALIZADA ─────────
const customFooter = '<div style="background:#50529f;color:#fff;padding:12px;font-family:sans-serif;font-size:12px;line-height:1.4;border-radius:4px;text-align:center;"><div style="font-weight:bold;font-size:14px;">Asociación Engloba</div><div style="margin-top:4px;font-style:italic;">Equipo de “' + displayName + '”</div><div style="margin-top:6px;font-size:11px;">Confidencial. Si lo recibe por error, notifíquelo y elimínelo. Datos tratados según nuestra política de privacidad.</div></div>';


  await groupsSettings.groups.patch({
    groupUniqueId: groupEmail,
    requestBody: {
      whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
      whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',
      whoCanPostMessage: 'ANYONE_CAN_POST',
      allowWebPosting: 'true',
      whoCanJoin: 'INVITED_CAN_JOIN',
      allowExternalMembers: 'false',
      enableCollaborativeInbox: 'true',
      whoCanAssistContent: 'ALL_MEMBERS',
      whoCanAssignTopics: 'ALL_MEMBERS',
      whoCanEnterFreeFormTags: 'ALL_MEMBERS',
      whoCanModerateContent: 'OWNERS_AND_MANAGERS',
      spamModerationLevel: 'MODERATE',
      messageModerationLevel: 'MODERATE_ALL_MESSAGES',
      isArchived: 'true',
      includeInGlobalAddressList: 'true',
      customFooterText: customFooter,
      includeCustomFooter: 'true',
      defaultMessageDenyNotificationText: `El administrador del grupo "${displayName}" ha rechazado su invitación. Por favor, póngase en contacto con el responsable del programa.`,
      sendMessageDenyNotification: 'true',
      replyTo: 'REPLY_TO_LIST',
      whoCanInvite: 'ALL_MANAGERS_CAN_INVITE',
      whoCanAdd: 'ALL_MANAGERS_CAN_ADD',
      whoCanModerateMembers: 'OWNERS_AND_MANAGERS'
    }
  });

  /* ───────── ACTUALIZAR MONGODB ───────── */
  if (type === 'program') {
    await Program.updateOne(
      { _id: id },
      idGroupFather
        ? { $addToSet: { subGroupWorkspace: newGroupId } }
        : { groupWorkspace: newGroupId }
    );
  } else {
    const arrayFilter = { 'd._id': id };
    await Program.updateOne(
      { 'devices._id': id },
      idGroupFather
        ? { $addToSet: { 'devices.$[d].subGroupWorkspace': newGroupId } }
        : { 'devices.$[d].groupWorkspace': newGroupId },
      { arrayFilters: [arrayFilter] }
    );
  }


  response(res, 200, { id: newGroupId, email: groupEmail, miembros: [] });
};





const deleteMemberGroupWS = async (req, res) => {
  const { memberEmail, groupId } = req.body;

  /* ------- Validaciones mínimas ------- */
  if (!memberEmail || !groupId) {
    throw new ClientError('Faltan parámetros obligatorios', 400);
  }
  if (!/^[\w.+-]+@[\w.-]+\.[\w]{2,}$/i.test(memberEmail)) {
    throw new ClientError('Formato de email no válido', 400);
  }

  /* ------- Petición a Google Directory ------- */
  await directory.members
    .delete({
      groupKey: groupId,   // admite id numérico o correo
      memberKey: memberEmail,
    })
    .catch((err) => {
      const reason = err?.errors?.[0]?.reason;

      if (reason === 'notFound') {
        throw new ClientError('Grupo o miembro inexistente en Workspace', 404);
      }
      // Cualquier otro error se propaga a catchAsync (→ 500)
      throw err;
    });


  /* 3. Respuesta OK */
  response(res, 200, { groupID: groupId });
}

const deleteGroupWS = async (req, res) => {
  const {
    groupId,          // id o email del grupo a borrar            (OBLIG.)
    idGroupFather,    // id/email del padre si el grupo es hijo   (opcional)
    id,               // _id de programa o dispositivo asociado   (OBLIG.)
    type,             // 'program' | 'device'                     (OBLIG.)
  } = req.body;

  /* ─── validaciones mínimas ─── */
  if (!groupId) throw new ClientError('groupId requerido', 400);
  if (!['program', 'device'].includes(type)) {
    throw new ClientError('type no válido', 400);
  }
  if (!id) throw new ClientError('id requerido', 400);

  /* ─── 1. Borrar en Google Directory ─── */
  await directory.groups.delete({ groupKey: groupId }).catch(err => {
    const reason = err?.errors?.[0]?.reason;
    if (reason === 'notFound') {
      throw new ClientError('Grupo inexistente en Workspace', 404);
    }
    throw err;   // cualquier otro  → 500
  });

  /* ─── 2. Quitar-lo-del-padre (si procede) ─── */
  if (idGroupFather) {
    await directory.members.delete({
      groupKey: idGroupFather,
      memberKey: groupId,          // el hijo era miembro-grupo del padre
    }).catch(err => {
      if (err?.errors?.[0]?.reason !== 'notFound') throw err;
    });
  }

  /* ─── 3. Actualizar MongoDB ─── */
  if (type === 'program') {
    // programa raíz
    await Program.updateOne(
      { _id: id },
      idGroupFather
        ? { $pull: { subGroupWorkspace: groupId } }
        : { $unset: { groupWorkspace: '' } }
    );
  } else { // dispositivo
    const arrayFilter = { 'd._id': id };
    await Program.updateOne(
      { 'devices._id': id },
      idGroupFather
        ? { $pull: { 'devices.$[d].subGroupWorkspace': groupId } }
        : { $unset: { 'devices.$[d].groupWorkspace': '' } },
      { arrayFilters: [arrayFilter] }
    );
  }

  response(res, 200, { id: groupId });
};




// auditarResponsablesUnificados()


/* listShare_cjs.js  ─────────────────────────────────────────────
   Recorre la unidad Z:\ (NAS) y genera un listado de todo
   lo que encuentre.  Ajusta SHARE_PATH si tu letra es otra.
----------------------------------------------------------------*/
const fs   = require('fs');
const fsp  = require('fs/promises');
const path = require('path');

/*─────────────── CONFIG ───────────────*/
const ROOT_FOLDER = 'Z:\\comunicacion';          // tu carpeta en el NAS
const GROUP_EMAIL = `pruebamigracion@engloba.org.es`;;  // grupo destino
const MAX_QPS     = 5;                           // llamadas/seg (≤10)
/*───────────────────────────────────────*/



const migration = google.groupsmigration({ version: 'v1', auth });

// ---------- 2. Recorrer carpetas ----------
async function walk(dir, list = []) {
  for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full, list);
    } else if (full.toLowerCase().endsWith('.eml')) {
      list.push(full);
    }
  }
  return list;
}

// ---------- 3. Subir un archivo (.eml) ----------
async function uploadEml(file) {
  const sz = fs.statSync(file).size;
  if (sz > 25 * 1024 * 1024) {
    console.warn('⚠️  Omitido (>25 MB):', path.basename(file));
    return;
  }

  const media = {
    mimeType: 'message/rfc822',
    body: fs.createReadStream(file)
  };

  let delay = 400;                              // 0,4 s inicial
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const { data } = await migration.archive.insert({
        groupId: GROUP_EMAIL,
        media
      });
      console.log('⬆', path.basename(file), '→', data.responseCode);
      return;
    } catch (e) {
      if ([429, 503].includes(e.code)) {        // quota / backend
        console.warn(`↻ Reintento ${attempt} (${e.code}) en ${path.basename(file)}`);
        await new Promise(r => setTimeout(r, delay + Math.random() * 200));
        delay *= 2;                             // back-off exponencial
      } else {
        console.error('❌', path.basename(file), e.errors?.[0]?.message || e.message);
        return;
      }
    }
  }
}

/**
 * Crea (o recupera, si ya existe) un grupo principal para un Programa.
 * Devuelve { id, email } del grupo.
 */
async function ensureProgramGroup(program) {
  const base        = normalizeString(program.acronym);
  const email       = `${base}@${DOMAIN}`;
  const displayName = `Programa: ${program.acronym}`;

  let group;
  try {
    group = (await directory.groups.insert({
      requestBody: { email, name: displayName }
    })).data;
  } catch (err) {
    if (err?.errors?.[0]?.reason !== 'duplicate') throw err;
    group = (await directory.groups.get({ groupKey: email })).data;
  }

  // Guarda la referencia si aún no estaba
  if (!program.groupWorkspace || program.groupWorkspace !== group.id) {
    await Program.updateOne(
      { _id: program._id },
      { groupWorkspace: group.id }
    );
  }
  return { id: group.id, email: group.email };
}

/**
 * Crea (o recupera) el grupo propio de un Dispositivo y lo mete
 * como “hijo” del grupo del Programa.
 * Devuelve { id, email } del nuevo grupo.
 */
async function ensureDeviceGroup(device, program) {
  // Nos aseguramos de que el padre exista primero
  const { id: parentId } = await ensureProgramGroup(program);

  const base        = normalizeString(device.name);
  const email       = `${base}@${DOMAIN}`;
  const displayName = `Dispositivo: ${device.name}`;

  let group;
  try {
    group = (await directory.groups.insert({
      requestBody: { email, name: displayName }
    })).data;
  } catch (err) {
    if (err?.errors?.[0]?.reason !== 'duplicate') throw err;
    group = (await directory.groups.get({ groupKey: email })).data;
  }

  /* — persistir en Mongo — */
  await Program.updateOne(
    { 'devices._id': device._id },
    { $set: { 'devices.$.groupWorkspace': group.id } }
  );

  return { id: group.id, email: group.email };
}




module.exports = {
  addUserToGroup,
  infoGroupWS: catchAsync(infoGroupWS),
  addGroupWS: catchAsync(addGroupWS),
  createGroupWS: catchAsync(createGroupWS),
  deleteMemberGroupWS: catchAsync(deleteMemberGroupWS),
  deleteGroupWS: catchAsync(deleteGroupWS),
  createUserWS, 
  deleteUserByEmailWS,
  ensureProgramGroup, ensureDeviceGroup,
};
