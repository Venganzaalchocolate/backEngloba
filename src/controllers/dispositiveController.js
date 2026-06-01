// controllers/dispositiveController.js
const { Provinces, Dispositive, Program, Documentation, Filedrive, Periods } = require('../models/indexModels');
const { catchAsync, response, ClientError, toId } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { generateEmailHTML, sendEmail } = require('./emailControllerGoogle');
const { deleteDeviceGroupsWS, ensureWorkspaceGroupsForModel } = require('./workspaceController');

const {
  createSesameDepartmentForDispositive,
  updateSesameDepartmentForDispositive,
  deleteSesameDepartmentForDispositive,
} = require("./sesameController");

const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);
const isDetach = (v) => v === null || v === '' || v === false;
const isDupKey = (err) => err && err.code === 11000; // índice único { program, name }



/**
 * Crear Dispositive (program opcional):
 * - Si "program" (o "programId") viene, se vincula y se añade su _id a Program.devicesId
 * - Si no, se crea huérfano (program null)
 */
// ===================== createDispositive =====================

const createDispositive = async (req, res) => {
  try {
    const {
      name,
      active,
      address,
      phone,
      province,
      program,
      programId,
      coordinates,
      serviceType,
    } = req.body;

    if (!name) {
      throw new ClientError("Falta el nombre del dispositivo", 400);
    }


    const programRef = program ?? programId ?? null;
    let programDoc = null;

    if (programRef) {
      if (!isValidId(programRef)) {
        throw new ClientError("program inválido", 400);
      }

      programDoc = await Program.findById(programRef);
      if (!programDoc) {
        throw new ClientError("No existe el programa especificado", 404);
      }
    }

    const payload = {
      name,
      active: active !== undefined ? active : true,
      address: address || "",
      email: "",
      phone: phone || "",
      responsible: [],
      coordinators: [],
      province: isValidId(province) ? province : null,
      files: [],
      program: programDoc ? programDoc._id : undefined,
      coordinates: { lat: null, lng: null },
      serviceTypeserviceType: {
        residencial: !!serviceType?.residencial,
        capacity: Number.isFinite(Number(serviceType?.capacity))
          ? Number(serviceType.capacity)
          : 0,
      },
    };

    if (
      coordinates &&
      Number.isFinite(Number(coordinates.lat)) &&
      Number.isFinite(Number(coordinates.lng))
    ) {
      payload.coordinates = {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng),
      };
    }

    const created = await Dispositive.create(payload);

    try {
      await createSesameDepartmentForDispositive(created._id);
    } catch (err) {
      await Dispositive.deleteOne({ _id: created._id }).catch(() => { });
      throw err;
    }

    const createdUpdated = await Dispositive.findById(created._id);

    if (programDoc) {
      await Program.updateOne(
        { _id: programDoc._id },
        { $addToSet: { devicesId: created._id } }
      );
    }

    if (programDoc) {
      void ensureWorkspaceGroupsForModel({
        type: 'device',
        id: created._id,
        requiredSubgroups: ['direction'],
      }).catch(err => {
        console.warn('⚠️ Workspace groups (device) falló:', created._id, err?.message || err);
      });
    }

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
      footerText: "Gracias por usar nuestra plataforma. Si tienes dudas, contáctanos.",
    });

    try {
      await sendEmail(
        ["comunicacion@engloba.org.es", "web@engloba.org.es"],
        asunto,
        textoPlano,
        htmlContent
      );
    } catch (_) { }



    return response(res, 200, {
      dispositive: createdUpdated,
      programId: createdUpdated.program || null,
    });
  } catch (error) {

    if (error.code === 11000) {
      const [[, dupValue]] = Object.entries(error.keyValue || {});
      throw new ClientError(
        `'${dupValue}' ya existe. No se pudo crear el dispositivo porque debe ser único`,
        400
      );
    }

    if (error instanceof ClientError) {
      throw error;
    }

    throw new ClientError("Error al crear el dispositivo", 500);
  }
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
      {
        path: "supervisors",
        select: "firstName lastName email phoneJob",
      },
      {
        path: "workplaces",
        select: "name address phone province coordinates resolvedAddress officeIdSesame active",
        populate: {
          path: "province",
          select: "name",
        },
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
  const { dispositiveId, active, name, address, email, phone, province, program, cronology, type, coordinates, serviceType } = req.body;
  if (!dispositiveId) throw new ClientError('Falta dispositiveId', 400);

  const current = await Dispositive.findById(dispositiveId);
  if (!current) throw new ClientError('Dispositivo no encontrado', 404);

  const update = {};
  const query = { _id: dispositiveId };
  let unset = null;
  let newProgramId = null;
  const oldProgramId = current.program ? String(current.program) : null;

  if (active !== undefined) {
    update.active = active;
    if (!active) {
      const existHiringActive = await Periods.findOne({
        dispositiveId: dispositiveId,
        $or: [
          { endDate: { $exists: false } },
          { endDate: null },
        ],
      });

      if (existHiringActive) {
        throw new ClientError('No se puede cerrar un dispositivo si tiene trabajadores con un periodo de contratación activo', 400);
      }
    }
  }

  if (name !== undefined) update.name = name;
  if (address !== undefined) update.address = address;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (province !== undefined) update.province = isValidId(province) ? province : null;

  if (serviceType !== undefined) {
  update.serviceType = {
    residencial: !!serviceType?.residencial,
    capacity: Number.isFinite(Number(serviceType?.capacity))
      ? Number(serviceType.capacity)
      : 0,
  };
}
  if (coordinates !== undefined) {
    if (
      coordinates &&
      Number.isFinite(Number(coordinates.lat)) &&
      Number.isFinite(Number(coordinates.lng))
    ) {
      update.coordinates = {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng),
      };
    } else if (coordinates === null) {
      update.coordinates = { lat: null, lng: null };
    }
  }

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

  if (Object.keys(update).length) {
    Object.assign(updateObj, { $set: { ...(updateObj.$set || {}), ...update } });
  }
  if (unset) {
    Object.assign(updateObj, { $unset: unset });
  }

  let updated;

  if (Object.keys(updateObj).length) {
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
  } else {
    updated = await Dispositive.findById(dispositiveId);
  }


  if (newProgramId && newProgramId !== oldProgramId) {
    if (oldProgramId) {
      await Program.updateOne({ _id: oldProgramId }, { $pull: { devicesId: updated._id } });
    }
    await Program.updateOne({ _id: newProgramId }, { $addToSet: { devicesId: updated._id } });
  } else if (unset && oldProgramId) {
    await Program.updateOne({ _id: oldProgramId }, { $pull: { devicesId: updated._id } });
  }

  if (name !== undefined || !updated.departamentSesame) {
    await updateSesameDepartmentForDispositive(updated._id);
  }

  updated = await Dispositive.findById(dispositiveId)
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
        select: "name acronym area _id",
      },
      {
        path: "supervisors",
        select: "firstName lastName email phoneJob",
      },
      {
        path: "workplaces",
        select: "name address phone province coordinates resolvedAddress officeIdSesame active",
        populate: {
          path: "province",
          select: "name",
        },
      },
    ]);

  response(res, 200, updated);


};

