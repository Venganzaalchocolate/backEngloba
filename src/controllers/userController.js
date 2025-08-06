const { User, Program } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { validateRequiredFields, createAccentInsensitiveRegex } = require('../utils/utils');
const { uploadFileToDrive, getFileById, deleteFileById, gestionAutomaticaNominas, obtenerCarpetaContenedora } = require('./googleController');
const { getFileCv } = require('./ovhController');
const { createUserWS, deleteUserByEmailWS, addUserToGroup, deleteMemeberAllGroups } = require('./workspaceController');




// Capitaliza cada palabra de un string
function toTitleCase(str) {
  return str
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Función para convertir IDs dentro de los datos de contratación
const convertIds = (hirings) => {
  return hirings.map(hiring => {
    // Validar y convertir position._id
    if (!hiring.position) {
      throw new ClientError('El campo position._id es requerido', 400);
    }
    hiring.position = new mongoose.Types.ObjectId(hiring.position);
    if (!!hirings.selectionProcess) hiring.selectionProcess = new mongoose.Types.ObjectId(hiring.selectionProcess);

    // Validar y convertir device.id
    if (!hiring.device) {
      throw new ClientError('El campo device.id es requerido', 400);
    }
    hiring.device = new mongoose.Types.ObjectId(hiring.device);

    // Validar y convertir leavePeriods.leaveType.id
    if (Array.isArray(hiring.leavePeriods)) {
      hiring.leavePeriods = hiring.leavePeriods.map(period => {
        if (!period.leaveType || !period.leaveType) {
          throw new ClientError('El campo leaveType es requerido en leavePeriods', 400);
        }
        period.leaveType = new mongoose.Types.ObjectId(period.leaveType);
        return period;
      });
    } else {
      hiring.leavePeriods = []; // Manejar el caso en el que leavePeriods no sea un array
    }

    return hiring;
  });
};

const parseField = (field, fieldName) => {
  // Si ya es un array, retornarlo directamente
  if (Array.isArray(field)) return field;

  try {
    const parsedField = JSON.parse(field);
    if (Array.isArray(parsedField)) {
      return parsedField;
    } else {
      throw new Error(`${fieldName} debe ser un array.`);
    }
  } catch (error) {
    throw new ClientError(`Error al procesar ${fieldName}`, 400);
  }
};

const postCreateUser = async (req, res) => {
  const requiredFields = [
    'dni',
    'firstName',
    'lastName',
    'email',
    'phone',
    'hiringPeriods',
    'role',
    'gender',
    'birthday'
  ];

  const {
    dni,
    firstName,
    lastName,
    email,
    phone,
    hiringPeriods,
    employmentStatus = "en proceso de contratación",
    role,
    notes,
    disability,
    fostered,
    gender,
    apafa,
    studies,
    birthday,
    phoneJobNumber,
    phoneJobExtension
  } = req.body;

  validateRequiredFields(req.body, requiredFields);

  // Procesar el objeto de hiring
  const newHiring = convertIds(hiringPeriods)[0];


  // Si newHiring.reason existe y tiene la propiedad dni, se busca el usuario por ese dni
  if (newHiring.reason && newHiring.reason.dni) {
    const replacementUser = await User.findOne({
      dni: { $regex: `^${newHiring.reason.dni.trim()}$`, $options: 'i' }
    });

    if (!replacementUser) {
      throw new ClientError("El trabajador al que sustituye no existe", 400);
    }

    let cause = undefined;
    let startLeaveDate = undefined;
    let expectedEndLeaveDate = undefined;

    // Buscar el hiringPeriod activo con leavePeriods
    const activeHiringPeriod = replacementUser.hiringPeriods.find(period =>
      period.active &&
      period.leavePeriods &&
      period.leavePeriods.length > 0
    );

    if (activeHiringPeriod) {
      // Buscar el leavePeriod activo dentro del hiringPeriod
      const activeLeavePeriod = activeHiringPeriod.leavePeriods.find(lp => lp.active);

      if (activeLeavePeriod) {
        cause = activeLeavePeriod.leaveType;
        startLeaveDate = activeLeavePeriod.startLeaveDate;
        expectedEndLeaveDate = activeLeavePeriod.expectedEndLeaveDate;
      }
    }

    // Ahora construimos siempre el reason completo, con o sin leave info
    newHiring.reason = {
      replacement: true,
      user: replacementUser._id,
      notes: {
        nameUser: `${replacementUser.firstName || ''} ${replacementUser.lastName || ''}`.trim(),
        dniUser: replacementUser.dni.replace(/\s+/g, ""),
        ...(cause && { cause }),
        ...(startLeaveDate && { startLeaveDate }),
        ...(expectedEndLeaveDate && { expectedEndLeaveDate })
      }
    };
  }


  // Construir objeto userData
  const userData = {
    dni: dni.replace(/\s+/g, "").trim().toUpperCase(),
    role,
    firstName: toTitleCase(firstName), // Capitalizar
    lastName: toTitleCase(lastName),   // Capitalizar
    email_personal: email.toLowerCase(),       // Convertir a minúsculas
    phone,
    hiringPeriods: newHiring,
    dispositiveNow: newHiring,
    employmentStatus,
    notes,
    gender
  };



  if (!!birthday) {
    const parsedDate = new Date(birthday);
    if (isNaN(parsedDate)) {
      throw new ClientError(`Fecha de nacimiento no válida`, 400);
    } else {
      userData.birthday = parsedDate;
    }
  }


  // Manejar disability
  if (disability) {
    userData.disability = disability;
  }

  // Manejar fostered
  if (fostered === "si") {
    userData.fostered = true;
  } else if (fostered === "no") {
    userData.fostered = false;
  }

  if (apafa === "si") {
    userData.apafa = true;
  } else if (fostered === "no") {
    userData.apafa = false;
  }


  if (req.body.studies) {
    userData.studies = parseField(studies, 'studies').map((s) => new mongoose.Types.ObjectId(s));
  }

  if (phoneJobNumber || phoneJobExtension) {
    userData.phoneJob = {};
    if (phoneJobNumber) userData.phoneJob.number = phoneJobNumber;
    if (phoneJobExtension) userData.phoneJob.extension = phoneJobExtension;
  }

  let newUser = {}
  try {
    // Intentar crear el usuario
    newUser = await User.create(userData)


    // Responder con el usuario guardado

  } catch (error) {
    // Si se produce un error de índice duplicado (por campo único)
    if (error.code === 11000) {
      // error.keyValue tiene la forma: { email: 'valor', dni: 'valor', etc. }
      const [[dupField, dupValue]] = Object.entries(error.keyValue);
      throw new ClientError(
        `'${dupValue}' está duplicado, no se pudo crear el usuario, ya que debe ser único`,
        400
      );
    }
    // Cualquier otro error
    throw new ClientError('Error al crear el usuario', 500);
  }

  try {
    // crear usuario en workspace
    const userWorkspace = await createUserWS(newUser._id)

    // guardar el email corporativo en el usuario
    if (userWorkspace?.email) {
      newUser.email = userWorkspace?.email;
      const userNow = await newUser.save()
      const deviceId = newHiring.device
      const program = await Program
        .findOne({ 'devices._id': deviceId }, { 'devices.$': 1, _id: 0 })
        .lean();


      const groupWorkspaceId = program?.devices?.[0]?.groupWorkspace; // <-- solo el id
      const addGroupInW = addUserToGroup(userNow._id, groupWorkspaceId)
    }
  } catch (error) {
    console.error(error)
  }
  response(res, 200, newUser);
};


const getUsers = async (req, res) => {
  if (!req.body.page || !req.body.limit) throw new ClientError("Faltan datos no son correctos", 400);

  const page = parseInt(req.body.page) || 1;
  const limit = parseInt(req.body.limit) || 10;
  const filters = {};
  const programs = await Program.find().select('name _id devices.name devices._id devices.province');

  if (req.body.firstName) {
    const nameRegex = createAccentInsensitiveRegex(req.body.firstName);
    filters["firstName"] = { $regex: nameRegex };
  }
  if (req.body.lastName) {
    const nameRegex = createAccentInsensitiveRegex(req.body.lastName);
    filters["lastName"] = { $regex: nameRegex };
  }


  if (req.body.email) filters["email"] = { $regex: req.body.email, $options: 'i' };
  if (req.body.phone) filters["phone"] = { $regex: req.body.phone, $options: 'i' };
  if (req.body.dni) filters["dni"] = { $regex: req.body.dni, $options: 'i' };
  if (req.body.gender) filters["gender"] = req.body.gender;
  if (req.body.fostered === "si") filters["fostered"] = true;
  if (req.body.fostered === "no") filters["fostered"] = false;
  if (req.body.apafa === "si") filters["apafa"] = true;
  if (req.body.apafa === "no") filters["apafa"] = false;
  if (req.body.disability !== undefined) {
    if (req.body.disability === "si") {
      filters["disability.percentage"] = { $gt: 0 };
    } else if (req.body.disability === "no") {
      filters["disability.percentage"] = 0;
    }
  }

  /* ─────────── FILTRO POR ESTADO ─────────── */
  if (req.body.status) {
    if (req.body.status === 'total') {
      // «total» = activo  ∪  en proceso de contratación
      filters.employmentStatus = {
        $in: ['activo', 'en proceso de contratación']
      };
    } else {
      // cualquier otro valor se filtra tal cual
      filters.employmentStatus = req.body.status;
    }
  }


  //----------
  // (1) Función para intersectar dos arrays de strings rápidamente
  function intersectArrays(arr1, arr2) {
    if (!arr1 || !arr2) return [];
    const set1 = new Set(arr1);
    return arr2.filter(id => set1.has(id));
  }

  // Imaginemos que ya cargaste 'programs' de la BD:
  // const programs = await Program.find().select('name _id devices.name devices._id devices.province');

  let deviceIdsFromProvinces = null;
  let deviceIdsFromProgram = null;
  // Filtrar por 'provinces'
  if (req.body.provinces && mongoose.Types.ObjectId.isValid(req.body.provinces)) {
    deviceIdsFromProvinces = [];
    programs.forEach(program => {
      program.devices.forEach(device => {
        // Convertimos a string para comparar con mayor seguridad
        if (String(device.province) === String(req.body.provinces)) {
          deviceIdsFromProvinces.push(String(device._id));
        }
      });
    });
  }

  // Filtrar por 'programId'
  if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
    const program = programs.find(pr => String(pr._id) === String(req.body.programId));
    if (!program) throw new ClientError("Programa no encontrado", 404);

    deviceIdsFromProgram = program.devices.map(device => String(device._id));
  }

  // (2) Calculamos la intersección para que sea un AND
  //     - Si ambas listas existen -> intersect
  //     - Si solo una existe -> esa
  //     - Si ninguna existe -> no filtramos por device
  let finalDeviceIds = null;

  if (deviceIdsFromProvinces && deviceIdsFromProgram) {
    finalDeviceIds = intersectArrays(deviceIdsFromProvinces, deviceIdsFromProgram);
  } else if (deviceIdsFromProvinces) {
    finalDeviceIds = deviceIdsFromProvinces;
  } else if (deviceIdsFromProgram) {
    finalDeviceIds = deviceIdsFromProgram;
  }

  // (3) Filtrar por 'position' (si existe)
  //     También es un ObjectId en tu PeriodSchema, así que lo convertimos
  let positionId = null;
  if (req.body.position && mongoose.Types.ObjectId.isValid(req.body.position)) {
    positionId = req.body.position; // Podrías transformarla con new ObjectId(...)
  }


  // - Caso 1: Filtramos por device Y position en el mismo subdocumento
  if (finalDeviceIds && positionId) {
    filters.dispositiveNow = {
      $elemMatch: {
        device: { $in: finalDeviceIds.map(id => new mongoose.Types.ObjectId(id)) },
        position: new mongoose.Types.ObjectId(positionId)
      }
    };

    // - Caso 2: Solo device
  } else if (finalDeviceIds) {
    // Para que sea en cualquier subdocumento de 'dispositiveNow', basta con:
    filters["dispositiveNow.device"] = {
      $in: finalDeviceIds.map(id => new mongoose.Types.ObjectId(id))
    };

    // - Caso 3: Solo position
  } else if (positionId) {
    filters["dispositiveNow.position"] = new mongoose.Types.ObjectId(positionId);
  }
  //-----

  if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
    filters["dispositiveNow.device"] = new mongoose.Types.ObjectId(req.body.dispositive);
  }

  const totalDocs = await User.countDocuments(filters);
  const totalPages = Math.ceil(totalDocs / limit);
  const users = await User.find(filters)
    .populate({
      path: 'files.filesId',  // Asegúrate de que este path coincida con tu esquema
      model: 'Filedrive',       // Nombre del modelo de Filedrive
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  response(res, 200, { users: users, totalPages });
};

// xsl

const buildFilters = (req, programs) => {
  const filters = {};

  // Filtros de texto
  if (req.body.firstName) {
    filters.firstName = { $regex: new RegExp(req.body.firstName, 'i') };
  }
  if (req.body.lastName) {
    filters.lastName = { $regex: new RegExp(req.body.lastName, 'i') };
  }
  if (req.body.email) {
    filters.email = { $regex: req.body.email, $options: 'i' };
  }
  if (req.body.phone) {
    filters.phone = { $regex: req.body.phone, $options: 'i' };
  }
  if (req.body.dni) {
    filters.dni = { $regex: req.body.dni, $options: 'i' };
  }
  if (req.body.status) {
    filters.employmentStatus = req.body.status;
  }
  if (req.body.gender) {
    filters.gender = req.body.gender;
  }

  // Filtros booleanos
  if (req.body.fostered === 'si') filters.fostered = true;
  if (req.body.fostered === 'no') filters.fostered = false;
  if (req.body.apafa === 'si') filters.apafa = true;
  if (req.body.apafa === 'no') filters.apafa = false;

  // Filtro de discapacidad
  if (req.body.disability !== undefined) {
    if (req.body.disability === 'si') {
      filters['disability.percentage'] = { $gt: 0 };
    } else if (req.body.disability === 'no') {
      filters['disability.percentage'] = 0;
    }
  }

  // Filtro por programId => se buscan las devices de ese programa
  if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
    const program = programs.find(
      (pr) => pr._id.toString() === req.body.programId
    );
    if (!program) {
      throw new ClientError('Programa no encontrado', 404);
    }
    filters.dispositiveNow = {
      $in: program.devices.map((device) => device._id),
    };
  }

  // Filtro directo por dispositive (deviceId)
  if (
    req.body.dispositive &&
    mongoose.Types.ObjectId.isValid(req.body.dispositive)
  ) {
    filters.dispositiveNow = req.body.dispositive;
  }

  return filters;
};


