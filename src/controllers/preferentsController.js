const { default: mongoose } = require('mongoose');
const { Preferents } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');

// Obtener todos los preferents
const getPreferents = async (req, res) => {
  const preferents = await Preferents.find()
    .lean();
  response(res, 200, preferents);
};

// Obtener un preferent por ID
const getPreferentById = async (req, res) => {
  const { id } = req.body._id;
  if (!id) throw new ClientError('Falta _id', 400);
  const preferent = await Preferents.findById(new mongoose.Types.ObjectId(id)).lean();
  if (!preferent) throw new ClientError('Preferent no encontrado', 404);
  response(res, 200, preferent);
};

// Crear un nuevo preferent
const createPreferent = async (req, res) => {
  const { userId, provinces, jobs, type, authorized } = req.body;
  if (!userId || !provinces || !jobs || !type || !authorized) {
    throw new ClientError('Faltan datos obligatorios', 400);
  }
  // 1. Buscar preferencias activas de ese usuario
  const filter = { user: new mongoose.Types.ObjectId(userId), active: true };

  // OJO: find() es asíncrono, necesitas await
  const preferentOldActive = await Preferents.find(filter);

  // 2. Si hay alguna, las actualizas todas a active: false
  if (preferentOldActive.length > 0) {
    await Preferents.updateMany(filter, { active: false });
    // Si solo puede haber una, puedes usar updateOne
  }
  const newPreferent = new Preferents({
    user: new mongoose.Types.ObjectId(userId),
    provinces: provinces.map(str => new mongoose.Types.ObjectId(str)),
    jobs: jobs.map(str => new mongoose.Types.ObjectId(str)),
    type,
    authorized: new mongoose.Types.ObjectId(authorized),
  });
  const savedPreferent = await newPreferent.save();
  response(res, 201, savedPreferent);
};

// Actualizar un preferent existente
const updatePreferent = async (req, res) => {
  const id = req.body._id;
  if (!id) throw new ClientError('Falta _id', 400);

  const updateData = {};
  ['provinces', 'jobs', 'type', 'authorized', 'active'].forEach(key => {
    if (req.body[key] !== undefined) updateData[key] = req.body[key];
  });

  if (updateData.provinces) {
    updateData.provinces = updateData.provinces.map(str => new mongoose.Types.ObjectId(str));
  }
  if (updateData.jobs) {
    updateData.jobs = updateData.jobs.map(str => new mongoose.Types.ObjectId(str));
  }
  if (updateData.authorized) {
    updateData.authorized = new mongoose.Types.ObjectId(updateData.authorized);
  }

  const updated = await Preferents
    .findByIdAndUpdate(id, updateData, { new: true, runValidators: true })

  if (!updated) throw new ClientError('Preferent no encontrado', 404);
  response(res, 200, updated);
};

// Eliminar un preferent
const deletePreferent = async (req, res) => {
  const { id } = req.body._id;
  if (!id) throw new ClientError('Falta _id', 400);
  const deleted = await Preferents.findByIdAndDelete(new mongoose.Types.ObjectId(id));
  if (!deleted) throw new ClientError('Preferent no encontrado', 404);
  response(res, 200, { message: 'Preferent eliminado correctamente' });
};

// Buscar preferents con filtros de provincias y trabajos
const filterPreferents = async (req, res) => {
  const { userId, provinces, jobs } = req.body;

  const filter = {};
  if (userId) filter.user = new mongoose.Types.ObjectId(userId);

  if (provinces) {
    const provArray = Array.isArray(provinces) ? provinces : provinces.split(',');
    filter.provinces = { $in: provArray.map(str => new mongoose.Types.ObjectId(str)) };
  }
  if (jobs) {
    const jobsArray = Array.isArray(jobs) ? jobs : jobs.split(',');
    filter.jobs = { $in: jobsArray.map(str => new mongoose.Types.ObjectId(str)) };
  }

  const preferents = await Preferents.find(filter).populate({ path: 'user', select: 'firstName lastName dni' }); // <-- corregido;
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