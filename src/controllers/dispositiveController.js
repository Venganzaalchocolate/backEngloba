// controllers/dispositiveController.js
const { Provinces, Dispositive, Program, Documentation, Filedrive } = require('../models/indexModels');
const { catchAsync, response, ClientError, toId } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { generateEmailHTML, sendEmail } = require('./emailControllerGoogle');
const { ensureDeviceGroup, infoGroup } = require('./workspaceController');

const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);
const isDetach = (v) => v === null || v === '' || v === false;
const isDupKey = (err) => err && err.code === 11000; // índice único { program, name }

/**
 * Crear Dispositive (program opcional):
 * - Si "program" (o "programId") viene, se vincula y se añade su _id a Program.devicesId
 * - Si no, se crea huérfano (program null)
 */
const createDispositive = async (req, res) => {
  const {
    name,
    active,
    address,
    email,
    phone,
    province,
    program,
    programId,
  } = req.body;

  if (!name) throw new ClientError("Falta el nombre del dispositivo", 400);

  const programRef = program ?? programId ?? null;
  let programDoc = null;

  // 🧩 Validar programa
  if (programRef) {
    if (!isValidId(programRef)) throw new ClientError("program inválido", 400);
    programDoc = await Program.findById(programRef);
    if (!programDoc)
      throw new ClientError("No existe el programa especificado", 404);
  }

  // 🧱 Crear dispositivo base
  const payload = {
    name,
    active: active,
    address: address || "",
    email: email || "",
    phone: phone || "",
    responsible: [],
    coordinators: [],
    province: isValidId(province) ? province : null,
    files: [],
    program: programDoc ? programDoc._id : undefined,
  };

  // 🚀 Crear dispositivo
  const created = await Dispositive.create(payload);

  // 🧩 Asociar al programa padre
  if (programDoc) {
    await Program.updateOne(
      { _id: programDoc._id },
      { $addToSet: { devicesId: created._id } }
    );
  }

  // ⚙️ Asegurar grupo Workspace
  if (programDoc) await ensureDeviceGroup(created, programDoc);

  // 🧾 Propagar documentación tipo “Dispositive” del programa
  if (programDoc) {
    const programObjectId = new mongoose.Types.ObjectId(programDoc._id);

    const docs = await Documentation.find({
      model: "Dispositive",
      $or: [
        { programs: { $in: [programObjectId] } },
        { programs: { $in: [String(programDoc._id)] } },
      ],
    })
      .select("_id")
      .lean();

    if (docs.length) {
      for (const d of docs) {
        await Documentation.updateOne(
          { _id: d._id },
          { $addToSet: { dispositives: created._id } }
        );
      }
    }
  }

  // 📬 Email informativo (no crítico)
  const asunto = "Creación de un nuevo dispositivo";
  const textoPlano = `Programa padre: ${programDoc ? programDoc.name : "—"}
Nombre del Dispositivo: ${created.name}
Creador: ${req.body?.userCreate || "—"}`;
  const htmlContent = generateEmailHTML({
    logoUrl: "https://app.engloba.org.es/graphic/logotipo_blanco.png",
    title: "Creación de un nuevo dispositivo",
    greetingName: "Persona maravillosa",
    bodyText: "Se ha creado un nuevo dispositivo",
    highlightText: textoPlano,
    footerText:
      "Gracias por usar nuestra plataforma. Si tienes dudas, contáctanos.",
  });

  try {
    await sendEmail(
      ["comunicacion@engloba.org.es", "web@engloba.org.es"],
      asunto,
      textoPlano,
      htmlContent
    );
  } catch (_) {}

  // ✅ Respuesta final
  return response(res, 200, {
    dispositive: created,
    programId: created.program || null,
  });
};