const getAllUsersWithOpenPeriods = async (req, res) => {
  
  const filters = {};
  const programs = await Program.find().select('name _id devices.name devices._id');

  if (req.body.firstName) {
    const nameRegex = createAccentInsensitiveRegex(req.body.firstName);
    filters["firstName"] = { $regex: nameRegex };
  }

  
  if (req.body.lastName) {
    const nameRegex = createAccentInsensitiveRegex(req.body.lastName);
    filters["lastName"] = { $regex: nameRegex };
  }


  if (req.body.email) filters["email"] = { $regex: req.body.email, $options: 'i' };
  if (req.body.phone) filters["phone"] = { $regex: req.body.phone, $options: 'i' };
  if (req.body.dni) filters["dni"] = { $regex: req.body.dni, $options: 'i' };
  
  if (req.body.gender) filters["gender"] = req.body.gender;
  if (req.body.fostered === "si") filters["fostered"] = true;
  if (req.body.fostered === "no") filters["fostered"] = false;
  if (req.body.apafa === "si") filters["apafa"] = true;
  if (req.body.apafa === "no") filters["apafa"] = false;
  if (req.body.disability !== undefined) {
    if (req.body.disability === "si") {
      filters["disability.percentage"] = { $gt: 0 };
    } else if (req.body.disability === "no") {
      filters["disability.percentage"] = 0;
    }
  }

if (req.body.status) {
  if (req.body.status === 'total') {
    filters.employmentStatus = { $in: ['activo', 'en proceso de contratacion'] };
  } else {
    filters.employmentStatus = req.body.status;
  }
}

  //----------
  // (1) Función para intersectar dos arrays de strings rápidamente
  function intersectArrays(arr1, arr2) {
    if (!arr1 || !arr2) return [];
    const set1 = new Set(arr1);
    return arr2.filter(id => set1.has(id));
  }

  // Imaginemos que ya cargaste 'programs' de la BD:
  // const programs = await Program.find().select('name _id devices.name devices._id devices.province');

  let deviceIdsFromProvinces = null;
  let deviceIdsFromProgram = null;
  // Filtrar por 'provinces'
  if (req.body.provinces && mongoose.Types.ObjectId.isValid(req.body.provinces)) {
    deviceIdsFromProvinces = [];
    programs.forEach(program => {
      program.devices.forEach(device => {
        // Convertimos a string para comparar con mayor seguridad
        if (String(device.province) === String(req.body.provinces)) {
          deviceIdsFromProvinces.push(String(device._id));
        }
      });
    });
  }

  // Filtrar por 'programId'
  if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
    const program = programs.find(pr => String(pr._id) === String(req.body.programId));
    if (!program) throw new ClientError("Programa no encontrado", 404);

    deviceIdsFromProgram = program.devices.map(device => String(device._id));
  }

  // (2) Calculamos la intersección para que sea un AND
  //     - Si ambas listas existen -> intersect
  //     - Si solo una existe -> esa
  //     - Si ninguna existe -> no filtramos por device
  let finalDeviceIds = null;

  if (deviceIdsFromProvinces && deviceIdsFromProgram) {
    finalDeviceIds = intersectArrays(deviceIdsFromProvinces, deviceIdsFromProgram);
  } else if (deviceIdsFromProvinces) {
    finalDeviceIds = deviceIdsFromProvinces;
  } else if (deviceIdsFromProgram) {
    finalDeviceIds = deviceIdsFromProgram;
  }

  // (3) Filtrar por 'position' (si existe)
  //     También es un ObjectId en tu PeriodSchema, así que lo convertimos
  let positionId = null;
  if (req.body.position && mongoose.Types.ObjectId.isValid(req.body.position)) {
    positionId = req.body.position; // Podrías transformarla con new ObjectId(...)
  }


  // - Caso 1: Filtramos por device Y position en el mismo subdocumento
  if (finalDeviceIds && positionId) {
    filters.dispositiveNow = {
      $elemMatch: {
        device: { $in: finalDeviceIds.map(id => new mongoose.Types.ObjectId(id)) },
        position: new mongoose.Types.ObjectId(positionId)
      }
    };

    // - Caso 2: Solo device
  } else if (finalDeviceIds) {
    // Para que sea en cualquier subdocumento de 'dispositiveNow', basta con:
    filters["dispositiveNow.device"] = {
      $in: finalDeviceIds.map(id => new mongoose.Types.ObjectId(id))
    };

    // - Caso 3: Solo position
  } else if (positionId) {
    filters["dispositiveNow.position"] = new mongoose.Types.ObjectId(positionId);
  }
  //-----

  if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
    filters["dispositiveNow.device"] = new mongoose.Types.ObjectId(req.body.dispositive);
  }


 
  const users = await User.find(filters).sort({ createdAt: -1 })

  const processedUsers = users.map(user => {
    // Si user es un documento de Mongoose, conviene convertirlo a objeto JS plano:
    // const plainUser = user.toObject();

    // O si prefieres clonar con spread, debes considerar user._doc en Mongoose:
    const plainUser = { ...user._doc };

    // Sobrescribimos el array "hiringPeriods", filtrando
    if (plainUser.hiringPeriods) {
      plainUser.hiringPeriods = plainUser.hiringPeriods.filter(hp =>
        (hp.endDate === null || hp.endDate === undefined) && hp.active
      );
    }

    // Devolvemos el objeto modificado
    return plainUser;
  });

  response(res, 200, { users: processedUsers });
};



