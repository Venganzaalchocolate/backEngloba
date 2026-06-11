// controllers/workplaceController.js
const mongoose = require('mongoose');
const { Workplace, Dispositive, Provinces } = require('../models/indexModels');

const { catchAsync, response, ClientError, toId } = require('../utils/indexUtils');
const {
  syncSesameOfficeForWorkplace,
  deleteSesameOfficeForWorkplace,
} = require('./sesameController');

const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);
const isDupKey = (err) => err && err.code === 11000;

const cleanRegex = (text = '') => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseBool = (value) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

const isValidCoordinateValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  return Number.isFinite(Number(value));
};

const isValidCoordinatePair = (coordinates) => {
  if (!coordinates) return false;

  if (!isValidCoordinateValue(coordinates.lat)) return false;
  if (!isValidCoordinateValue(coordinates.lng)) return false;

  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);

  if (lat === 0 || lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;

  return true;
};

const parseCoordinates = (coordinates) => {
  if (coordinates === null) return { lat: null, lng: null };

  if (!isValidCoordinatePair(coordinates)) return undefined;

  return {
    lat: Number(coordinates.lat),
    lng: Number(coordinates.lng),
  };
};

const MINOR_WORDS = ['de', 'del', 'la', 'las', 'los', 'y', 'el', 'en', 'a'];

const capitalizeWord = (word = '') => {
  if (!word) return word;
  if (/^\d/.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
};

const toTitleCase = (text = '') => {
  const normalized = String(text).toLowerCase().replace(/\s+/g, ' ').trim();

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      const cleanWord = word.replace(/[.,]/g, '');

      if (index !== 0 && MINOR_WORDS.includes(cleanWord)) return cleanWord;

      if (word.includes('/')) {
        return word.split('/').map((part) => capitalizeWord(part)).join('/');
      }

      if (word.includes('-')) {
        return word.split('-').map((part) => capitalizeWord(part)).join('-');
      }

      return capitalizeWord(word);
    })
    .join(' ');
};