/** Obtener un Dispositive por id (sin programId) */
const getDispositiveId = async (req, res) => {
  const { dispositiveId } = req.body;

  if (!dispositiveId) {
    throw new ClientError("Falta dispositiveId", 400);
  }

  const id = toId(dispositiveId);

  // 1) Obtener todos los archivos asociados directamente al dispositivo
  const files = await Filedrive.find({ idModel: id })
 
  // 2) Obtener el dispositivo con responsables + coordinadores
  let dispositive = await Dispositive.findById(id)
    .populate([
      {
        path: "responsible",
        select: "firstName lastName email phoneJob",
      },
      {
        path: "coordinators",
        select: "firstName lastName email phoneJob",
      },
      {
        path: "program",
        select: "name acronym area _id", // opcional pero útil
      },
    ])
    .lean();

  if (!dispositive) {
    throw new ClientError("Dispositivo no encontrado", 404);
  }

  // 3) Añadir los archivos en la respuesta final
  dispositive.files = files;

  response(res, 200, dispositive);
};

/**
 * Actualizar Dispositive:
 * - Actualiza campos básicos
 * - Si llega "program": mueve al nuevo programa y sincroniza Program.devicesId
 * - Si llega program = null/''/false: desvincula del programa y lo saca de devicesId
 */
const updateDispositive = async (req, res) => {
  const { dispositiveId, active, name, address, email, phone, province, program, cronology, type} = req.body;
if (!dispositiveId) throw new ClientError('Falta dispositiveId', 400);

  const current = await Dispositive.findById(dispositiveId);
  if (!current) throw new ClientError('Dispositivo no encontrado', 404);

  const update = {};
  const query = { _id: dispositiveId };
  let unset = null;
  let newProgramId = null;
  const oldProgramId = current.program ? String(current.program) : null;

  // Campos generales
  if (active !== undefined) update.active = active;
  if (name !== undefined) update.name = name;
  if (address !== undefined) update.address = address;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (province !== undefined)
    update.province = isValidId(province) ? province : null;

  // Programa
  if (program !== undefined) {
    if (isDetach(program)) {
      unset = { program: '' };
    } else {
      if (!isValidId(program)) throw new ClientError('program inválido', 400);
      newProgramId = String(program);
      if (oldProgramId !== newProgramId) {
        const exists = await Program.exists({ _id: newProgramId });
        if (!exists) throw new ClientError('program de destino no existe', 404);
        update.program = new mongoose.Types.ObjectId(newProgramId);
      }
    }
  }

  // 🧩 CRONOLOGY
  const updateObj = {};
  if (cronology !== undefined) {
    if (!type || !['add', 'delete', 'edit'].includes(type))
      throw new ClientError('Falta el tipo o es inválido para cronology', 400);

    if (type === 'add') {
      Object.assign(updateObj, { $addToSet: { cronology } });
    } else if (type === 'delete') {
      if (!cronology._id)
        throw new ClientError('Falta _id para eliminar cronology', 400);
      Object.assign(updateObj, { $pull: { cronology: { _id: cronology._id } } });
    } else if (type === 'edit') {
      if (!cronology._id)
        throw new ClientError('Falta _id para editar cronology', 400);
      Object.assign(updateObj, { $set: { 'cronology.$': cronology } });
      query['cronology._id'] = cronology._id;
    }
  }

  // Combinar los $set/$unset generados arriba con updateObj de cronology
  if (Object.keys(update).length) {
    Object.assign(updateObj, { $set: { ...(updateObj.$set || {}), ...update } });
  }
  if (unset) {
    Object.assign(updateObj, { $unset: unset });
  }

  // 🧠 Ejecutar actualización
  let updated;
  try {
    updated = await Dispositive.findOneAndUpdate(query, updateObj, {
      new: true,
      runValidators: true,
    });
  } catch (err) {
    if (isDupKey(err)) {
      throw new ClientError('Ya existe un dispositivo con ese nombre en el programa', 409);
    }
    throw err;
  }

  // 🔄 Sincronizar Program.devicesId si cambió de programa o se desvinculó
  if (newProgramId && newProgramId !== oldProgramId) {
    if (oldProgramId) {
      await Program.updateOne({ _id: oldProgramId }, { $pull: { devicesId: updated._id } });
    }
    await Program.updateOne({ _id: newProgramId }, { $addToSet: { devicesId: updated._id } });
  } else if (unset && oldProgramId) {
    await Program.updateOne({ _id: oldProgramId }, { $pull: { devicesId: updated._id } });
  }

  response(res, 200, updated);
};