//

const getUsersFilter = async (req, res) => {
  const filter = { name: { $regex: `.*${req.body.name}.*` } }
  // Utiliza el método find() de Mongoose para obtener todos los documentos en la colección
  const usuarios = await User.find(filter);
  // Responde con la lista de usuarios y código de estado 200 (OK)
  response(res, 200, usuarios);
}

//busca un usuario por ID
const getUserID = async (req, res) => {
  // Obtén el ID del parámetro de la solicitud
  const id = req.body.id;
  // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
  // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
  const usuario = await User.findById(id).populate({
    path: 'files.filesId',  // Asegúrate de que este path coincida con tu esquema
    model: 'Filedrive',       // Nombre del modelo de Filedrive
  }).catch(error => { throw new ClientError('Usuario no encontrado', 404) });
  // Responde con el usuario encontrado y código de estado 200 (OK)
  response(res, 200, usuario);
}

//busca un usuario por ID
const getUserName = async (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ClientError('Debes proporcionar una lista de IDs válida', 400);
  }

  // Eliminar duplicados
  const uniqueIds = Array.from(new Set(ids));


  // Buscar documentos
  const users = await User.find(
    { _id: { $in: uniqueIds } },
    { firstName: 1, lastName: 1 }
  );


  response(res, 200, users);
}




// Descargar archivos de usuario
const getFileUser = async (req, res) => {
  const userId = req.body.id; // ID del usuario
  const fileId = req.body.idFile; // ID del archivo en Google Drive

  // Buscar al usuario y verificar que el archivo existe en el array files
  const user = await User.findOne({
    _id: userId,
    'files.fileName': fileId, // Cambia fileName si el campo es diferente
  });


  if (!user) {
    throw new ClientError('Usuario no encontrado', 404);
  }


  const { file, stream } = await getFileById(fileId);

  if (!stream) {
    throw new ClientError('Archivo no encontrado en Google Drive', 404);
  }

  // Cabeceras
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.name}"`
  );
  res.setHeader('Content-Type', file.mimeType);

  // Envías el contenido "en streaming"
  stream.pipe(res);
};

const UserDeleteId = async (req, res) => {

  try {
    const id = req.body.id;

    // 1. Buscar el usuario en la base de datos
    const userToDelete = await User.findById(id);
    if (!userToDelete) {
      return response(res, 404, { success: false, message: "Usuario no encontrado" });
    }

    // 2. Recolectar los IDs de archivos de Drive que necesitas eliminar
    const driveFileIds = [];

    // Archivos en la propiedad "files"
    if (userToDelete.files && userToDelete.files.length > 0) {
      userToDelete.files.forEach((fileObj) => {
        driveFileIds.push(fileObj.fileName);
      });
    }

    // Archivos en la propiedad "payrolls"
    if (userToDelete.payrolls && userToDelete.payrolls.length > 0) {
      userToDelete.payrolls.forEach((payrollObj) => {
        driveFileIds.push(payrollObj.pdf);
      });
    }

    // 3. Borrar en Drive secuencialmente
    //    - Si algo falla en medio, lanzamos error y NO eliminamos al usuario en la BD
    for (const fileId of driveFileIds) {
      const deleteResult = await deleteFileById(fileId); // tu función que llama a drive.files.delete
      if (!deleteResult.success) {
        // Lanzamos un error para frenar todo el proceso
        throw new Error(`Error al eliminar archivo ${fileId} en Drive: ${deleteResult.message}`);
      }
    }

    if(!!userToDelete.email) await deleteUserByEmailWS(userToDelete.email);
    const messageDelete = await User.deleteOne({ _id: id });
    response(res, 200, messageDelete);
  } catch (error) {
    response(res, 200, error.message);
  }


};




const userPut = async (req, res) => {
  const files = req.files;

  if (!req.body._id) {
    throw new ClientError('El ID de usuario es requerido', 400);
  }
  // Inicializar el objeto de actualización
  let updateFields = {};

   if (req.body.employmentStatus){
    const userAux = await User
    .findById(req.body._id)
    .select({ firstName: 1, lastName: 1, email: 1, dispositiveNow: 1})
    if(req.body.employmentStatus=='ya no trabaja con nosotros' && userAux.dispositiveNow.length>0) throw new ClientError(`Para cambiar el estado laboral a "Ya no trabaja con nosotros" se deben cerrar todos los periodos de contratación`, 400);
    if(req.body.employmentStatus=='ya no trabaja con nosotros'){
      await deleteUserByEmailWS(userAux.email)
      updateFields.email=''
      updateFields.employmentStatus='ya no trabaja con nosotros'
    } else {
      if (!userAux.email){
        updateFields.employmentStatus=req.body.employmentStatus
        const created =await createUserWS(userAux._id)
        updateFields.email = created.email;
      }
    }

   }




  if (req.body.vacationDays) {
    updateFields.vacationDays = parseField(req.body.vacationDays, 'vacationDays').map((date) => {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) throw new ClientError(`Fecha no válida en vacationDays: ${date}`, 400);
      return parsedDate;
    });
  }

  if (req.body.personalDays) {
    updateFields.personalDays = parseField(req.body.personalDays, 'personalDays').map((date) => {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) throw new ClientError(`Fecha no válida en personalDays: ${date}`, 400);
      return parsedDate;
    });
  }

  updateFields = {
    ...updateFields,
  };

  if (req.body.firstName) updateFields.firstName = toTitleCase(req.body.firstName);  // Capitalizamos el firstName

  if (req.body.lastName) updateFields.lastName = toTitleCase(req.body.lastName);
  if (req.body.email_personal) updateFields.email_personal = req.body.email_personal.toLowerCase();
  if (req.body.role) updateFields.role = req.body.role;
  if (req.body.phone) updateFields.phone = req.body.phone;
  if (req.body.dni) updateFields.dni = req.body.dni.replace(/\s+/g, "").trim().toUpperCase();
  if (req.body.employmentStatus) updateFields.employmentStatus = req.body.employmentStatus;
  if (req.body.socialSecurityNumber) updateFields.socialSecurityNumber = req.body.socialSecurityNumber;
  if (req.body.bankAccountNumber) updateFields.bankAccountNumber = req.body.bankAccountNumber;

  if (req.body.disPercentage) updateFields.disability = {
    percentage: req.body.disPercentage
  };


  if (req.body.birthday) {
    const parsedDate = new Date(req.body.birthday);
    if (isNaN(parsedDate)) {
      throw new ClientError(`Fecha de nacimiento no válida`, 400);
    } else {
      updateFields.birthday = parsedDate;
    }
  }


  if (req.body.disNotes) updateFields.disability.notes = req.body.disNotes;
  if (req.body.gender) updateFields.gender = req.body.gender;
  if (req.body.fostered === "si") {
    updateFields.fostered = true;
  } else if (req.body.fostered === "no") {
    updateFields.fostered = false;
  }

  if (req.body.apafa === "si") {
    updateFields.apafa = true;
  } else if (req.body.apafa === "no") {
    updateFields.apafa = false;
  }

  if (req.body.consetmentDataProtection === "si") {
    updateFields.consetmentDataProtection = true;
  } else if (req.body.consetmentDataProtection === "no") {
    updateFields.consetmentDataProtection = false;
  }


  if (req.body.studies) {
    updateFields.studies = parseField(req.body.studies, 'studies').map((s) => new mongoose.Types.ObjectId(s));
  }



  if (req.body.phoneJobNumber || req.body.phoneJobExtension) {
    updateFields.phoneJob = {};
    if (req.body.phoneJobNumber) updateFields.phoneJob.number = req.body.phoneJobNumber;
    if (req.body.phoneJobExtension) updateFields.phoneJob.extension = req.body.phoneJobExtension;
  }


  



  if (files && files.length > 0) {  
    const folderId = process.env.GOOGLE_DRIVE_APPFILE;
    // Obtener los archivos existentes en la base de datos
  const user = await User.findById(req.body._id).select('files');
  const existingFiles = user.files || [];
    const newFiles = []; // Array para almacenar los nuevos archivos procesados

    for (const file of files) {
      const uniqueFileName = `${req.body._id}-${file.fieldname}.pdf`;
      const fileTag = file.fieldname;
      const description = `Archivo subido para ${fileTag}`;
      const nameDateFile = file.fieldname + '-date';
      let date = null;

      if (req.body[nameDateFile]) {
        const timestamp = Date.parse(req.body[nameDateFile]);
        if (!isNaN(timestamp)) date = new Date(req.body[nameDateFile]);
      }

      try {
        // Subir el archivo a Google Drive
        const fileDriveData = await uploadFileToDrive(file, folderId, uniqueFileName);
        // Agregar el archivo al array de nuevos archivos
        newFiles.push({
          fileName: fileDriveData.id,
          fileTag,
          description,
          date,
        });
      } catch (error) {
        throw new ClientError(`Error al procesar el archivo ${file.fieldname}`, 500);
      }
    }

    // Combinar los archivos existentes con los nuevos
    const combinedFiles = [
      ...existingFiles.filter((file) => !newFiles.some((newFile) => newFile.fileTag === file.fileTag)),
      ...newFiles,
    ];

    updateFields.files = combinedFiles;
  }

  // Realizar la actualización en la base de datos
  try {
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.body._id },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate({
      path: 'files.filesId',  // Asegúrate de que este path coincida con tu esquema
      model: 'Filedrive',       // Nombre del modelo de Filedrive
    });

    response(res, 200, updatedUser);
  } catch (error) {
    console.log(error)
    // Si el error es de índice duplicado (E11000)
    if (error.code === 11000) {
      // error.keyValue es un objeto con la forma: { email: 'valor duplicado' } u otro campo
      const [[dupField, dupValue]] = Object.entries(error.keyValue);
      throw new ClientError(
        `'${dupValue}' ya existe. No se pudo actualizar el usuario ya que debe ser único.`,
        400
      );
    }

    // Otro tipo de error
    throw new ClientError('Error al actualizar el usuario', 500);
  }
};

