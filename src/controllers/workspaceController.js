
const { google } = require('googleapis');
const { User, Program, Provinces } = require('../models/indexModels');
const mongoose = require('mongoose');
const { catchAsync } = require('../utils/catchAsync');
const { response } = require('../utils/response');
const { error } = require('pdf-lib');
const { ClientError } = require('../utils/clientError');

// 1. Decodificamos las credenciales
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);

const commonSettings = {
  // 1) Permitir miembros externos
  allowExternalMembers: 'false',                   // entry/apps:allowExternalMembers :contentReference[oaicite:0]{index=0}

  // 2) Control de acceso
  whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',   // entry/apps:whoCanViewGroup :contentReference[oaicite:1]{index=1}
  whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',   // entry/apps:whoCanViewMembership :contentReference[oaicite:2]{index=2}
  whoCanJoin: 'CAN_REQUEST_TO_JOIN',    // entry/apps:whoCanJoin :contentReference[oaicite:3]{index=3}

  // 3) Publicación
  whoCanPostMessage: 'ANYONE_CAN_POST',        // entry/apps:whoCanPostMessage :contentReference[oaicite:4]{index=4}
  allowWebPosting: 'true',                   // entry/apps:allowWebPosting :contentReference[oaicite:5]{index=5}

  // 4) Historial (archivo, pero no readonly)
  archiveOnly: 'false',                  // entry/apps:archiveOnly :contentReference[oaicite:6]{index=6}
  isArchived: 'true',                   // entry/apps:isArchived :contentReference[oaicite:7]{index=7}

  // 5) Moderación de contenido
  messageModerationLevel: 'MODERATE_NONE',   // entry/apps:messageModerationLevel :contentReference[oaicite:8]{index=8}
  spamModerationLevel: 'SILENTLY_MODERATE',      // entry/apps:spamModerationLevel :contentReference[oaicite:9]{index=9}

  // 6) Moderación de miembros
  whoCanModerateMembers: 'ALL_MEMBERS',            // entry/apps:whoCanModerateMembers :contentReference[oaicite:10]{index=10}

  // 7) Buzón colaborativo y etiquetas
  enableCollaborativeInbox: 'true',                   // entry/apps:enableCollaborativeInbox :contentReference[oaicite:11]{index=11}
  whoCanEnterFreeFormTags: 'ALL_MEMBERS',            // entry/apps:whoCanEnterFreeFormTags :contentReference[oaicite:12]{index=12}
  whoCanModifyTagsAndCategories: 'ALL_MEMBERS',            // entry/apps:whoCanModifyTagsAndCategories :contentReference[oaicite:13]{index=13}

  // 8) Publicar “como grupo” y respuestas
  membersCanPostAsTheGroup: 'true',                   // entry/apps:membersCanPostAsTheGroup :contentReference[oaicite:14]{index=14}
  replyTo: 'REPLY_TO_IGNORE',          // entry/apps:replyTo :contentReference[oaicite:15]{index=15}
  defaultSender: 'GROUP'                   // (UI: Remitente predeterminado)
};

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
const groupsSettings = google.groupssettings({ version: 'v1', auth });
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
  if (!user) return ''
  const first = (user.firstName || '').trim().toLowerCase();
  const last = (user.lastName || '').trim().toLowerCase();
  const normalizedFirst = first
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const normalizedLast = last
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  return `${normalizedFirst}.${normalizedLast}@${DOMAIN}`;

}



//------------------USUARIOS---------------------
const createUserWS = async (userId, contador = 0) => {

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
    return { email, deleted: false };
  });

  return { email, deleted: true };
};


//------------GRUPOS--------------------------

async function addUserToGroup(userId, groupEmail) {

  const user = await User.findById(userId).lean();
  if (!user) {
    console.error(`No existe el usuario con ID ${userId}`);
    return;
  }

  if (!!user.email) {
    const userEmail = user.email;

    try {
      await directory.members.insert({
        groupKey: groupEmail,
        requestBody: { email: userEmail, role: 'MEMBER', type: 'USER' }
      });
    } catch (err) {
      if (err.errors?.[0]?.reason === 'duplicate') {
        console.warn(`⚠️ "${userEmail}" ya es miembro de "${groupEmail}".`);
      } else {
        console.error(`❌ Error añadiendo "${userEmail}" a "${groupEmail}":`, err);
      }
    }
  }

}