/** Eliminar Dispositive (sin programId). Limpia devicesId en su Program si estaba vinculado. */
const deleteDispositive = async (req, res) => {
  const { dispositiveId } = req.body;
  if (!dispositiveId) throw new ClientError('Falta dispositiveId', 400);

  const doc = await Dispositive.findById(dispositiveId);
  if (!doc) throw new ClientError('No existe el dispositivo', 400);

  const oldProgramId = doc.program ? String(doc.program) : null;

  await Dispositive.deleteOne({ _id: dispositiveId });

  if (oldProgramId) {
    await Program.updateOne(
      { _id: oldProgramId },
      { $pull: { devicesId: dispositiveId } }
    );
  }

  response(res, 200, { ok: true, dispositiveId, programId: oldProgramId });
};

/** Coordinadores del Dispositive (list/add/update/remove) */
const handleCoordinators = async (req, res) => {
  const { action, deviceId: dispositiveId, coordinators = [], coordinatorId } = req.body;

  if (!action || !dispositiveId) {
    throw new ClientError("Faltan datos: 'action' o 'deviceId'.", 400);
  }

  switch (action) {
    case "list": {
      const d = await Dispositive.findById(dispositiveId, { coordinators: 1 }).lean();
      if (!d) throw new ClientError("No se encontró el dispositivo.", 404);
      return response(res, 200, d.coordinators || []);
    }
    case "add": {
      const newCoors = Array.isArray(coordinators) ? coordinators : [coordinators];
      const d = await Dispositive.findByIdAndUpdate(
        dispositiveId,
        { $addToSet: { coordinators: { $each: newCoors } } },
        { new: true }
      );
      if (!d) throw new ClientError("No se encontró el dispositivo.", 404);
      return response(res, 200, d);
    }
    case "update": {
      const next = Array.isArray(coordinators) ? coordinators : [coordinators];
      const d = await Dispositive.findByIdAndUpdate(
        dispositiveId,
        { $set: { coordinators: next } },
        { new: true }
      );
      if (!d) throw new ClientError("No se encontró el dispositivo.", 404);
      return response(res, 200, d);
    }
    case "remove": {
      if (!coordinatorId) throw new ClientError("Falta 'coordinatorId'.", 400);
      const d = await Dispositive.findByIdAndUpdate(
        dispositiveId,
        { $pull: { coordinators: coordinatorId } },
        { new: true }
      );
      if (!d) throw new ClientError("No se encontró el dispositivo.", 404);
      return response(res, 200, d);
    }
    default:
      throw new ClientError(`La acción '${action}' no está soportada.`, 400);
  }
};

/**
 * Responsables:
 *  - type = "program": gestiona Program.responsible (requiere programId)
 *  - type = "device":  gestiona Dispositive.responsible (solo dispositiveId)
 */
const handleResponsibles = async (req, res) => {
  const { type, action, programId, deviceId: dispositiveId, responsible = [], responsibleId } = req.body;

  if (!type || !action) throw new ClientError("Faltan 'type' o 'action'.", 400);

  if (type === "program") {
    if (!programId) throw new ClientError("Falta 'programId' para gestionar responsables de programa.", 400);
    switch (action) {
      case "list": {
        const p = await Program.findById(programId);
        if (!p) throw new ClientError("No se encontró el programa.", 400);
        return response(res, 200, p);
      }
      case "add": {
        const list = Array.isArray(responsible) ? responsible : [responsible];
        const p = await Program.findByIdAndUpdate(
          programId,
          { $addToSet: { responsible: { $each: list } } },
          { new: true }
        );
        if (!p) throw new ClientError("No se encontró el programa.", 400);
        return response(res, 200, p);
      }
      case "update": {
        const list = Array.isArray(responsible) ? responsible : [responsible];
        const p = await Program.findByIdAndUpdate(
          programId,
          { $set: { responsible: list } },
          { new: true }
        );
        if (!p) throw new ClientError("No se encontró el programa.", 400);
        return response(res, 200, p);
      }
      case "remove": {
        if (!responsibleId) throw new ClientError("Falta 'responsibleId' para eliminar.", 400);
        const p = await Program.findByIdAndUpdate(
          programId,
          { $pull: { responsible: responsibleId } },
          { new: true }
        );
        if (!p) throw new ClientError("No se encontró el programa.", 400);
        return response(res, 200, p);
      }
      default:
        throw new ClientError(`Acción '${action}' no soportada para 'program'.`, 400);
    }
  }

  if (type === "device") {
    if (!dispositiveId) throw new ClientError("Falta 'deviceId' para dispositivo.", 400);

    switch (action) {
      case "list": {
        const d = await Dispositive.findById(dispositiveId).lean();
        if (!d) throw new ClientError("No se encontró el dispositivo.", 400);
        return response(res, 200, d);
      }
      case "add": // si prefieres incremental, cambia a $addToSet
      case "update": {
        const list = Array.isArray(responsible) ? responsible : [responsible];
        const d = await Dispositive.findByIdAndUpdate(
          dispositiveId,
          { $set: { responsible: list } },
          { new: true }
        );
        if (!d) throw new ClientError("No se encontró el dispositivo.", 400);
        return response(res, 200, d);
      }
      case "remove": {
        if (!responsibleId) throw new ClientError("Falta 'responsibleId' para eliminar.", 400);
        const d = await Dispositive.findByIdAndUpdate(
          dispositiveId,
          { $pull: { responsible: responsibleId } },
          { new: true }
        );
        if (!d) throw new ClientError("No se encontró el dispositivo.", 400);
        return response(res, 200, d);
      }
      default:
        throw new ClientError(`Acción '${action}' no soportada para 'device'.`, 400);
    }
  }

  throw new ClientError(`Tipo '${type}' no soportado.`, 400);
};