// TODO PEDIR ARCHIVOS del usuario




const deletePayroll = async (userId, payrollId) => {
  try {
    // Verificar si la nómina existe antes de intentar eliminarla
    const user = await User.findOne(
      { _id: userId, 'payrolls._id': payrollId },
      { 'payrolls.$': 1 }// Solo traer el payroll que coincide
    );

    // Si el usuario o la nómina no existen, devolver false
    if (!user) {
      return false;
    }

    if (user.payrolls[0].sign) {
      await deleteFileById(user.payrolls[0].sign);
    }
    const deleteResponse = await deleteFileById(user.payrolls[0].pdf)
    if (deleteResponse.success) {
      const result = await User.findByIdAndUpdate(
        userId,
        { $pull: { payrolls: { _id: payrollId } } },
        { new: true }
      ).populate({
        path: 'files.filesId',  // Asegúrate de que este path coincida con tu esquema
        model: 'Filedrive',       // Nombre del modelo de Filedrive
      });

      return result;
    } else {
      return false
    }



  } catch (error) {
    console.log(error)
    return false;
  }
};



const createPayroll = async (idUser, file, payrollYear, payrollMonth) => {
  try {
    const userAux = await User.findById(idUser);
    if (!userAux) {
      throw new Error('Usuario no encontrado');
    }
    // Formatear el nombre del archivo
    const fileNameAux = `${userAux.dni}_${payrollMonth}_${payrollYear}.pdf`;

    const folderId = process.env.GOOGLE_DRIVE_NUEVAS_NOMINAS;
    // Subir archivo a Google Drive
    const fileAux = await uploadFileToDrive(file, folderId, fileNameAux, true);

    if (fileAux) {
      const gestionado = await gestionAutomaticaNominas();
      if (gestionado) {
        return await User.findById(idUser).populate({
          path: 'files.filesId',  // Asegúrate de que este path coincida con tu esquema
          model: 'Filedrive',       // Nombre del modelo de Filedrive
        });
      }

    } else {
      throw new Error('Error al subir el archivo a Google Drive');
    }
  } catch (error) {
    return null;
  }
};

const signPayroll = async (idUser, file, payrollYear, payrollMonth, idPayroll) => {
  try {
    const userAux = await User.findOne(
      { _id: idUser, 'payrolls._id': idPayroll },
      { dni: 1, 'payrolls.$': 1 }// Solo traer el payroll que coincide
    );

    if (!userAux || !userAux.payrolls || userAux.payrolls.length === 0) {
      return null;
    }

    const result = {
      dni: userAux.dni,
      pdf: userAux.payrolls[0].pdf
    };
    // Formatear el nombre del archivo
    const fileNameAux = `${result.dni}_${payrollMonth}_${payrollYear}_signed.pdf`;

    const folderId = await obtenerCarpetaContenedora(result.pdf);
    //
    const fileAux = await uploadFileToDrive(file, folderId, fileNameAux, true);

    if (fileAux) {
      // modificar una payroll existente añadiendo el campo firma de payrolls del usuario
      return await User.findOneAndUpdate(
        {
          _id: idUser,
          'payrolls._id': idPayroll
        },
        {
          $set: {
            'payrolls.$.sign': fileAux.id
          }
        },
        {
          new: true // Devuelve el documento actualizado
        }
      ).populate({
        path: 'files.filesId',  // Asegúrate de que este path coincida con tu esquema
        model: 'Filedrive',       // Nombre del modelo de Filedrive

      });
    } else {
      throw new Error('Error al subir el archivo a Google Drive');
    }
  } catch (error) {

    return null;
  }
};



const payroll = async (req, res) => {
  // Verificar campos generales requeridos
  if (!req.body.userId) {
    throw new ClientError('El campo userId es requerido', 400);
  }

  if (!req.body.type) {
    throw new ClientError('La acción es requerida', 400);
  }

  const id = req.body.userId;

  const file = req.file;  // El archivo puede no estar presente en algunos casos

  if (req.body.type === 'create') {
    if (!file) {
      throw new ClientError('El archivo es requerido para la creación de nóminas', 400);
    }
    const requiredFields = ['payrollYear', 'payrollMonth'];
    validateRequiredFields(req.body, requiredFields);
    const createResult = await createPayroll(id, file, req.body.payrollYear, req.body.payrollMonth);

    if (!createResult) {
      throw new ClientError('No se ha podido subir la nómina', 400);
    } else {
      return response(res, 200, createResult);
    }
  } else if (req.body.type === 'delete') {
    if (!req.body.idPayroll) {
      throw new ClientError('El campo idPayroll es requerido', 400);
    }
    const newUser = await deletePayroll(id, req.body.idPayroll);

    if (!!newUser) {
      return response(res, 200, newUser);
    } else {
      throw new ClientError('No se ha podido borrar la nómina', 404);
    }
  } else if (req.body.type === 'get') {
    if (!req.body.pdf) {
      throw new ClientError('El campo pdf es requerido', 400);
    }

    // Obtener el archivo de Google Drive
    const { file, stream } = await getFileById(req.body.pdf);

    if (!stream) {
      throw new ClientError('Archivo no encontrado en Google Drive', 404);
    }

    // Configurar los headers para la descarga
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Type', file.mimeType);

    // Enviar el archivo como un stream
    stream.pipe(res);

  } else if (req.body.type === 'sign') {
    const requiredFields = ['payrollYear', 'payrollMonth', 'idPayroll'];
    validateRequiredFields(req.body, requiredFields);
    if (!file) {
      throw new ClientError('El archivo es requerido para la firma de la nómina', 400);
    }
    const signResult = await signPayroll(id, file, req.body.payrollYear, req.body.payrollMonth, req.body.idPayroll);
    if (!signResult) {

      throw new ClientError('No se ha podido subir la nómina', 400);
    } else {

      return response(res, 200, signResult);
    }
  }
};

const changeDispositiveNow = async (user) => {
  if (!user.hiringPeriods || user.hiringPeriods.length === 0) return user;

  const activeHiringsWithoutEndDate = user.hiringPeriods.filter(
    (hp) => hp.active && !hp.endDate
  );

  // Caso: no hay hirings activos -> limpiar y eliminar de todos los grupos
  if (activeHiringsWithoutEndDate.length === 0) {
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { dispositiveNow: [] } },
      { new: true }
    );

    // fire & forget
    if(!!user.email) deleteMemeberAllGroups(user.email).catch(console.error);
    return updatedUser;
  }

  // Actualiza el campo en Mongo primero
  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id },
    { $set: { dispositiveNow: activeHiringsWithoutEndDate } },
    { new: true }
  );

  // Procesar grupos en background (no esperamos)
  (async () => {
    try {
      // 1. Quitar de todos los grupos (una sola vez)
       if(!!user.email) await deleteMemeberAllGroups(user.email);

      // 2. Obtener los groupWorkspaceId de cada dispositivo y añadir
      for (const h of activeHiringsWithoutEndDate) {
        const program = await Program.findOne(
          { active: true, 'devices._id': h.device },
          { 'devices.$': 1, _id: 0 }
        ).lean();

        const groupWorkspaceId = program?.devices?.[0]?.groupWorkspace;
        if (groupWorkspaceId) {
          await addUserToGroup(user._id, groupWorkspaceId);
        }
      }
    } catch (e) {
      console.error('Error sincronizando grupos Workspace:', e);
    }
  })();

  return updatedUser;
};