const EXCLUDED_GROUP = 'englobaasociacion@engloba.org.es';

const deleteMemeberAllGroups = async (email) => {
  if (!email || typeof email !== 'string') {
    throw new ClientError('Email requerido y debe ser válido', 400);
  }

  const excluded = EXCLUDED_GROUP.toLowerCase();
  const removed = [];
  let pageToken;

  do {
    const { data } = await directory.groups.list({
      userKey: email,         // grupos donde el usuario es miembro
      maxResults: 200,
      pageToken
    });

    const groups = data.groups || [];
    for (const g of groups) {
      // Saltar el grupo protegido
      if (g.email && g.email.toLowerCase() === excluded) continue;

      try {
        await directory.members.delete({
          groupKey: g.id,      // puedes usar g.email también
          memberKey: email
        });
        removed.push({ id: g.id, email: g.email });
      } catch (err) {
        const reason = err?.errors?.[0]?.reason;
        // Si el grupo/miembro ya no existe, lo ignoramos
        if (reason !== 'notFound') {
          console.warn(`No se pudo eliminar de ${g.email}:`, reason || err.message);
        }
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return {
    email,
    removedCount: removed.length,
    removedGroups: removed
  };
};

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

  const suffixMap = { coordination: 'coor', direction: 'dir', social: 'trab', psychology: 'psico', education: 'edu', tecnicos: 'tec' };
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



  await groupsSettings.groups.patch({
    groupUniqueId: groupEmail,
    requestBody: commonSettings
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

/**
 * Crea (o recupera, si ya existe) un grupo principal para un Programa.
 * Devuelve { id, email } del grupo.
 */
async function ensureProgramGroup(program) {
  const base = normalizeString(program.acronym);
  const email = `${base}@${DOMAIN}`;
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

  const base = normalizeString(device.name);
  const email = `${base}@${DOMAIN}`;
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


async function patchWithBackoff(groupEmail, requestBody) {
  let delay = 400;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await groupsSettings.groups.patch({
        groupUniqueId: groupEmail,
        requestBody
      });
      return;
    } catch (err) {
      const apiErr = err?.errors?.[0] || {};
      const retryable =
        ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'].includes(apiErr.reason) ||
        [429, 503].includes(err.code);
      if (!retryable) {
        console.error(`❌ Error no recuperable en ${groupEmail}:`, apiErr.message || err.message);
        return;
      }
      console.warn(`↻ Reintento ${attempt} en ${groupEmail} (${apiErr.reason || err.code})`);
      await new Promise(r => setTimeout(r, delay + Math.random() * 200));
      delay *= 2;
    }
  }
  console.error(`❌ Agotados reintentos en ${groupEmail}`);
}

/**
 * Recorre todos los grupos del dominio y les aplica el mismo conjunto de ajustes.
 */
async function updateAllGroupsSettings() {
  // const groups = await listAllGroups();
  // console.log(`🔍 Encontrados ${groups.length} grupos.`);

  // for (const g of groups) {
  //   await patchWithBackoff(g.email, commonSettings);
  // }
  await patchWithBackoff('cvvgjaen@engloba.org.es', commonSettings);
}

//updateAllGroupsSettings()
// // // // Ejecuta la tarea:
// updateAllGroupsSettings().catch(console.error);

// añadir usuario a grupo con email de usuario y id de grupo



module.exports = {
  addUserToGroup,
  deleteMemeberAllGroups,
  infoGroupWS: catchAsync(infoGroupWS),
  addGroupWS: catchAsync(addGroupWS),
  createGroupWS: catchAsync(createGroupWS),
  deleteMemberGroupWS: catchAsync(deleteMemberGroupWS),
  deleteGroupWS: catchAsync(deleteGroupWS),
  createUserWS,
  deleteUserByEmailWS,
  ensureProgramGroup, ensureDeviceGroup,
};
