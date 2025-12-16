
const { google } = require('googleapis');
const { User, Program, Provinces, Dispositive } = require('../models/indexModels');
const mongoose = require('mongoose');
const { catchAsync } = require('../utils/catchAsync');
const { response } = require('../utils/response');
const { error } = require('pdf-lib');
const { ClientError } = require('../utils/clientError');
// arriba del archivo (ajusta rutas)
const { generateEmailHTML, sendEmail } = require('./emailControllerGoogle'); 

// 1. Decodificamos las credenciales
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);

// const commonSettings = {
//   // 1) Permitir miembros externos
//   allowExternalMembers: 'false',                   // entry/apps:allowExternalMembers :contentReference[oaicite:0]{index=0}

//   // 2) Control de acceso
//   whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',   // entry/apps:whoCanViewGroup :contentReference[oaicite:1]{index=1}
//   whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',   // entry/apps:whoCanViewMembership :contentReference[oaicite:2]{index=2}
//   whoCanJoin: 'CAN_REQUEST_TO_JOIN',    // entry/apps:whoCanJoin :contentReference[oaicite:3]{index=3}

//   // 3) Publicación
//   whoCanPostMessage: 'ANYONE_CAN_POST',        // entry/apps:whoCanPostMessage :contentReference[oaicite:4]{index=4}
//   allowWebPosting: 'true',                   // entry/apps:allowWebPosting :contentReference[oaicite:5]{index=5}

//   // 4) Historial (archivo, pero no readonly)
//   archiveOnly: 'false',                  // entry/apps:archiveOnly :contentReference[oaicite:6]{index=6}
//   isArchived: 'true',                   // entry/apps:isArchived :contentReference[oaicite:7]{index=7}

//   // 5) Moderación de contenido
//   messageModerationLevel: 'MODERATE_NONE',   // entry/apps:messageModerationLevel :contentReference[oaicite:8]{index=8}
//   spamModerationLevel: 'SILENTLY_MODERATE',      // entry/apps:spamModerationLevel :contentReference[oaicite:9]{index=9}

//   // 6) Moderación de miembros
//   whoCanModerateMembers: 'ALL_MEMBERS',            // entry/apps:whoCanModerateMembers :contentReference[oaicite:10]{index=10}

//   // 7) Buzón colaborativo y etiquetas
//   enableCollaborativeInbox: 'true',                   // entry/apps:enableCollaborativeInbox :contentReference[oaicite:11]{index=11}
//   whoCanEnterFreeFormTags: 'ALL_MEMBERS',            // entry/apps:whoCanEnterFreeFormTags :contentReference[oaicite:12]{index=12}
//   whoCanModifyTagsAndCategories: 'ALL_MEMBERS',            // entry/apps:whoCanModifyTagsAndCategories :contentReference[oaicite:13]{index=13}

//   // 8) Publicar “como grupo” y respuestas
//   membersCanPostAsTheGroup: 'true',                   // entry/apps:membersCanPostAsTheGroup :contentReference[oaicite:14]{index=14}
//   replyTo: 'REPLY_TO_IGNORE',          // entry/apps:replyTo :contentReference[oaicite:15]{index=15}
//   defaultSender: 'GROUP'                   // (UI: Remitente predeterminado)
// };