// Ejemplo: hirings.js
// Recuerda tener definidos o importados:
//  - ClientError
//  - User (modelo Mongoose)
//  - changeDispositiveNow (tu función de lógica extra)
//  - convertIds (si convierte strings a ObjectId, etc.)
//  - mongoose (si necesitas new mongoose.Types.ObjectId)
const hirings = async (req, res) => {


  if (!req.body.userId)
    throw new ClientError("Error, contacte con el administrador", 400);
  if (!req.body.type)
    throw new ClientError("Error, contacte con el administrador", 400);

  let data;
  if (req.body.type === "put") {
    if (!Array.isArray(req.body.hirings))
      throw new ClientError("Error, contacte con el administrador", 400);
    let cuerpo = convertIds(req.body.hirings);

    // Para cada período, si existe el campo reason con una propiedad dni,
    // se busca el usuario sustituto y se actualiza el campo reason.
    cuerpo = await Promise.all(
      cuerpo.map(async period => {
        if (period.reason && period.reason.dni) {
          const replacementUser = await User.findOne({
            dni: { $regex: `^${period.reason.dni.trim()}$`, $options: 'i' }
          });

          if (!replacementUser) {
            throw new ClientError("El trabajador al que sustituye no existe", 400);
          }

          let cause = undefined;
          let startLeaveDate = undefined;
          let expectedEndLeaveDate = undefined;

          const activeHiringPeriod = replacementUser.hiringPeriods.find(period =>
            period.active &&
            period.leavePeriods &&
            period.leavePeriods.length > 0
          );

          if (activeHiringPeriod) {
            const activeLeavePeriod = activeHiringPeriod.leavePeriods.find(lp => lp.active);

            if (activeLeavePeriod) {
              cause = activeLeavePeriod.leaveType;
              startLeaveDate = activeLeavePeriod.startLeaveDate;
              expectedEndLeaveDate = activeLeavePeriod.expectedEndLeaveDate;
            }
          }

          // Construir correctamente el reason actualizado
          return {
            ...period,
            reason: {
              replacement: true,
              user: replacementUser._id,
              notes: {
                nameUser: `${replacementUser.firstName || ''} ${replacementUser.lastName || ''}`.trim(),
                dniUser: replacementUser.dni.replace(/\s+/g, ""),
                ...(cause && { cause }),
                ...(startLeaveDate && { startLeaveDate }),
                ...(expectedEndLeaveDate && { expectedEndLeaveDate })
              }
            }
          };
        }
        return period; // Si no hay reason.dni, devolver tal cual
      })
    );

    const userDoc = await User.findById(req.body.userId);
    if (!userDoc) throw new ClientError("Usuario no encontrado", 404);
    const endDateExist = req.body.hirings.endDate
    if (!endDateExist) {
      const openPeriods = cuerpo.filter(
        p => !p.endDate && p.active !== false
      );
      const ftCount = openPeriods.filter(
        p => p.workShift?.type === "completa"
      ).length;
      const ptCount = openPeriods.filter(
        p => p.workShift?.type === "parcial"
      ).length;

      if (ftCount > 1)
        throw new ClientError("Máximo 1 periodo completo abierto", 400);
      if (ftCount === 1 && ptCount > 0)
        throw new ClientError("No mezclar completo con parcial abierto", 400);
      if (ptCount > 2)
        throw new ClientError("Máximo 2 periodos parciales abiertos", 400);
    }


    data = await User.findOneAndUpdate(
      { _id: req.body.userId },
      { $set: { hiringPeriods: cuerpo } },
      { new: true }
    );
    if (!data) throw new ClientError("No se pudo actualizar hirings", 400);

  } else if (req.body.type === "create") {
    if (typeof req.body.hirings !== "object" || Array.isArray(req.body.hirings))
      throw new ClientError("Error, contacte con el administrador", 400);

    const [newHiring] = convertIds([req.body.hirings]);

    // Si newHiring.reason existe y tiene la propiedad dni, se busca el usuario por ese dni

    if (newHiring.reason && newHiring.reason.dni) {
      const replacementUser = await User.findOne({
        dni: { $regex: `^${newHiring.reason.dni.trim()}$`, $options: 'i' }
      });

      if (!replacementUser) {
        throw new ClientError("El trabajador al que sustituye no existe", 400);
      }

      let cause = undefined;
      let startLeaveDate = undefined;
      let expectedEndLeaveDate = undefined;

      // Buscar el hiringPeriod activo con leavePeriods
      const activeHiringPeriod = replacementUser.hiringPeriods.find(period =>
        period.active &&
        period.leavePeriods &&
        period.leavePeriods.length > 0
      );

      if (activeHiringPeriod) {
        // Buscar el leavePeriod activo dentro del hiringPeriod
        const activeLeavePeriod = activeHiringPeriod.leavePeriods.find(lp => lp.active);

        if (activeLeavePeriod) {
          cause = activeLeavePeriod.leaveType;
          startLeaveDate = activeLeavePeriod.startLeaveDate;
          expectedEndLeaveDate = activeLeavePeriod.expectedEndLeaveDate;
        }
      }

      // Ahora construimos siempre el reason completo, con o sin leave info
      newHiring.reason = {
        replacement: true,
        user: replacementUser._id,
        notes: {
          nameUser: `${replacementUser.firstName || ''} ${replacementUser.lastName || ''}`.trim(),
          dniUser: replacementUser.dni.replace(/\s+/g, ""),
          ...(cause && { cause }),
          ...(startLeaveDate && { startLeaveDate }),
          ...(expectedEndLeaveDate && { expectedEndLeaveDate })
        }
      };
    }


    const userDoc = await User.findById(req.body.userId);
    if (!userDoc) throw new ClientError("Usuario no encontrado", 400);

    const openPeriods = userDoc.hiringPeriods.filter(
      p => !p.endDate && p.active !== false
    );
    const shiftType = newHiring?.workShift?.type;
    if (!shiftType)
      throw new ClientError("Falta el tipo de horario", 400);
    const endDateExist = req.body.hirings.endDate
    if (!endDateExist) {
      if (shiftType === "completa") {
        if (openPeriods.length > 0)
          throw new ClientError("Ya existe un periodo de contratación abierto a jornada completa, no se puede crear otro", 400);
      } else if (shiftType === "parcial") {
        if (openPeriods.some(p => p.workShift?.type === "completa"))
          throw new ClientError("Hay un periodo de contratación a jornada completa abierto, no se puede crear parcial", 400);
        if (openPeriods.filter(p => p.workShift?.type === "parcial").length >= 2)
          throw new ClientError("No se permiten más de 2 periodos de contratación con media jornada abiertos", 400);
      } else {
        throw new ClientError("Tipo de horario incorrecto", 400);
      }
    }

    data = await User.findOneAndUpdate(
      { _id: req.body.userId },
      { $push: { hiringPeriods: newHiring } },
      { new: true }
    );
    if (!data)
      throw new ClientError("No se pudo crear el periodo de contratación", 400);

  } else if (req.body.type === "createLeave") {

    if (typeof req.body.leave !== "object" || Array.isArray(req.body.leave))
      throw new ClientError("'leave' debe ser un objeto", 400);
    if (!req.body.hirindId)
      throw new ClientError("Falta el id del periodo de contratación", 400);

    const userDoc = await User.findOne({
      _id: req.body.userId,
      "hiringPeriods._id": req.body.hirindId
    });
    if (!userDoc)
      throw new ClientError("No se encontró el periodo de contratación", 400);

    const hiringPeriod = userDoc.hiringPeriods.find(
      hp => hp._id.toString() === req.body.hirindId
    );
    if (!hiringPeriod)
      throw new ClientError("No existe el periodo de contratación", 400);

    const dataAux = req.body.leave;
    if (!dataAux.startLeaveDate)
      throw new ClientError("Falta la fecha de inicio de excedencia", 400);
    dataAux.leaveType = new mongoose.Types.ObjectId(dataAux.leaveType);

    // No se puede crear otro leave si hay uno abierto
    const openLeave = hiringPeriod.leavePeriods.find(
      lp => !lp.actualEndLeaveDate && lp.active !== false
    );
    if (openLeave)
      throw new ClientError("Ya hay una excedencia o baja abierta, no de puede crear otra", 400);

    // El nuevo startLeaveDate debe ser posterior al actualEndLeaveDate del último
    const sortedLeaves = [...hiringPeriod.leavePeriods].sort(
      (a, b) => a.startLeaveDate - b.startLeaveDate
    );
    const lastLeave = sortedLeaves[sortedLeaves.length - 1];
    if (lastLeave?.actualEndLeaveDate) {
      if (new Date(dataAux.startLeaveDate) <= new Date(lastLeave.actualEndLeaveDate))
        throw new ClientError("La nueva excedencia o baja se debe iniciar después del último periodo de baja", 400);
    }

    data = await User.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(req.body.userId),
        "hiringPeriods._id": new mongoose.Types.ObjectId(req.body.hirindId)
      },
      { $push: { "hiringPeriods.$.leavePeriods": dataAux } },
      { new: true }
    ).catch(() => {
      throw new ClientError("Error creando la excedencia o baja", 400);
    });

  } else if (req.body.type === "delete") {
    data = await User.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(req.body.userId),
        "hiringPeriods._id": new mongoose.Types.ObjectId(req.body.hirindId)
      },
      { $set: { "hiringPeriods.$.active": false } },
      { new: true, runValidators: true }
    ).catch(() => {
      throw new ClientError("No se pudo eliminar el periodo de contratación", 400);
    });

  } else if (req.body.type === "updateLeave") {
    // Validar que vengan los datos necesarios:
    if (!req.body.leaveUpdated)
      throw new ClientError("Faltan datos del leaveUpdated", 400);

    // Extrae info del leave que queremos actualizar
    const {
      _id, // ID del leavePeriod a actualizar
      startLeaveDate,
      expectedEndLeaveDate,
      actualEndLeaveDate,
      leaveType
    } = req.body.leaveUpdated;

    // Asegúrate que vengan "hiringId" o "hirindId" 
    // (según tu front; en tu createLeave usas "hirindId")
    if (!req.body.hirindId)
      throw new ClientError("Falta el id del periodo de contratación (hirindId)", 400);

    // 1) Verifica que exista el usuario y el hiringPeriod
    const userDoc = await User.findOne({
      _id: new mongoose.Types.ObjectId(req.body.userId),
      "hiringPeriods._id": new mongoose.Types.ObjectId(req.body.hirindId)
    });
    if (!userDoc)
      throw new ClientError("Usuario o periodo de contratación no encontrado", 404);

    // 2) Prepara un update con arrayFilters para actualizar la leavePeriods
    //    Buscamos la leave con _id = _id
    if (!_id)
      throw new ClientError("Falta el _id del leavePeriod", 400);

    // (Opcional) Más validaciones, por ejemplo: 
    //  - Si hay otra baja abierta
    //  - Overlaps
    //  - etc.

    const updateObj = {
      "hiringPeriods.$[hp].leavePeriods.$[lp].startLeaveDate": startLeaveDate ? new Date(startLeaveDate) : null,
      "hiringPeriods.$[hp].leavePeriods.$[lp].expectedEndLeaveDate": expectedEndLeaveDate ? new Date(expectedEndLeaveDate) : null,
      "hiringPeriods.$[hp].leavePeriods.$[lp].actualEndLeaveDate": actualEndLeaveDate ? new Date(actualEndLeaveDate) : null,
      "hiringPeriods.$[hp].leavePeriods.$[lp].leaveType": leaveType ? new mongoose.Types.ObjectId(leaveType) : null
    };

    // 3) Realiza la operación findOneAndUpdate con arrayFilters
    data = await User.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(req.body.userId),
        "hiringPeriods._id": new mongoose.Types.ObjectId(req.body.hirindId)
      },
      { $set: updateObj },
      {
        new: true,
        arrayFilters: [
          { "hp._id": new mongoose.Types.ObjectId(req.body.hirindId) },
          { "lp._id": new mongoose.Types.ObjectId(_id) }
        ]
      }
    ).catch((err) => {
      throw new ClientError("No se pudo actualizar la baja/excedencia", 400);
    });

    if (!data)
      throw new ClientError("No se pudo actualizar la baja/excedencia", 400);

    // (Al final del if block)
  } else {
    throw new ClientError("Tipo inválido contacte con comunicacion@engloba.org.es", 400);
  }

  const userChangeDispotive = await changeDispositiveNow(data);
  response(res, 200, userChangeDispotive);


};