/** Eliminar Dispositive (sin programId). Limpia devicesId en su Program si estaba vinculado. */
const deleteDispositive = async (req, res) => {
  const { dispositiveId } = req.body;
  if (!dispositiveId) throw new ClientError('Falta dispositiveId', 400);

  const doc = await Dispositive.findById(dispositiveId);
  if (!doc) throw new ClientError('No existe el dispositivo', 400);

  const oldProgramId = doc.program ? String(doc.program) : null;

  // 2) Intentar borrar grupo principal y subgrupos en Workspace (no crítico)
  try {
    await deleteDeviceGroupsWS(doc);
  } catch (err) {
    console.warn(
      `⚠️ Error al intentar borrar grupos de Workspace del dispositivo ${dispositiveId}:`,
      err.message || err
    );
  }

  await deleteSesameDepartmentForDispositive(dispositiveId);

  await Dispositive.deleteOne({ _id: dispositiveId });

  if (oldProgramId) {
    await Program.updateOne(
      { _id: oldProgramId },
      { $pull: { devicesId: dispositiveId } }
    );
  }

  response(res, 200, { ok: true, dispositiveId, programId: oldProgramId });
};



module.exports = {
  createDispositive: catchAsync(createDispositive),
  updateDispositive: catchAsync(updateDispositive),
  deleteDispositive: catchAsync(deleteDispositive),
  getDispositiveId: catchAsync(getDispositiveId),

};