const listsResponsiblesAndCoordinators = async (req, res) => {
  const { responsibles, coordinators, resAndCorr } = req.body;
  if (!responsibles && !coordinators && !resAndCorr) {
    throw new ClientError(
      "Debes indicar 'responsibles', 'coordinators' o 'resAndCorr'.",
      400
    );
  }

  const wantResponsibles = !!(responsibles || resAndCorr);
  const wantCoordinators = !!(coordinators || resAndCorr);

  // --- Índice de provincias (raíz y subcategorías) ---
  const provinceMap = new Map();
  const provinces = await Provinces.find({}, { name: 1, subcategories: 1 }).lean();
  provinces.forEach(p => {
    provinceMap.set(String(p._id), p.name);
    (p.subcategories || []).forEach(sub => {
      provinceMap.set(String(sub._id), `${p.name} – ${sub.name}`);
    });
  });

  // --- Query base sobre Dispositive con filtro por existencia de roles (optimiza) ---
  const roleOr = [];
  if (wantResponsibles) roleOr.push({ responsible: { $exists: true, $ne: [] } });
  if (wantCoordinators) roleOr.push({ coordinators: { $exists: true, $ne: [] } });

  const dispositives = await Dispositive.find(
    roleOr.length ? { $or: roleOr } : {}
  )
    .select('name province responsible coordinators program')
    .populate({
      path: 'responsible',
      select: 'firstName lastName email phone phoneJob.number phoneJob.extension'
    })
    .populate({
      path: 'coordinators',
      select: 'firstName lastName email phone phoneJob.number phoneJob.extension'
    })
    .populate({
      path: 'program',
      select: 'name acronym'
    })
    .lean();
  // --- Programas (solo responsables, sin coordinadores ni campo program) ---
  const programs = wantResponsibles
    ? await Program.find({ responsible: { $exists: true, $ne: [] } })
        .select('name province responsible')
        .populate({
          path: 'responsible',
          select: 'firstName lastName email phone phoneJob.number phoneJob.extension'
        })
        .lean()
    : [];

  const list = [];

  for (const d of dispositives) {
    const programName = d.program?.acronym ?? d.program?.name;
    const deviceName  = d.name ?? '';
    const provinceName = d.province ? (provinceMap.get(String(d.province)) || null) : null;

    if (wantResponsibles && Array.isArray(d.responsible)) {
      for (const u of d.responsible) {
        list.push({
          program:   programName,
          device:    deviceName,
          province:  provinceName,
          role:      'responsible',
          firstName: u?.firstName  ?? '',
          lastName:  u?.lastName   ?? '',
          email:     u?.email      ?? '',
          phone:     u?.phone      ?? '',
          phoneJob: {
            number:    u?.phoneJob?.number    ?? '',
            extension: u?.phoneJob?.extension ?? ''
          }
        });
      }
    }

    if (wantCoordinators && Array.isArray(d.coordinators)) {
      for (const u of d.coordinators) {
        list.push({
          program:   programName,
          device:    deviceName,
          province:  provinceName,
          role:      'coordinator',
          firstName: u?.firstName  ?? '',
          lastName:  u?.lastName   ?? '',
          email:     u?.email      ?? '',
          phone:     u?.phone      ?? '',
          phoneJob: {
            number:    u?.phoneJob?.number    ?? '',
            extension: u?.phoneJob?.extension ?? ''
          }
        });
      }
    }
  }

    // --- Datos desde Program ---
  for (const p of programs) {
    const programName  = p.acronym ?? p.name;

    if (Array.isArray(p.responsible)) {
      for (const u of p.responsible) {
        list.push({
          program:   programName,
          device:    null, // No aplica
          province:  null,
          role:      'responsible-program',
          firstName: u?.firstName  ?? '',
          lastName:  u?.lastName   ?? '',
          email:     u?.email      ?? '',
          phone:     u?.phone      ?? '',
          phoneJob: {
            number:    u?.phoneJob?.number    ?? '',
            extension: u?.phoneJob?.extension ?? ''
          }
        });
      }
    }
  }
 
  response(res, 200, list);
};