const rehireUser = async (req, res) => {
  // 1) Validación de entrada
  validateRequiredFields(req.body, ['dni', 'hiring']);

  const raw = req.body.dni;
  const hiringInput = req.body.hiring;

  if (typeof raw !== 'string') {
    throw new ClientError('El DNI debe ser un string', 400);
  }

  // Normalizar DNI
  const dni = raw.replace(/\s+/g, '').toUpperCase();

  // 2) Buscar usuario por DNI (insensible a mayúsculas/minúsculas)
  const userDoc = await User.findOne({
    dni: { $regex: `^${dni}$`, $options: 'i' }
  });

  if (!userDoc) {
    throw new ClientError('Usuario no encontrado', 404);
  }

  // 3) Preparar el nuevo hiring con los mismos casts/validaciones que en "hirings create"
  let [newHiring] = convertIds([hiringInput]); // convierte device/position/leaveType a ObjectId

  // Resolver reason.dni -> reason completo (igual que en tu código)
  if (newHiring.reason && newHiring.reason.dni) {
    const replacementUser = await User.findOne({
      dni: { $regex: `^${newHiring.reason.dni.trim()}$`, $options: 'i' }
    });

    if (!replacementUser) {
      throw new ClientError('El trabajador al que sustituye no existe', 400);
    }

    let cause, startLeaveDate, expectedEndLeaveDate;

    const activeHiringPeriod = replacementUser.hiringPeriods.find(
      period => period.active && period.leavePeriods && period.leavePeriods.length > 0
    );

    if (activeHiringPeriod) {
      const activeLeavePeriod = activeHiringPeriod.leavePeriods.find(lp => lp.active);
      if (activeLeavePeriod) {
        cause = activeLeavePeriod.leaveType;
        startLeaveDate = activeLeavePeriod.startLeaveDate;
        expectedEndLeaveDate = activeLeavePeriod.expectedEndLeaveDate;
      }
    }

    newHiring.reason = {
      replacement: true,
      user: replacementUser._id,
      notes: {
        nameUser: `${replacementUser.firstName || ''} ${replacementUser.lastName || ''}`.trim(),
        dniUser: replacementUser.dni.replace(/\s+/g, ""),
        ...(cause && { cause }),
        ...(startLeaveDate && { startLeaveDate }),
        ...(expectedEndLeaveDate && { expectedEndLeaveDate })
      }
    };
  }

  // 4) Reglas de negocio (idénticas a hirings -> create)
  const openPeriods = userDoc.hiringPeriods.filter(
    p => !p.endDate && p.active !== false
  );

  const shiftType = newHiring?.workShift?.type;
  if (!shiftType) throw new ClientError('Falta el tipo de horario', 400);

  const endDateExist = hiringInput.endDate; // mismo criterio que en tu create

  if (!endDateExist) {
    if (shiftType === 'completa') {
      if (openPeriods.length > 0) {
        throw new ClientError(
          'Ya existe un periodo de contratación abierto a jornada completa, no se puede crear otro',
          400
        );
      }
    } else if (shiftType === 'parcial') {
      if (openPeriods.some(p => p.workShift?.type === 'completa')) {
        throw new ClientError(
          'Hay un periodo de contratación a jornada completa abierto, no se puede crear parcial',
          400
        );
      }
      if (openPeriods.filter(p => p.workShift?.type === 'parcial').length >= 2) {
        throw new ClientError(
          'No se permiten más de 2 periodos de contratación con media jornada abiertos',
          400
        );
      }
    } else {
      throw new ClientError('Tipo de horario incorrecto', 400);
    }
  }

  // 5) Transacción: push del hiring + set del employmentStatus y (opcional) email corporativo
  const session = await mongoose.startSession();
  let updatedUser;

  try {
    await session.withTransaction(async () => {
      // push + set status
      updatedUser = await User.findOneAndUpdate(
        { _id: userDoc._id },
        {
          $push: { hiringPeriods: newHiring },
          $set: { employmentStatus: 'en proceso de contratación' }
        },
        { new: true, session }
      );

      // Si no tiene email corporativo, crearlo (igual que en userPut)
      if (!updatedUser.email) {
        const userWorkspace = await createUserWS(updatedUser._id);
        if (userWorkspace?.email) {
          updatedUser = await User.findOneAndUpdate(
            { _id: userDoc._id },
            { $set: { email: userWorkspace.email } },
            { new: true, session }
          );
        }
      }
    });
  } finally {
    session.endSession();
  }

  // 6) Sincronizar dispositiveNow y grupos (reutiliza tu helper)
  const finalUser = await changeDispositiveNow(updatedUser);

  return response(res, 200, finalUser);
};











