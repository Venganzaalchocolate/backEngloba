const { default: mongoose } = require('mongoose');
const { Preferents, Periods } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

const toId = (v) => new mongoose.Types.ObjectId(v);

const getPreferents = async (req, res) => {
  const preferents = await Preferents.find()
    .populate({ path: 'user', select: 'firstName lastName dni' })
    .populate({ path: 'authorized', select: 'firstName lastName dni email' }) // <—
    .lean();

  response(res, 200, preferents);
};

// Obtener por ID
const getPreferentById = async (req, res) => {

  const { id} = req.body; 
  if (!id) throw new ClientError('Falta _id', 400);

  const preferent = await Preferents.findById(id)
    .populate({ path: 'user', select: 'firstName lastName dni' })
    .populate({ path: 'authorized', select: 'firstName lastName dni email' }) // <—
    .lean();

  if (!preferent) throw new ClientError('Preferent no encontrado', 404);
  response(res, 200, preferent);
};

// Crear


const createPreferent = async (req, res) => {
  const { userId, provinces = [], jobs = [], type, authorized, hiringsId } = req.body;

  // Validaciones básicas
  if (!userId || !provinces.length || !jobs.length || !type || !authorized) {
    throw new ClientError('Faltan datos obligatorios', 400);
  }

  // ---- Normalización de arrays ----
  const provincesIds = (Array.isArray(provinces) ? provinces : String(provinces).split(','))
    .filter(Boolean).map(toId);

  const jobsIds = (Array.isArray(jobs) ? jobs : String(jobs).split(','))
    .filter(Boolean).map(toId);

  // ---- hiringsId (opcional: 1..2) ----
  let hiringIds = [];
  if (hiringsId !== undefined && hiringsId !== null) {
    const raw = Array.isArray(hiringsId) ? hiringsId : [hiringsId];
    const dedup = [...new Set(raw.filter(Boolean))];
    if (dedup.length === 0) {
      // permitido: array vacío => no asociar
      hiringIds = [];
    } else {
      if (dedup.length > 2) throw new ClientError('hiringsId admite como máximo 2 elementos', 400);
      // Validar ObjectId
      const invalid = dedup.find(x => !mongoose.Types.ObjectId.isValid(x));
      if (invalid) throw new ClientError(`HiringId inválido: ${invalid}`, 400);

      // Comprobar que existen y pertenecen al mismo userId
      const idsAsObj = dedup.map(toId);
      const periods = await Periods.find({ _id: { $in: idsAsObj } }, { _id: 1, idUser: 1 }).lean();

      if (periods.length !== idsAsObj.length) {
        throw new ClientError('Algún hiringId no existe', 404);
      }
      const wrong = periods.find(p => String(p.idUser) !== String(userId));
      if (wrong) {
        throw new ClientError('Todos los hiringId deben pertenecer al mismo usuario indicado en userId', 400);
      }

      hiringIds = idsAsObj;
    }
  }

  // Desactivar preferentes activos anteriores del usuario
  await Preferents.updateMany(
    { user: toId(userId), active: true },
    { $set: { active: false } }
  );

  // Crear y guardar
  const doc = await Preferents.create({
    user: toId(userId),
    provinces: provincesIds,
    jobs: jobsIds,
    type,
    authorized: toId(authorized),
    hiringsId: hiringIds,           // <-- nuevo
  });

  // Popular después de guardar
  await doc.populate([
    { path: 'user', select: 'firstName lastName dni' },
    { path: 'authorized', select: 'firstName lastName dni email' },
    // (opcional) devolver algo de los periods asociados:
    { path: 'hiringsId', select: 'startDate endDate position deviceID active' },
  ]);

  return response(res, 201, doc);
};



// Actualizar
const updatePreferent = async (req, res) => {
  const id = req.body._id;
  if (!id) throw new ClientError('Falta _id', 400);

  const updateData = {};
  ['provinces', 'jobs', 'type', 'authorized', 'active'].forEach(key => {
    if (req.body[key] !== undefined) updateData[key] = req.body[key];
  });

  if (updateData.provinces) {
    updateData.provinces = updateData.provinces.map(toId);
  }
  if (updateData.jobs) {
    updateData.jobs = updateData.jobs.map(toId);
  }
  if (updateData.authorized) {
    updateData.authorized = toId(updateData.authorized);
  }

  let updated = await Preferents.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  )
  .populate({ path: 'user', select: 'firstName lastName dni' })
  .populate({ path: 'authorized', select: 'firstName lastName dni email' }); // <—

  if (!updated) throw new ClientError('Preferent no encontrado', 404);
  response(res, 200, updated);
};

// Eliminar (no hace falta populate aquí)
const deletePreferent = async (req, res) => {
  const { id } = req.body; // corregido
  if (!id) throw new ClientError('Falta _id', 400);
  const deleted = await Preferents.findByIdAndDelete(id);
  if (!deleted) throw new ClientError('Preferent no encontrado', 404);
  response(res, 200, { message: 'Preferent eliminado correctamente' });
};

// Filtrar
const filterPreferents = async (req, res) => {

  const { userId, provinces, jobs,active } = req.body;
  const filter = {};
  if (userId) filter.user = toId(userId);

  if (provinces) {
    const provArray = Array.isArray(provinces) ? provinces : provinces.split(',');
    filter.provinces = { $in: provArray.map(toId) };
  }
  if (jobs) {
    const jobsArray = Array.isArray(jobs) ? jobs : jobs.split(',');
    filter.jobs = { $in: jobsArray.map(toId) };
  }
  if (active){
    filter.active=active
  }

  const preferents = await Preferents.find(filter)
    .populate({ path: 'user', select: 'firstName lastName dni' })
    .populate({ path: 'authorized', select: 'firstName lastName dni email' }); // <—

  response(res, 200, preferents);
};

module.exports = {
  getPreferents: catchAsync(getPreferents),
  getPreferentById: catchAsync(getPreferentById),
  createPreferent: catchAsync(createPreferent),
  updatePreferent: catchAsync(updatePreferent),
  deletePreferent: catchAsync(deletePreferent),
  filterPreferents: catchAsync(filterPreferents)
};