const beautifyAddress = (address = '') => {
  let value = String(address)
    .replace(/^CL\s+/i, 'C/ ')
    .replace(/^C\/\s*/i, 'C/ ')
    .replace(/^AVDA\.\s+/i, 'Avda. ')
    .replace(/^AV\s+/i, 'Av. ')
    .replace(/^PZ\s+/i, 'Plaza ')
    .replace(/^PJ\s+/i, 'Pasaje ')
    .replace(/^CT\s+/i, 'Ctra. ')
    .replace(/^CM\s+/i, 'Camino ')
    .replace(/^UR\s+/i, 'Urb. ')
    .replace(/^ZZ\s+/i, '')
    .replace(/^CI\s+/i, '')
    .replace(/^CALLE\s+/i, 'C/ ')
    .replace(/\bCALLE\s+/gi, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

  value = toTitleCase(value);

  return value
    .replace(/^C\/ /, 'C/ ')
    .replace(/^Avda\. /, 'Avda. ')
    .replace(/^Av\. /, 'Av. ')
    .replace(/^Ctra\. /, 'Ctra. ')
    .replace(/\bS\/N\b/gi, 'S/N')
    .replace(/\bKm\b/g, 'km')
    .replace(/\bDcha\b/g, 'Dcha.')
    .replace(/\bDrcha\b/g, 'Dcha.')
    .replace(/\bIzq\b/g, 'Izq.')
    .replace(/\bIz\b/g, 'Izq.')
    .replace(/\bUrb\b/g, 'Urb.')
    .replace(/\bPol\b/g, 'Pol.')
    .replace(/\bParc\b/g, 'Parc.');
};

const getProvinceNameById = async (provinceId) => {
  if (!provinceId || !isValidId(provinceId)) return '';

  const provinceDoc = await Provinces.findById(provinceId).select('name').lean();
  return provinceDoc?.name || '';
};

const buildWorkplaceName = async ({ address, resolvedAddress, province }) => {
  const cityOrProvince =
    resolvedAddress?.city ||
    resolvedAddress?.municipality ||
    resolvedAddress?.locality ||
    await getProvinceNameById(province);

  if (!cityOrProvince) {
    throw new ClientError('La provincia es obligatoria para generar el nombre del centro', 400);
  }

  const prettyAddress = beautifyAddress(address || resolvedAddress?.formatted || '');

  if (!prettyAddress) {
    throw new ClientError('La dirección es obligatoria para generar el nombre del centro', 400);
  }

  return `${toTitleCase(cityOrProvince)} · ${prettyAddress}`;
};

/**
 * Crea un centro de trabajo.
 */
const createWorkplace = async (req, res) => {
  const {
    active,
    address,
    phone,
    province,
    coordinates,
    resolvedAddress,
    cronology,
    officeIdSesame,
    createSesameOffice,
    entity
  } = req.body;

  if (!province || !isValidId(province)) {
    throw new ClientError('La provincia es obligatoria para crear el centro de trabajo', 400);
  }

  if (!address || !String(address).trim()) {
    throw new ClientError('La dirección es obligatoria para crear el centro de trabajo', 400);
  }

  const wantsSesameOffice = createSesameOffice === true || createSesameOffice === 'true';
  const parsedCoordinates = parseCoordinates(coordinates);

  if (wantsSesameOffice && parsedCoordinates === undefined) {
    throw new ClientError('Latitud y longitud válidas son obligatorias para crear el centro en Sesame', 400);
  }

  const prettyAddress = beautifyAddress(address);

  const payload = {
    name: await buildWorkplaceName({ address: prettyAddress, resolvedAddress, province }),
    active: active !== undefined ? parseBool(active) ?? true : true,
    address: prettyAddress,
    phone: phone || '',
    province,
    cronology: Array.isArray(cronology) ? cronology : [],
    officeIdSesame: officeIdSesame || null,
    entity:entity || 'Engloba'
  };

  if (parsedCoordinates !== undefined) payload.coordinates = parsedCoordinates;

  if (resolvedAddress && typeof resolvedAddress === 'object') {
    payload.resolvedAddress = {
      formatted: resolvedAddress.formatted || prettyAddress,
      province: resolvedAddress.province || null,
      city: resolvedAddress.city ? toTitleCase(resolvedAddress.city) : null,
      postcode: resolvedAddress.postcode || null,
      country: resolvedAddress.country || null,
      source: resolvedAddress.source || null,
      resolvedAt: resolvedAddress.resolvedAt || new Date(),
    };
  }

  let workplace;

  try {
    workplace = await Workplace.create(payload);
  } catch (err) {
    if (isDupKey(err)) {
      throw new ClientError('Ya existe un centro de trabajo con ese nombre en esa provincia', 409);
    }

    throw err;
  }

  if (wantsSesameOffice) {
    await syncSesameOfficeForWorkplace(workplace._id);
    workplace = await Workplace.findById(workplace._id).populate('province', 'name');
  }

  response(res, 200, workplace);
};

/**
 * Lista centros de trabajo con filtros y paginación.
 */

const buildAccentRegex = (text = '') => {
  return cleanRegex(String(text).trim())
    .replace(/[aáàäâã]/gi, '[aáàäâã]')
    .replace(/[eéèëê]/gi, '[eéèëê]')
    .replace(/[iíìïî]/gi, '[iíìïî]')
    .replace(/[oóòöôõ]/gi, '[oóòöôõ]')
    .replace(/[uúùüû]/gi, '[uúùüû]')
    .replace(/[nñ]/gi, '[nñ]')
    .replace(/[cç]/gi, '[cç]');
};
const listWorkplaces = async (req, res) => {
  const {
    q,
    active,
    province,
    programId,
    dispositive,
    page = 1,
    limit = 50,
  } = req.body || {};

    const filters = {};

  const parsedActive = parseBool(active);
  if (parsedActive !== undefined) filters.active = parsedActive;

  if (province && isValidId(province)) filters.province = province;

  if (q && String(q).trim()) {
    const regex = new RegExp(buildAccentRegex(q), 'i');

    filters.$or = [
      { name: regex },
      { address: regex },
      { phone: regex },
      { 'resolvedAddress.formatted': regex },
      { 'resolvedAddress.city': regex },
      { 'resolvedAddress.postcode': regex },
    ];
  }

  if (dispositive && isValidId(dispositive)) {
    const device = await Dispositive.findById(dispositive)
      .select('workplaces')
      .lean();

    const workplaceIds = (device?.workplaces || [])
      .filter(Boolean)
      .map((id) => String(id));

    if (!workplaceIds.length) {
      return response(res, 200, {
        items: [],
        page: Math.max(Number(page) || 1, 1),
        limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
        total: 0,
        pages: 0,
      });
    }

    filters._id = { $in: workplaceIds };
  }

  if (!dispositive && programId && isValidId(programId)) {
    const devices = await Dispositive.find({
      program: programId,
      workplaces: { $exists: true, $ne: [] },
    })
      .select('workplaces')
      .lean();

    const workplaceIds = [
      ...new Set(
        devices
          .flatMap((d) => d.workplaces || [])
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];

    if (!workplaceIds.length) {
      return response(res, 200, {
        items: [],
        page: Math.max(Number(page) || 1, 1),
        limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
        total: 0,
        pages: 0,
      });
    }

    filters._id = { $in: workplaceIds };
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    Workplace.find(filters)
      .populate('province', 'name')
      .sort({ active: -1, name: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    Workplace.countDocuments(filters),
  ]);

  response(res, 200, {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    pages: Math.ceil(total / safeLimit),
  });
  
  
};

/**
 * Obtiene un centro de trabajo por id.
 */
const getWorkplaceId = async (req, res) => {
  const { workplaceId } = req.body;

  if (!workplaceId) {
    throw new ClientError('Falta workplaceId', 400);
  }

  const workplace = await Workplace.findById(toId(workplaceId))
    .populate('province', 'name')
    .lean();

  if (!workplace) {
    throw new ClientError('Centro de trabajo no encontrado', 404);
  }

  response(res, 200, workplace);
};

/**
 * Actualiza un centro de trabajo y sincroniza Sesame si ya tiene oficina enlazada.
 */
const updateWorkplace = async (req, res) => {
  const {
    workplaceId,
    active,
    address,
    phone,
    province,
    coordinates,
    resolvedAddress,
    cronology,
    type,
    officeIdSesame,
    createSesameOffice,
    entity
  } = req.body;

  if (!workplaceId) {
    throw new ClientError('Falta workplaceId', 400);
  }

  const current = await Workplace.findById(workplaceId);
  if (!current) {
    throw new ClientError('Centro de trabajo no encontrado', 404);
  }

  const query = { _id: workplaceId };
  const update = {};
  const unset = {};
  const updateObj = {};

  if (active !== undefined) update.active = parseBool(active) ?? current.active;

  if (address !== undefined) {
    if (!String(address).trim()) throw new ClientError('La dirección no puede estar vacía', 400);
    update.address = beautifyAddress(address);
  }

  if (phone !== undefined) update.phone = phone || '';

  if (province !== undefined) {
    if (!isValidId(province)) throw new ClientError('province inválida', 400);
    update.province = province;
  }

  if(entity!==undefined) update.entity=entity;

  if (officeIdSesame !== undefined) update.officeIdSesame = officeIdSesame || null;

  if (coordinates !== undefined) {
    const parsedCoordinates = parseCoordinates(coordinates);
    if (parsedCoordinates === undefined) throw new ClientError('Coordenadas inválidas', 400);
    update.coordinates = parsedCoordinates;
  }

  if (resolvedAddress !== undefined) {
    if (resolvedAddress === null) {
      unset.resolvedAddress = '';
    } else {
      update.resolvedAddress = {
        ...(current.resolvedAddress?.toObject?.() || current.resolvedAddress || {}),
        ...resolvedAddress,
        city: resolvedAddress.city ? toTitleCase(resolvedAddress.city) : resolvedAddress.city || null,
        resolvedAt: resolvedAddress.resolvedAt || new Date(),
      };
    }
  }

  const nextAddress = update.address !== undefined ? update.address : current.address;
  const nextProvince = update.province !== undefined ? update.province : current.province;
  const nextResolvedAddress = update.resolvedAddress !== undefined
    ? update.resolvedAddress
    : unset.resolvedAddress !== undefined
      ? null
      : current.resolvedAddress;

  if (address !== undefined || province !== undefined || resolvedAddress !== undefined) {
    update.name = await buildWorkplaceName({
      address: nextAddress,
      resolvedAddress: nextResolvedAddress,
      province: nextProvince,
    });
  }

  if (cronology !== undefined) {
    if (!type || !['add', 'delete', 'edit'].includes(type)) {
      throw new ClientError('Falta el tipo o es inválido para cronology', 400);
    }

    if (type === 'add') updateObj.$addToSet = { cronology };

    if (type === 'delete') {
      if (!cronology._id) throw new ClientError('Falta _id para eliminar cronology', 400);
      updateObj.$pull = { cronology: { _id: cronology._id } };
    }

    if (type === 'edit') {
      if (!cronology._id) throw new ClientError('Falta _id para editar cronology', 400);
      query['cronology._id'] = cronology._id;
      updateObj.$set = { 'cronology.$': cronology };
    }
  }

  if (Object.keys(update).length) {
    updateObj.$set = { ...(updateObj.$set || {}), ...update };
  }

  if (Object.keys(unset).length) {
    updateObj.$unset = unset;
  }

  const wantsSesameOffice = createSesameOffice === true || createSesameOffice === 'true';

if (!Object.keys(updateObj).length && !wantsSesameOffice) {
  throw new ClientError('No hay datos para actualizar', 400);
}

  let updated;

  try {
    updated = await Workplace.findOneAndUpdate(query, updateObj, {
      new: true,
      runValidators: true,
    }).populate('province', 'name');
  } catch (err) {
    if (isDupKey(err)) {
      throw new ClientError('Ya existe un centro de trabajo con ese nombre en esa provincia', 409);
    }

    throw err;
  }

  const shouldSyncSesameOffice = wantsSesameOffice || !!updated.officeIdSesame || active === false || active === 'false';

  if (shouldSyncSesameOffice) {
    await syncSesameOfficeForWorkplace(updated._id);
    updated = await Workplace.findById(updated._id).populate('province', 'name');
  }

  response(res, 200, updated);
};

/**
 * Elimina un centro de trabajo si no tiene dispositivos asociados.
 */
const deleteWorkplace = async (req, res) => {
  const { workplaceId } = req.body;

  if (!workplaceId) {
    throw new ClientError('Falta workplaceId', 400);
  }

  const workplace = await Workplace.findById(workplaceId);
  if (!workplace) {
    throw new ClientError('Centro de trabajo no encontrado', 404);
  }

  const dispositivesUsingWorkplace = await Dispositive.countDocuments({ workplaces: workplaceId });

  if (dispositivesUsingWorkplace > 0) {
    throw new ClientError('No se puede eliminar el centro porque está vinculado a uno o varios dispositivos', 400);
  }

  if (workplace.officeIdSesame) {
    await deleteSesameOfficeForWorkplace(workplaceId);
  }

  await Workplace.deleteOne({ _id: workplaceId });

  response(res, 200, { ok: true, workplaceId });
};

/**
 * Vincula un centro de trabajo a un dispositivo.
 */
const addWorkplaceToDispositive = async (req, res) => {
  const { dispositiveId, workplaceId } = req.body;

  if (!dispositiveId) throw new ClientError('Falta dispositiveId', 400);
  if (!workplaceId) throw new ClientError('Falta workplaceId', 400);
  if (!isValidId(dispositiveId)) throw new ClientError('dispositiveId inválido', 400);
  if (!isValidId(workplaceId)) throw new ClientError('workplaceId inválido', 400);

  const [dispositive, workplace] = await Promise.all([
    Dispositive.findById(dispositiveId),
    Workplace.findById(workplaceId),
  ]);

  if (!dispositive) throw new ClientError('Dispositivo no encontrado', 404);
  if (!workplace) throw new ClientError('Centro de trabajo no encontrado', 404);

  const updated = await Dispositive.findByIdAndUpdate(
    dispositiveId,
    { $addToSet: { workplaces: workplaceId } },
    { new: true }
  )
    .populate('workplaces')
    .populate('program', 'name acronym area _id')
    .populate('province', 'name');

  if (workplace.officeIdSesame) {
    await syncSesameOfficeForWorkplace(workplaceId);
  }

  response(res, 200, updated);
};

/**
 * Desvincula un centro de trabajo de un dispositivo.
 */
const removeWorkplaceFromDispositive = async (req, res) => {
  const { dispositiveId, workplaceId } = req.body;

  if (!dispositiveId) throw new ClientError('Falta dispositiveId', 400);
  if (!workplaceId) throw new ClientError('Falta workplaceId', 400);
  if (!isValidId(dispositiveId)) throw new ClientError('dispositiveId inválido', 400);
  if (!isValidId(workplaceId)) throw new ClientError('workplaceId inválido', 400);

  const updated = await Dispositive.findByIdAndUpdate(
    dispositiveId,
    { $pull: { workplaces: workplaceId } },
    { new: true }
  )
    .populate('workplaces')
    .populate('program', 'name acronym area _id')
    .populate('province', 'name');

  if (!updated) {
    throw new ClientError('Dispositivo no encontrado', 404);
  }

  const workplace = await Workplace.findById(workplaceId).select('officeIdSesame').lean();
  if (workplace?.officeIdSesame) {
    await syncSesameOfficeForWorkplace(workplaceId);
  }

  response(res, 200, updated);
};

/**
 * Lista dispositivos vinculados a un centro de trabajo.
 */
const listDispositivesByWorkplace = async (req, res) => {
  const { workplaceId, active } = req.body;

  if (!workplaceId) throw new ClientError('Falta workplaceId', 400);
  if (!isValidId(workplaceId)) throw new ClientError('workplaceId inválido', 400);

  const filters = { workplaces: workplaceId };
  const parsedActive = parseBool(active);

  if (parsedActive !== undefined) {
    filters.active = parsedActive;
  }

  const dispositives = await Dispositive.find(filters)
    .populate('program', 'name acronym area _id')
    .populate('province', 'name')
    .sort({ name: 1 })
    .lean();

  response(res, 200, dispositives);
};

//BORRAR

module.exports = {
  createWorkplace: catchAsync(createWorkplace),
  listWorkplaces: catchAsync(listWorkplaces),
  getWorkplaceId: catchAsync(getWorkplaceId),
  updateWorkplace: catchAsync(updateWorkplace),
  deleteWorkplace: catchAsync(deleteWorkplace),
  addWorkplaceToDispositive: catchAsync(addWorkplaceToDispositive),
  removeWorkplaceFromDispositive: catchAsync(removeWorkplaceFromDispositive),
  listDispositivesByWorkplace: catchAsync(listDispositivesByWorkplace),
};