const listaDniSesame=  [
  "26821581Q", "29055355F", "29549957V", "29611560A", "29759583K",
  "44604636T", "49058174W", "60350181K", "75553136E", "12799125Q",
  "47394787K", "51184696J", "53698424W", "74817811F", "74830480A",
  "76884623Q", "77182943A", "77185481B", "77189189Q", "79362564Y",
  "79391938D", "21016064K", "29055419W", "29629308H", "44220866P",
  "44249280V", "49058811H", "49545975L", "75548506S", "76425423B",
  "77361299V", "21003844Z", "25337122T", "25350582M", "44441983A",
  "44588903E", "44697394E", "54234337S", "75899118S", "76435037B",
  "77198292B", "44782488Q", "45081054L", "45097858X", "45097862Z",
  "45099312S", "45100408F", "45108166Z", "45109629M", "45114725H",
  "45115068Q", "45117213E", "45117538W", "45119688J", "45119883R",
  "45121687B", "45151198J", "46399466W", "06273995D", "45093202T",
  "45100377E", "45101489F", "45107720M", "45109897C", "45112399S",
  "45115094L", "76734855R", "45604804J", "45606602V", "45606619B",
  "45606642B", "45606657A", "45607744D", "45607747N", "45717123T",
  "45921632Q", "52523247X", "77137222Y", "Y0072233G", "23229676K",
  "20529429C",
  "25344432L", "25349944B", "25606393X", "25611518Y", "25612842L",
  "25620395M", "26302769S", "26303066J", "39949612S", "51181559G",
  "54120068X", "76882556L", "77024599Z", "04742049R", "20500559S",
  "25351783X", "25599716A", "25602934R", "25603105B", "25606260S",
  "25614057S", "25628019Q", "25628531E", "27409852Q", "31735756B",
  "47429583H", "49077039F", "74931838T", "74933546Y", "77194049T",
  "77685981P", "X8208054K", "05441111R", "39416339C", "45091105L",
  "45094722W", "45099788P", "45103369R", "45103915H", "45110558Z",
  "45114023Y", "45114728K", "45115434Z", "45118227R", "45118895W",
  "45119047Q", "45120774H", "45123944Z", "45124383Q", "46360025Y",
  "48914475F", "76427300W", "15426808H", "21648709M", "23239532X",
  "23272935V", "23308687G", "23330963Q", "23334651R", "44053505H",
  "45597660E", "45900334Q", "45922940J", "76631550N", "78239443K",
  "43187094V", "45713234K", "45713716C", "45714714Y", "45718851A",
  "45718855F", "45868041S", "45869018A", "45920467R", "45921448Q",
  "45921602D", "45922377W", "45924375E", "45924466K", "45925008B",
  "49627842Y", "54833289R", "77141068B", "78686200A", "20623312V",
  "25612325P", "25619117S", "26791901Y", "28636112P", "46072989X",
  "74906606E", "74916129T", "77684375N", "25617536K", "25620719F",
  "25686854V", "26501239H", "45199709V", "48949397S", "52256183E",
  "74939247A", "75158035S", "77228662K", "77661271T", "79034140E",
  "11859406P", "18569374W", "31001403W", "34866473Z", "45603206W",
  "45640756Q", "48632687S", "49121206Z", "54097698L", "54139347S",
  "75223697N", "75242835Z", "75255475G", "75271957H", "75714294L",
  "75714569H", "75719710F", "76636207T", "76657810Y", "76660197R",
  "77170111M", "14633723L", "23240587F", "23256030V", "23270021R",
  "23271899Q", "23286186C", "30547444V", "45596764T", "45597404L",
  "45606589G", "45606593P", "49631062Y", "77246422W", "02419658N",
  "15255942L", "15426806Q", "15452108H", "23256335T", "23286171M",
  "26010078E", "26518709P", "45605681Q", "54122249Y", "54143491L",
  "54203430C", "75127068Y", "75262989C", "75727572A", "75728050K",
  "77486707Y", "29439841W", "44234001X", "44236877B", "45736260R",
  "52872535C", "01878511D", "17478673F", "25322065P", "25342717Y",
  "25345816T", "25346098Y", "25346675P", "50626400L", "74914476A",
  "77561313T", "79440992G", "29492096R", "29621505N", "34773408F",
  "40451990G", "44208078P", "44214770F", "44243487C", "47555041B",
  "48920403R", "48923788M", "48938640E", "48962961D", "49115399A",
  "49118994X", "55481874D", "79052812H", "25333352W", "25341664B",
  "25342271C", "25347599N", "25349672S", "25612815S", "25619604L",
  "26299635D", "31873623Q", "49124693M", "74919225Z", "77231559C",
  "77366554M", "77674632K", "24223257W", "26238570D", "52529093Z",
  "74677179C", "75150302X", "76144502N", "76629673K", "29622765F",
  "44230484N", "48911393F", "48912660D", "48940907N", "48953316R",
  "49061717A", "49237354N", "75559763W", "75772042Z", "76256666M",
  "80226071R", "09043495X", "45089736F", "45106236Q", "45106610E",
  "45112163D", "45112498E", "45112967P", "45120291H", "45121006C",
  "45151666K", "45088418T", "45098008E", "45101534Y", "45102377K",
  "45103464G", "45104166Q", "45112720Z", "45119838W", "20623949X",
  "29608988F", "29793266D", "44209603S", "48931443R", "48946450N",
  "49057733K", "49058014A", "49059064H", "49112182Y", "Y0030820Z",
  "29767841E", "29785372G", "44210635N", "44217760F", "44235067H",
  "44249256Q", "48906421A", "48907777W", "49235487P", "75555654X",
  "79165641D", "14275988A", "15514772F", "18575983X", "23813921C",
  "24257951N", "24258587G", "54142395G", "74650130L", "74717679V",
  "74738693D", "75147011P", "75149840P", "75156156E", "75158164Y",
  "76067417T", "76069697A", "77144194D", "77389806G", "X4126661R",
  "14631893Y", "45711046H", "45719186Q", "45920306R", "45920371C",
  "45920586M", "45920834T", "73657359C", "74656777L", "75578185R",
  "76423106V", "26050332A", "26812824E", "45306140G", "45900892E",
  "54135112N", "74933919B", "74943485D", "77684695X", "78950739L",
  "80166703L"
];






const HEADERS = [
  'Nombre','Apellidos','Tipo de identificación','Nº de identificación','Fecha de nacimiento','Género',
  'Nacionalidad','Estado civil','Nº de hijos','Porcentaje de discapacidad','Domicilio','Localidad',
  'Provincia','Código postal','País','Email empresa','Email personal','Teléfono','Teléfono de empresa',
  'Teléfono de emergencia','Cargo en la empresa','Responsable directo','Días de vacaciones',
  'Primer Validador de Ausencias','Segundo Validador de Ausencias','Tercer Validador de Ausencias',
  'Primer Validador de Fichajes','Segundo Validador de Fichajes','Tercer Validador de Fichajes',
  'Reclutador Principal','Centro','Departamento','Idioma','Código de acceso','PIN','Tag NFC',
  'Nivel de estudios','Grupo de cotización','Beneficiario de la cuenta','Tipo de cuenta','Nombre del banco',
  'Empleado sindicalizado','¿Pertenece a una zona geográfica fronteriza?','¿Es un empleado expatriado?',
  'Registro federal de contribuyentes','Tipo de trabajador','Plan de beneficios','Tipo de salario'
];

const INACTIVE_STATUS = 'ya no trabaja con nosotros';

async function revisarUsuariosSesame() {
  // Normalizamos DNIs y quitamos duplicados
  const dniList = Array.from(
    new Set(listaDniSesame.map(d => d.replace(/\s+/g, '').toUpperCase()))
  );

  // Traemos solo lo necesario
  const users = await User.find(
    { dni: { $in: dniList } },
    { dni: 1, employmentStatus: 1, firstName: 1, lastName: 1 }
  ).lean();

  const mapUsers = new Map(users.map(u => [u.dni.toUpperCase(), u]));

  const resultado = {
    noExisten: [],
    inactivos: [],
    ok: []
  };

  for (const dni of dniList) {
    const user = mapUsers.get(dni);
    if (!user) {
      resultado.noExisten.push(dni);
      continue;
    }

    const status = (user.employmentStatus || '').trim().toLowerCase();
    const nombreCompleto = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    if (status === INACTIVE_STATUS) {
      resultado.inactivos.push({
        dni,
        nombreCompleto,
        userId: user._id
      });
    } else {
      resultado.ok.push({
        dni,
        nombreCompleto,
        userId: user._id
      });
    }
  }

  return resultado;
}


// // Ejemplo de uso
// (async () => {
//   const resumen = await revisarUsuariosSesame();
//   console.log('Inactivos:', resumen.inactivos);
//   console.log('No existen:', resumen.noExisten);
//   console.log('OK:', resumen.ok.length, 'usuarios');
// })();