const commonSettings = {
  // Idioma
  primaryLanguage: 'es',

  // Acceso y visibilidad
  allowExternalMembers: 'false',
  whoCanJoin: 'CAN_REQUEST_TO_JOIN',
  whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW',
  whoCanViewMembership: 'ALL_MEMBERS_CAN_VIEW',

  // Publicación
  whoCanPostMessage: 'ANYONE_CAN_POST',
  allowWebPosting: 'true',
  messageModerationLevel: 'MODERATE_NONE',
  spamModerationLevel: 'SILENTLY_MODERATE',

  // Bandeja colaborativa + etiquetas
  enableCollaborativeInbox: 'true',
  whoCanEnterFreeFormTags: 'ALL_MEMBERS',
  whoCanModifyTagsAndCategories: 'ALL_MEMBERS',

  // Enviar como el grupo y responder al grupo
  membersCanPostAsTheGroup: 'true',
  replyTo: 'REPLY_TO_LIST',

  // Añadir/invitar miembros (lo más amplio que permite la API)
  whoCanInvite: 'ALL_MANAGERS_CAN_INVITE',
  whoCanAdd: 'ALL_MANAGERS_CAN_ADD',

  // Archivo
  isArchived: 'true',
  archiveOnly: 'false',

  replyTo: 'REPLY_TO_IGNORE'
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
// Mapas compartidos para grupos de Workspace
const groupSuffixMap = {
  coordination: "coor",
  direction: "dir",
  social: "trab",
  psychology: "psico",
  education: "edu",
  tecnicos: "tec",
};

const groupNamePrefixMap = {
  direction: "Dirección de",
  social: "Equipo trabajadores sociales",
  tecnicos: "Equipo Técnico",
  psychology: "Equipo de Psicólogos",
  education: "Equipo de Educadores",
  coordination: "Equipo de Coordinadores",
  blank: "Subgrupo de",
};

const groupTypeGroupOptions = [...Object.keys(groupSuffixMap), "blank"];
const groupTypeOptions = ["program", "device"];

// Inverso para ir de ".edu" → "education", ".tec" → "tecnicos", etc.
const suffixToTypeGroup = Object.fromEntries(
  Object.entries(groupSuffixMap).map(([type, suf]) => [suf, type])
);

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
      name: data.name,
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
  const { idGroup, idProgram, idDevice } = req.body
  let idGroupWorkSpace = null
  if (!!idDevice && !!idProgram) {
    const doc = await Program.findOne(
      { _id: idProgram, 'devices._id': idDevice },
      { 'devices.$': 1, _id: 0 }
    )
    console.log(doc)
    idGroupWorkSpace = doc.devices[0].groupWorkspace
  } else if (!!idProgram) {
    const programInfo = await Program.findById(idProgram).select('groupWorkspace');
    idGroupWorkSpace = programInfo.groupWorkspace
  } else if (!!idGroup) {
    idGroupWorkSpace = idGroup
  } else {
    throw new ClientError('Faltan datos para obtener los grupos de Workspace', 400);
  }

  const info = await infoGroup(idGroupWorkSpace);

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
      aliases: group.aliases || [],   
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

async function notifyWorkspaceGroupCreated({
  type,          // 'program'|'device'
  typeGroup,     // 'blank'|'direction'|...
  idGroupFather, // id padre o null
  baseLabel,     // nombre humano (program acronym/name o device name)
  groupEmail,
}) {
  const isSubgroup = !!idGroupFather;
  const kindText = isSubgroup ? `Subgrupo (${typeGroup})` : 'Grupo principal';

  const asunto = `Workspace: creado ${kindText} para ${type === 'program' ? 'programa' : 'dispositivo'}`;

  const textoPlano = [
    `Nombre del  ${type === 'program' ? 'programa' : 'dispositivo'}: ${baseLabel || '—'}`,
    `Grupo creado: ${groupEmail || '—'}`,
    `Tipo de grupo: ${isSubgroup ? 'Subgrupo' : 'Principal'}`,
    '',
    'No te olvides de configurar el grupo en Workspace.',
  ].filter(Boolean).join('\n');

  const htmlContent = generateEmailHTML({
    logoUrl: "https://app.engloba.org.es/graphic/logotipo_blanco.png",
    title: "Creación de grupo de Workspace",
    greetingName: "Persona maravillosa",
    bodyText: "Se ha creado un grupo en Google Workspace asociado a un modelo.",
    highlightText: textoPlano,
    footerText: "Gracias por usar nuestra plataforma. Si tienes dudas, contáctanos.",
  });

  await sendEmail(
    ["comunicacion@engloba.org.es", "web@engloba.org.es"],
    asunto,
    textoPlano,
    htmlContent
  );
}


async function createGroupWSCore({ idGroupFather, typeGroup, id, type, baseLocalOverride  }) {
  /* ───────── VALIDACIONES ───────── */
  if (!groupTypeGroupOptions.includes(typeGroup)) {
    throw new ClientError("typeGroup no válido", 400);
  }
  if (!groupTypeOptions.includes(type)) {
    throw new ClientError("type no válido", 400);
  }
  if (!id) {
    throw new ClientError("id requerido", 400);
  }

  // Evitar crear subgrupos con "blank" (duplicaría el grupo principal)
  if (idGroupFather && typeGroup === "blank") {
    throw new ClientError(
      'El tipo "blank" solo se puede usar para el grupo principal (sin padre).',
      400
    );
  }

  /* ───────── BUSCAR PROGRAMA / DISPOSITIVO ───────── */
  let programDoc = null;
  let deviceDoc = null;

  if (type === "program") {
    programDoc = await Program.findById(id)
      .select("name acronym groupWorkspace subGroupWorkspace")
      .lean();
    if (!programDoc) {
      throw new ClientError("Programa no encontrado", 404);
    }
  } else {
    deviceDoc = await Dispositive.findById(id)
      .select("name email groupWorkspace subGroupWorkspace")
      .lean();
    if (!deviceDoc) {
      throw new ClientError("Dispositivo no encontrado", 404);
    }
  }

  const baseLabel =
    type === "program"
      ? programDoc.acronym || programDoc.name
      : deviceDoc.name;

  const normalized = baseLocalOverride || normalizeString(baseLabel);

  const suffix = typeGroup === "blank" ? "" : `.${groupSuffixMap[typeGroup] || ""}`;
  const groupEmail = `${normalized}${suffix}@${DOMAIN}`;

  /* ───────── NOMBRE DEL GRUPO ───────── */
  let displayName;

  if (!idGroupFather && typeGroup === "blank") {
    // Grupo principal
    displayName =
      type === "program"
        ? `Programa: ${baseLabel}`
        : `Dispositivo: ${baseLabel}`;
  } else {
    const prefix = groupNamePrefixMap[typeGroup] || groupNamePrefixMap.blank;
    displayName = `${prefix}: ${baseLabel}`;
  }

  const description =
    typeGroup === "blank" && !idGroupFather
      ? `Grupo principal de ${baseLabel}`
      : `Grupo ${typeGroup} de ${baseLabel}`;

  /* ───────── CREAR / RECUPERAR GRUPO EN GOOGLE ───────── */
    /* ───────── CREAR / RECUPERAR GRUPO EN GOOGLE ───────── */
  let createdNew = true;

  const created = await directory.groups
    .insert({
      requestBody: {
        email: groupEmail,
        name: displayName,
        description,
      },
    })
    .catch((err) => {
      const reason = err?.errors?.[0]?.reason;
      if (reason === "duplicate" || err.code === 409) {
        createdNew = false; // <-- IMPORTANTE: no es creación nueva
        return directory.groups.get({ groupKey: groupEmail });
      }
      throw err;
    });



  const groupData = created.data || created; // por si viene en .data
  const newGroupId = groupData.id;
  const finalEmail = groupData.email || groupEmail;

  if (!newGroupId) {
    throw new ClientError(
      "No se ha podido crear ni recuperar el grupo de Workspace",
      500
    );
  }

  /* ───────── AÑADIR AL PADRE (si lo mandan) ───────── */
if (idGroupFather) {
  await directory.members
    .insert({
      groupKey: idGroupFather,
      requestBody: { id: newGroupId, role: "MEMBER", type: "GROUP" },
    })
    .catch((err) => {
      const reason = err?.errors?.[0]?.reason;
      if (reason === "duplicate" || err.code === 409) {
        console.warn(`⚠️ Subgrupo ya era miembro del padre: ${newGroupId} -> ${idGroupFather}`);
        return; // <-- clave: no romper
      }
      if (reason === "notFound") {
        throw new ClientError("Grupo padre inexistente en Workspace", 404);
      }
      throw err;
    });
}


  /* ───────── CONFIGURAR AJUSTES DEL GRUPO ───────── */
  try {
    await patchWithBackoff(finalEmail, commonSettings);
  } catch (e) {
    // No queremos romper por fallo de settings
    console.warn("No se pudieron aplicar los ajustes al grupo:", finalEmail);
  }

  /* ───────── ACTUALIZAR MONGODB ───────── */
  if (type === "program") {
    if (idGroupFather) {
      await Program.updateOne(
        { _id: id },
        { $addToSet: { subGroupWorkspace: newGroupId } }
      );
    } else {
      await Program.updateOne(
        { _id: id },
        { $set: { groupWorkspace: newGroupId, email: finalEmail } }
      );
    }
  } else {
    // type === 'device'
    if (idGroupFather) {
      await Dispositive.updateOne(
        { _id: id },
        { $addToSet: { subGroupWorkspace: newGroupId } }
      );
    } else {
      await Dispositive.updateOne(
        { _id: id },
        {
          $set: {
            groupWorkspace: newGroupId,
            email: finalEmail,
          },
        }
      );
    }
  }

    // Email informativo NO crítico: solo si el grupo se creó de verdad
  if (createdNew) {
    void notifyWorkspaceGroupCreated({
      type,
      typeGroup,
      idGroupFather: idGroupFather || null,
      baseLabel,
      groupEmail: finalEmail,
    }).catch((err) => {
      console.warn("⚠️ notifyWorkspaceGroupCreated falló:", err?.message || err);
    });
  }


  return {
    group: {
      id: newGroupId,
      email: finalEmail,
      nombre: groupData.name || displayName,
      descripcion: groupData.description || description,
      totalMiembros: 0,
      miembros: [],
    },
  };
}

const createGroupWS = async (req, res) => {
  const result = await createGroupWSCore(req.body);
  response(res, 200, result);
};

async function ensureWorkspaceGroupsForModel({
  type,                 // 'program' | 'device'
  id,                   // _id mongo
  requiredSubgroups = [] // ['direction','social','tecnicos','education','psychology','coordination',...]
}) {
  if (!['program', 'device'].includes(type)) {
    throw new ClientError('type inválido', 400);
  }
  if (!id) throw new ClientError('id requerido', 400);

  // 1) Intentar sacar baseLocal real desde el grupo actual (si existe)
  let baseLocalOverride = null;

  const modelDoc = type === 'program'
    ? await Program.findById(id).select('groupWorkspace email acronym name').lean()
    : await Dispositive.findById(id).select('groupWorkspace email name').lean();

  if (modelDoc?.groupWorkspace) {
    const g = await safeGetGroup(modelDoc.groupWorkspace, `ensure.main.${type}.${id}`);
    if (g?.email) baseLocalOverride = getLocalPart(g.email);
  }

  // fallback: si Mongo tiene email pero el id está roto
  if (!baseLocalOverride && modelDoc?.email) {
    baseLocalOverride = getLocalPart(modelDoc.email);
  }

  // 2) Asegurar grupo principal (blank)
  const mainResult = await createGroupWSCore({
    type,
    id,
    typeGroup: 'blank',
    idGroupFather: null,
    baseLocalOverride,
  });

  const mainId = mainResult.group.id;
  const mainEmail = mainResult.group.email;

  // baseLocal definitivo para que los subgrupos usen EXACTAMENTE la misma base
  const finalBaseLocal = getLocalPart(mainEmail);

  // 3) Asegurar subgrupos requeridos
  for (const tg of requiredSubgroups) {
    await createGroupWSCore({
      type,
      id,
      typeGroup: tg,
      idGroupFather: mainId,
      baseLocalOverride: finalBaseLocal,
    });
  }

  return { mainId, mainEmail };
}


/**
 * Mueve la pertenencia de un usuario entre dispositivos en Workspace:
 *  - respeta si solo estaba en .edu, .tec, etc.
 *  - si falta el subgrupo en el nuevo dispositivo, lo crea con createGroupWSCore
 *  - no rompe nada en Mongo (solo Workspace)
 */

async function ensureSubgroupByParentEmail({ parentGroupId, typeGroup, id, type }) {
  const parent = await safeGetGroup(parentGroupId, 'ensureSubgroupByParentEmail.parentGroupId');
  if (!parent?.email) {
    throw new ClientError(`Grupo padre inexistente en Workspace: ${parentGroupId}`, 404);
  }

  const parentLocal = getLocalPart(parent.email); // base REAL

  const result = await createGroupWSCore({
    idGroupFather: parentGroupId,
    typeGroup,
    id,         // id del dispositivo destino (o programa)
    type,       // 'device' o 'program'
    baseLocalOverride: parentLocal,
  });

  return { id: result.group.id, email: result.group.email };
}


async function safeGetGroup(groupKey, ctx = '') {
  if (!groupKey) return null;
  try {
    const { data } = await directory.groups.get({ groupKey });
    return data;
  } catch (err) {
    const reason = err?.errors?.[0]?.reason;
    if (err?.code === 404 || reason === 'notFound') {
      console.warn(`[safeGetGroup] NOT FOUND`, { ctx, groupKey, reason, code: err?.code, msg: err?.message });
      return null;
    }
    throw err;
  }
}

function getLocalPart(email) {
  return (email?.split('@')[0] || '').toLowerCase();
}

// ya la tienes, pero por claridad:
function classifyByEmail(groupEmail) {
  const local = getLocalPart(groupEmail);
  if (!local) return { isMain: true, suffix: '', typeGroup: null };

  const parts = local.split('.');
  const last = parts[parts.length - 1];      // "dir", "tec", etc.
  const typeGroup = suffixToTypeGroup[last]; // "direction", "tecnicos", ...

  if (typeGroup) return { isMain: false, suffix: last, typeGroup };
  return { isMain: true, suffix: '', typeGroup: null };
}


function uniqById(list) {
  const seen = new Set();
  return list.filter(g => {
    if (!g?.id) return false;
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

async function moveUserBetweenDevicesWS({ email, originDispositiveId, targetDispositiveId }) {
  if (!email || !originDispositiveId || !targetDispositiveId) return;

  const [origin, target] = await Promise.all([
    Dispositive.findById(originDispositiveId).select('name groupWorkspace subGroupWorkspace').lean(),
    Dispositive.findById(targetDispositiveId).select('name groupWorkspace subGroupWorkspace').lean(),
  ]);

  if (!origin?.groupWorkspace) return;
  if (!target?.groupWorkspace) throw new ClientError('El dispositivo destino no tiene groupWorkspace configurado', 400);

  // 1) grupos del usuario
  const userGroups = [];
  let pageToken;
  do {
    const { data } = await directory.groups.list({ userKey: email, maxResults: 200, pageToken });
    userGroups.push(...(data.groups || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  if (!userGroups.length) return;

  // 2) base real del ORIGEN por email del grupo principal
  const originMain = await safeGetGroup(origin.groupWorkspace, 'move.origin.groupWorkspace');
  const originBaseLocal = getLocalPart(originMain?.email) || normalizeString(origin.name);
  if (!originBaseLocal) return;

  // A) por email-base (robusto)
  const originByEmail = userGroups.filter(g => {
    const local = getLocalPart(g.email);
    return local === originBaseLocal || local.startsWith(`${originBaseLocal}.`);
  });

  // B) por IDs Mongo (útil si originBaseLocal no pillara algo raro)
  const originIds = new Set([origin.groupWorkspace, ...(origin.subGroupWorkspace || [])].filter(Boolean));
  const originByIds = userGroups.filter(g => originIds.has(g.id));

  // UNION
  let originGroups = uniqById([...originByEmail, ...originByIds])
    .map(g => ({ ...g, ...classifyByEmail(g.email) }));

  if (!originGroups.length) return;

// 3) Si hay subgrupos, antes descartabas el principal siempre.
//    Pero si el usuario estaba EN el principal, también hay que moverlo.
const originMainWasMember = originGroups.some(
  g => g.isMain && String(g.id) === String(origin.groupWorkspace)
);

// mueve: subgrupos siempre, y principal solo si estaba
const groupsToMove = originGroups.filter(g => !g.isMain || originMainWasMember);
  // 4) mapa de subgrupos destino por sufijo (si Mongo tiene IDs muertos, safeGetGroup devuelve null y se ignora)
  const targetSubMap = {};
  for (const gid of (target.subGroupWorkspace || []).filter(Boolean)) {
    const g = await safeGetGroup(gid, 'move.target.subGroupWorkspace');
    if (!g?.email) continue;
    const c = classifyByEmail(g.email);
    if (!c.isMain) targetSubMap[c.suffix] = g.id;
  }

  // 5) mover
  for (const og of groupsToMove) {
    let targetGroupKey;

    if (og.isMain) {
      targetGroupKey = target.groupWorkspace;
    } else {
      targetGroupKey = targetSubMap[og.suffix];

      if (!targetGroupKey) {
        const ensured = await ensureSubgroupByParentEmail({
          parentGroupId: target.groupWorkspace,
          typeGroup: og.typeGroup,    // social/direction/...
          id: targetDispositiveId,    // <- para que createGroupWSCore actualice Dispositive.subGroupWorkspace
          type: 'device',
        });
        targetGroupKey = ensured.id;
        targetSubMap[og.suffix] = ensured.id; // cache
      }
    }

    // añadir (duplicate OK)
    try {
      await directory.members.insert({
        groupKey: targetGroupKey,
        requestBody: { email, role: 'MEMBER', type: 'USER' },
      });
    } catch (err) {
      const reason = err?.errors?.[0]?.reason;
      if (!(reason === 'duplicate' || err.code === 409)) throw err;
    }

    // quitar (notFound OK)
    try {
      await directory.members.delete({ groupKey: og.id, memberKey: email });
    } catch (err) {
      const reason = err?.errors?.[0]?.reason;
      if (!(reason === 'notFound' || err.code === 404)) throw err;
    }
  }
}


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

const deleteDeviceGroupsWS=async(dispositive)=>{
  if (!dispositive) return;

  const mainGroupId = dispositive.groupWorkspace;
  const subGroups = Array.isArray(dispositive.subGroupWorkspace)
    ? dispositive.subGroupWorkspace
    : [];

  // 1) Borrar subgrupos primero
  for (const sgId of subGroups) {
    if (!sgId) continue;

    try {
      await directory.groups.delete({ groupKey: sgId });
    } catch (err) {
      const reason = err?.errors?.[0]?.reason;
      if (reason !== 'notFound') {
        console.warn(
          `⚠️ No se pudo borrar el subgrupo de dispositivo ${sgId}:`,
          reason || err.message
        );
      }
    }
  }

  // 2) Borrar grupo principal
  if (mainGroupId) {
    try {
      await directory.groups.delete({ groupKey: mainGroupId });
    } catch (err) {
      const reason = err?.errors?.[0]?.reason;
      if (reason !== 'notFound') {
        console.warn(
          `⚠️ No se pudo borrar el grupo principal de dispositivo ${mainGroupId}:`,
          reason || err.message
        );
      }
    }
  }
}


const deleteGroupWS = async (req, res) => {
  console.log("🧨 deleteGroupWS :: body recibido →", req.body);

  const {
    groupId,       // id o email del grupo a borrar            (OBLIG.)
    idGroupFather, // id/email del padre si el grupo es hijo   (opcional)
    id,            // _id de programa o dispositivo asociado   (OBLIG.)
    type,          // 'program' | 'device'                     (OBLIG.)
  } = req.body;

  try {
    console.log("🔎 deleteGroupWS :: parámetros normalizados", {
      groupId,
      idGroupFather,
      id,
      type,
    });

    /* ─── VALIDACIONES ─── */
    if (!groupId) {
      console.error("❌ deleteGroupWS :: falta groupId");
      throw new ClientError("groupId requerido", 400);
    }
    if (!["program", "device"].includes(type)) {
      console.error("❌ deleteGroupWS :: type no válido →", type);
      throw new ClientError("type no válido", 400);
    }
    if (!id) {
      console.error("❌ deleteGroupWS :: falta id");
      throw new ClientError("id requerido", 400);
    }

    await directory.groups
      .delete({ groupKey: groupId })
      .then(() => {
        console.log("✅ deleteGroupWS :: grupo borrado (o intento) en Directory", groupId);
      })
      .catch((err) => {
        const reason = err?.errors?.[0]?.reason;
        console.error(
          "⚠️ deleteGroupWS :: error al borrar grupo en Directory",
          { groupId, reason, code: err.code, msg: err.message }
        );

        // 👉 Si ya no existe (404) seguimos igualmente para limpiar Mongo
        if (reason === "notFound" || err.code === 404) {
          console.warn(
            `⚠️ deleteGroupWS :: grupo ${groupId} no existe en Workspace, se procede a limpiar Mongo igualmente.`
          );
          return;
        }

        throw err; // cualquier otro → sube al try/catch externo
      });

    /* ─── 3. Actualizar MongoDB ─── */
    if (type === "program") {
      if (idGroupFather) {
        
        await Program.updateOne(
          { _id: id },
          { $pull: { subGroupWorkspace: groupId } }
        );
      } else {
        
        await Program.updateOne(
          { _id: id },
          { $unset: { groupWorkspace: "" } }
        );
      }
    } else {
      // type === 'device'
      if (idGroupFather) {
        await Dispositive.updateOne(
          { _id: id },
          { $pull: { subGroupWorkspace: groupId } }
        );
      } else {
               await Dispositive.updateOne(
          { _id: id },
          {
            $unset: {
              groupWorkspace: "",
              email: "",
            },
          }
        );
      }
    }

    response(res, 200, { id: groupId });
  } catch (err) {
    console.error("💥 deleteGroupWS :: ERROR atrapado en try/catch externo", {
      message: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack,
    });
    throw err; // que lo recoja tu catchAsync/middleware
  }
};




// ===================== ensureDeviceGroup =====================




async function patchWithBackoff(groupEmail, requestBody) {
  let delay = 400;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await groupsSettings.groups.patch({
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

const getModelWorkspaceGroups = async (req, res) => {
  const { type, id } = req.body;

  if (!type || !id) {
    throw new ClientError('Faltan parámetros: type o id', 400);
  }
  if (!['program', 'device'].includes(type)) {
    throw new ClientError('type debe ser "program" o "device"', 400);
  }

  let mainGroup = null;
  let subGroups = [];

  if (type === 'program') {
    const program = await Program.findById(id)
      .select('groupWorkspace subGroupWorkspace')
      .lean();

    if (!program) throw new ClientError('Programa no encontrado', 404);

    mainGroup = program.groupWorkspace || null;
    subGroups = Array.isArray(program.subGroupWorkspace)
      ? program.subGroupWorkspace
      : [];
  } else {
    const dispositive = await Dispositive.findById(id)
      .select('groupWorkspace subGroupWorkspace')
      .lean();

    if (!dispositive) throw new ClientError('Dispositivo no encontrado', 404);

    mainGroup = dispositive.groupWorkspace || null;
    subGroups = Array.isArray(dispositive.subGroupWorkspace)
      ? dispositive.subGroupWorkspace
      : [];
  }

  const groupIds = [mainGroup, ...subGroups].filter(Boolean);

  if (!groupIds.length) {
    return response(res, 200, []); // sin grupos configurados
  }

  const result = [];
  for (const groupId of groupIds) {
    const info = await infoGroup(groupId);
    if (info) {
      result.push(info);
    }
  }

  return response(res, 200, result);
};


/**
 * Recorre todos los grupos del dominio y les aplica el mismo conjunto de ajustes.
 */
async function updateAllGroupsSettings() {
  // const groups = await listAllGroups();
  // console.log(`🔍 Encontrados ${groups.length} grupos.`);

  const groups = ['coilspaulofreire.tec@engloba.org.es']
  for (const g of groups) {
    await patchWithBackoff(g, commonSettings);
  }

  //await patchWithBackoff('juridico.migraciones@engloba.org.es', commonSettings);
}


// updateAllGroupsSettings()
// // // // Ejecuta la tarea:
// updateAllGroupsSettings().catch(console.error);

// añadir usuario a grupo con email de usuario y id de grupo

// const prueba=async(groupKey) =>{
//   if (!groupKey) throw new Error('Falta groupKey (email o id del grupo)');

//   await patchWithBackoff(groupKey, commonSettings);

//   // Verificación rápida
//   const { data } = await groupsSettings.groups.get({ groupUniqueId: groupKey });
//   console.log('✅ Ajustes aplicados a', groupKey, {
//     primaryLanguage: data.primaryLanguage,
//     enableCollaborativeInbox: data.enableCollaborativeInbox,
//     membersCanPostAsTheGroup: data.membersCanPostAsTheGroup,
//     whoCanAdd: data.whoCanAdd,
//     whoCanModerateContent: data.whoCanModerateContent,
//     whoCanPostMessage: data.whoCanPostMessage,
//   });
// }
//  prueba('pimenoresalameda.edu@engloba.org.es')


// ===================== SINCRONIZAR TODOS LOS DISPOSITIVOS CON WORKSPACE =====================

/**
 * Recorre todos los dispositivos y, para cada uno, intenta:
 *  - Localizar su grupo principal en Workspace a partir de su nombre.
 *  - Actualizar en Mongo:
 *      - email              -> email del grupo principal
 *      - groupWorkspace     -> id del grupo principal
 *      - subGroupWorkspace  -> ids de los subgrupos (miembros de tipo GROUP)
 *
 * Si algo falla con un dispositivo, se registra el error y se pasa al siguiente.
 */


module.exports = {
  addUserToGroup,
  deleteMemeberAllGroups,
  infoGroupWS: catchAsync(infoGroupWS),
  addGroupWS: catchAsync(addGroupWS),
  createGroupWS: catchAsync(createGroupWS),
  deleteMemberGroupWS: catchAsync(deleteMemberGroupWS),
  deleteGroupWS: catchAsync(deleteGroupWS),
  getModelWorkspaceGroups:catchAsync(getModelWorkspaceGroups),
  createUserWS,
  deleteUserByEmailWS,
  deleteDeviceGroupsWS,
  infoGroup,
  moveUserBetweenDevicesWS,
  ensureWorkspaceGroupsForModel
};