const getDispositiveResponsable = async (req, res) => {
  if (!req.body._id) {
    throw new ClientError("Los datos no son correctos", 400);
  }

  const userId = new mongoose.Types.ObjectId(req.body._id);

  // 1) Programas donde el usuario es responsable del programa
  const programsResp = await Program.find(
    { responsible: userId },
    { _id: 1, name: 1, acronym: 1 }
  ).lean();

  const progRespSet = new Set(programsResp.map(p => String(p._id)));

  // 2) Dispositivos donde el usuario es responsable o coordinador
  const dispositives = await Dispositive.find(
    {
      $or: [
        { responsible: userId },
        { coordinators: userId }
      ]
    },
    { _id: 1, name: 1, program: 1, responsible: 1, coordinators: 1 }
  )
    .populate({ path: 'program', select: 'name acronym' })
    .lean();

  const result = [];

  // 2a) Filas por cada dispositivo con rol
  for (const d of dispositives) {
    const progId = d.program ? (d.program._id ?? d.program) : null;
    const progIdStr = progId ? String(progId) : null;

    const isDeviceResponsible  = Array.isArray(d.responsible)  && d.responsible.some(x => String(x) === String(userId));
    const isDeviceCoordinator  = Array.isArray(d.coordinators) && d.coordinators.some(x => String(x) === String(userId));
    const isProgramResponsible = progIdStr ? progRespSet.has(progIdStr) : false;

    result.push({
      idProgram: progId || null,
      programName: d.program?.name ?? '',
      programAcronym: d.program?.acronym ?? '',
      isProgramResponsible,
      dispositiveName: d.name || null,
      dispositiveId: d._id,
      isDeviceResponsible,
      isDeviceCoordinator,
    });
  }

  // 3) Añadir filas "solo programa" donde el usuario es responsable de programa
  //    pero no tiene ningún dispositivo con rol en ese programa.
  const alreadyListedProgIds = new Set(result.map(r => String(r.idProgram)).filter(Boolean));
  for (const p of programsResp) {
    if (!alreadyListedProgIds.has(String(p._id))) {
      result.push({
        idProgram: p._id,
        programName: p.name,
        programAcronym: p.acronym,
        isProgramResponsible: true,
        dispositiveName: null,
        dispositiveId: null,
        isDeviceResponsible: false,
        isDeviceCoordinator: false,
      });
    }
  }

  response(res, 200, result);
};


module.exports = {
  createDispositive: catchAsync(createDispositive),
  updateDispositive: catchAsync(updateDispositive),
  deleteDispositive: catchAsync(deleteDispositive),
  handleCoordinators: catchAsync(handleCoordinators),
  handleResponsibles: catchAsync(handleResponsibles),
  listsResponsiblesAndCoordinators:catchAsync(listsResponsiblesAndCoordinators),
  getDispositiveResponsable:catchAsync(getDispositiveResponsable),
  getDispositiveId:catchAsync(getDispositiveId)
};