//sesame BORRAR MAS TARDE

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function formatDate(d){
  if(!d) return '';
  const date = new Date(d);
  const mm = String(date.getMonth()+1).padStart(2,'0');
  const dd = String(date.getDate()).padStart(2,'0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// crea un índice que tiene entradas tanto para programs como para devices
// crea un índice que tiene entradas tanto para programs como para devices
const createProgramDevicesIndex = (programs) => {
  const index = {};

  programs.forEach(program => {
    // Registro para el programa
    index[program._id.toString()] = {
      _id: program._id.toString(),
      type: "program",
      name: program.name,
      responsible: program.responsible,
      devicesIds: (program.devices || []).map(d => d._id.toString())
    };

    // Registros para cada device del programa
    (program.devices || []).forEach(device => {
      index[device._id.toString()] = {
        _id: device._id.toString(),
        type: "device",
        name: device.name,
        responsible: device.responsible,
        coordinators: device.coordinators,
        programId: program._id.toString()
      };
    });
  });

  return index;
};

async function buildEmployeesJson(dniList) {
  const users = await User.find({ dni: { $in: dniList } })
    .populate({ path: 'dispositiveNow.position', model: 'Jobs', select: 'name' })
    .populate({ path: 'studies', select: 'name' })
    .lean();

  // Recolectar todos los deviceIds
  const deviceIds = new Set();
  users.forEach(u =>
    (u.dispositiveNow || []).forEach(p => {
      if (p.device) deviceIds.add(p.device.toString());
    })
  );

  // Buscar los programas que contienen esos devices y crear índice
  let index = {};
  if (deviceIds.size) {
    const programs = await Program.find(
      { 'devices._id': { $in: [...deviceIds] } },
      // Traemos lo necesario para construir el índice
      { name: 1, devices: 1, responsible: 1 }
    ).lean();

    index = createProgramDevicesIndex(programs);
  }

  return users.map(user => {
    // Periodo activo (o el primero)
    const activePeriod =
      (user.dispositiveNow || []).find(p => p.active) ||
      (user.dispositiveNow || [])[0];

    // Id del device
    const deviceId = activePeriod?.device
      ? activePeriod.device.toString()
      : null;

    // Entrada del device en el índice
    const deviceEntry = deviceId ? index[deviceId] : null;
    // Entrada del programa (si existe)
    const programEntry =
      deviceEntry && deviceEntry.programId
        ? index[deviceEntry.programId]
        : null;

    return {
      'Nombre': user.firstName || '',
      'Apellidos': user.lastName || '',
      'Tipo de identificación': 'DNI',
      'Nº de identificación': user.dni || '',
      'Fecha de nacimiento': formatDate(user.birthday),
      'Género': (user.gender=='female')?'Femenino':'Masculino',
      'Nacionalidad': '',
      'Estado civil': '',
      'Nº de hijos': '',
      'Porcentaje de discapacidad': user.disability?.percentage ?? '',
      'Domicilio': '',
      'Localidad': '',
      'Provincia': '',
      'Código postal': '',
      'País': '',
      'Email empresa': user.email || '',
      'Email personal': user.email_personal || '',
      'Teléfono': user.phone || '',
      'Teléfono de empresa': user.phoneJob?.number || '',
      'Teléfono de emergencia': '',
      'Cargo en la empresa': activePeriod?.position?.name || '',
      'Responsable directo': '',
      'Días de vacaciones': (user.vacationDays || []).length || '',
      'Primer Validador de Ausencias': '',
      'Segundo Validador de Ausencias': '',
      'Tercer Validador de Ausencias': '',
      'Primer Validador de Fichajes': '',
      'Segundo Validador de Fichajes': '',
      'Tercer Validador de Fichajes': '',
      'Reclutador Principal': '',
      'Centro': deviceEntry ? deviceEntry.name : '',
      'Departamento': programEntry ? programEntry.name : '',
      'Idioma': 'es-ES',
      'Código de acceso': '',
      'PIN': '',
      'Tag NFC': '',
      'Nivel de estudios': (user.studies || []).map(s => s.name).filter(Boolean).join(', '),
      'Grupo de cotización': activePeriod?.category || '',
      'Beneficiario de la cuenta': '',
      'Tipo de cuenta': '',
      'Nombre del banco': '',
      'Empleado sindicalizado': '',
      '¿Pertenece a una zona geográfica fronteriza?': '',
      '¿Es un empleado expatriado?': '',
      'Registro federal de contribuyentes': user.socialSecurityNumber || '',
      'Tipo de trabajador': '',
      'Plan de beneficios': '',
      'Tipo de salario': ''
    };
  });
}

const fs_p = require('fs/promises');

async function guardarJsonEnArchivo(data, ruta = 'empleados.json') {
  await fs_p.writeFile(ruta, JSON.stringify(data, null, 2), { encoding: 'utf8' });
  console.log('JSON guardado en', ruta);
}


async function generateEmployeesExcel(employeesJson, outputPath) {
  try {
    console.log('generateEmployeesExcel -> tipo recibido:', typeof employeesJson);

    if (typeof employeesJson === 'string') {
      try {
        employeesJson = JSON.parse(employeesJson);
        console.log('JSON parseado correctamente.');
      } catch (e) {
        console.error('Error parseando el JSON que llega como string:', e);
        return;
      }
    }

    if (!Array.isArray(employeesJson)) {
      console.error('employeesJson no es un array:', employeesJson);
      return;
    }

    console.log('Número de empleados a escribir:', employeesJson.length);

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('DATOS PRINCIPALES');

    // ===== Texto superior =====
    const topRows = [
      "PLANTILLA CARGA EMPLEADOS",
      "Campos obligatorios de carga: nombre, apellido, tipo de identificación y nº de identificación.",
      "Modificar la estructura de la plantilla puede generar fallos de carga.",
      "No es posible asignar roles desde esta plantilla.",
      "El formato correcto es 'AAAA-MM-DD. Te recomendamos que incluyas una comilla simple (') al inicio de la fecha para evitar que se formatee la fecha, ej. '2000-01-01",
      "Para asignar departamentos o centros, es necesario agregarlos sin espacios seguidos de un ';'",
      "v2.5_13-11-2025",
      "Si quieres saber más sobre los requisitos de la plantilla, encontrarás más información en este enlace:",
      "https://help.sesamehr.com/es_ES/gestion-de-empleados/instrucciones-para-una-correcta-importacion-de-empleados-por-carga-masiva"
    ];

    topRows.forEach((text, idx) => {
      const rowNumber = idx + 1;
      ws.getRow(rowNumber).getCell(1).value = text;
    });
    console.log('Filas superiores creadas (1 a', topRows.length, ')');

    // ===== Cabeceras =====
    const HEADERS = [
      'Nombre','Apellidos','Tipo de identificación','Nº de identificación','Fecha de nacimiento','Género',
      'Nacionalidad','Estado civil','Nº de hijos','Porcentaje de discapacidad','Domicilio','Localidad',
      'Provincia','Código postal','País','Email empresa','Email personal','Teléfono','Teléfono de empresa',
      'Teléfono de emergencia','Cargo en la empresa','Responsable directo','Días de vacaciones',
      'Primer Validador de Ausencias','Segundo Validador de Ausencias','Tercer Validador de Ausencias',
      'Primer Validador de Fichajes','Segundo Validador de Fichajes','Tercer Validador de Fichajes',
      'Reclutador Principal','Centro','Departamento','Idioma','Código de acceso','PIN','Tag NFC',
      'Nivel de estudios','Grupo de cotización','Beneficiario de la cuenta','Tipo de cuenta','Nombre del banco',
      'Empleado sindicalizado','¿Pertenece a una zona geográfica fronteriza?','¿Es un empleado expatriado?',
      'Registro federal de contribuyentes','Tipo de trabajador','Plan de beneficios','Tipo de salario'
    ];
    console.log('Número de columnas:', HEADERS.length);

    const groupRowNumber = topRows.length + 1;   // Fila 10
    const headerRowNumber = topRows.length + 2;  // Fila 11

    // Fila de grupo
    ws.getRow(groupRowNumber).getCell(6).value = 'Información general';
    ws.mergeCells(groupRowNumber, 6, groupRowNumber, 10);

    // Fila de cabeceras
    const headerRow = ws.getRow(headerRowNumber);
    HEADERS.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
    });
    console.log('Cabeceras escritas en fila', headerRowNumber);

    // Campos obligatorios coloreados (A-D)
    [1,2,3,4].forEach(idx => {
      headerRow.getCell(idx).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF4CCCC' }
      };
    });

    // ===== Datos =====
    const startDataRow = headerRowNumber + 1; // Fila 12
    employeesJson.forEach((emp, index) => {
      const targetRowNumber = startDataRow + index;
      const row = ws.getRow(targetRowNumber);
      HEADERS.forEach((h, colIdx) => {
        row.getCell(colIdx + 1).value =
          emp[h] === undefined || emp[h] === null ? '' : emp[h];
      });
    });
    console.log('Filas de empleados escritas desde la fila', startDataRow);

    // Ancho de columnas
    HEADERS.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      let maxLen = h.length;
      col.eachCell({ includeEmpty: true }, c => {
        if (c.value) maxLen = Math.max(maxLen, c.value.toString().length);
      });
      col.width = Math.min(maxLen + 2, 50);
    });
    console.log('Anchos de columnas ajustados.');

    await workbook.xlsx.writeFile(outputPath);
    console.log('Excel guardado en:', outputPath);
    console.log('IMPORTANTE: cabeceras en fila', headerRowNumber, 'datos desde fila', startDataRow);

  } catch (err) {
    console.error('Error en generateEmployeesExcel:', err);
  }
}

const prueba=async (req, res) => {
response(res, 200, {ok:true})
}

module.exports = {
  //gestiono los errores con catchAsync
  postCreateUser: catchAsync(postCreateUser),
  getUsers: catchAsync(getUsers),
  getUserID: catchAsync(getUserID),
  UserDeleteId: catchAsync(UserDeleteId),
  userPut: catchAsync(userPut),
  getUsersFilter: catchAsync(getUsersFilter),
  payroll: catchAsync(payroll),
  hirings: catchAsync(hirings),
  rehireUser:catchAsync(rehireUser),
  getFileUser: catchAsync(getFileUser),
  getUserName: catchAsync(getUserName),
  getAllUsersWithOpenPeriods: catchAsync(getAllUsersWithOpenPeriods),
  prueba:catchAsync(prueba)
}
