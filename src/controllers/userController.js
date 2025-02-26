const { User, Program, Jobs, Leavetype } = require('../models/indexModels');
const { catchAsync, response, ClientError } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { validateRequiredFields } = require('../utils/utils');
const { uploadFileToDrive, getFileById, deleteFileById } = require('./googleController');

    const capitalize = (str) => {
        if (!str || typeof str !== 'string') return str;
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      };


// Función para convertir IDs dentro de los datos de contratación
const convertIds = (hirings) => {
    return hirings.map(hiring => {
        // Validar y convertir position._id
        if (!hiring.position) {
            throw new ClientError('El campo position._id es requerido', 400);
        }
        hiring.position = new mongoose.Types.ObjectId(hiring.position);

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

const postCreateUser = async (req, res) => {
    const requiredFields = [
      'dni',
      'firstName',
      'lastName',
      'email',
      'phone',
      'hiringPeriods',
      'role',
      'gender'
    ];
  
    const {
      dni,
      firstName,
      lastName,
      email,
      phone,
      hiringPeriods,
      employmentStatus = "activo",
      role,
      notes,
      disability,
      fostered,
      gender,
      apafa
    } = req.body;
  
    validateRequiredFields(req.body, requiredFields);
  
    // Procesar el objeto de hiring
    const newHiring = convertIds(hiringPeriods)[0];
  
    // Construir objeto userData
    const userData = {
      dni,
      role,
      firstName: capitalize(firstName), // Capitalizar
      lastName: capitalize(lastName),   // Capitalizar
      email: email.toLowerCase(),       // Convertir a minúsculas
      phone,
      hiringPeriods: newHiring,
      dispositiveNow: newHiring.device,
      employmentStatus,
      notes,
      gender
    };
  
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
  
    try {
      // Intentar crear el usuario
      const newUser = await User.create(userData);
  
      // Responder con el usuario guardado
      response(res, 200, newUser);
  
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
  };
  
const getUsers = async (req, res) => {
    if (!req.body.page || !req.body.limit) throw new ClientError("Faltan datos no son correctos", 400);

    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const filters = {};
    const programs = await Program.find().select('name _id devices.name devices._id');

    if (req.body.firstName) filters["firstName"] = { $regex: new RegExp(req.body.firstName, 'i') };
    if (req.body.lastName) filters["lastName"] = { $regex: new RegExp(req.body.lastName, 'i') };
    if (req.body.email) filters["email"] = { $regex: req.body.email, $options: 'i' };
    if (req.body.phone) filters["phone"] = { $regex: req.body.phone, $options: 'i' };
    if (req.body.dni) filters["dni"] = { $regex: req.body.dni, $options: 'i' };
    if (req.body.status) filters["employmentStatus"] = req.body.status;
    if (req.body.gender) filters["gender"] = req.body.gender;
    if (req.body.fostered === "si") filters["fostered"] = true;
    if (req.body.fostered === "no") filters["fostered"] = false;
    if (req.body.apafa === "si") filters["apafa"] = true;
    if (req.body.apafa === "no") filters["apafa"] = false;
    if (req.body.disPercentage !== undefined) filters["disability.percentage"] = req.body.disPercentage;

    if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
        const program = programs.find(pr => pr._id.toString() === req.body.programId);
        if (!program) throw new ClientError("Programa no encontrado", 404);
        filters.dispositiveNow = { $in: program.devices.map(device => device._id) };
    }

    if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
        filters["dispositiveNow"] = req.body.dispositive;
    }

    const totalDocs = await User.countDocuments(filters);
    const totalPages = Math.ceil(totalDocs / limit);
    const users = await User.find(filters)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    response(res, 200, { users: users, totalPages });
};

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
    const id = req.params.id;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const usuario = await User.findById(id).catch(error => { throw new ClientError('Usuario no encontrado', 404) });
    // Responde con el usuario encontrado y código de estado 200 (OK)
    response(res, 200, usuario);
}

//busca un usuario por ID
const getUserName = async (req, res) => {
    // Obtener la lista de IDs desde la solicitud
    const ids = req.body.ids;

    // Validar que `ids` sea un array y contenga al menos un ID
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new ClientError("Debes proporcionar una lista de IDs válida", 400);
    }

    // Buscar los usuarios cuyos _id coincidan con los proporcionados
    const users = await User.find(
        { _id: { $in: ids } }, // Filtra los usuarios por los IDs
        { firstName: 1, lastName: 1 } // Solo devuelve estos campos
    );

    // Responder con la lista de usuarios encontrados
    response(res, 200, users);
}

// Descargar archivos de usuario
const getFileUser = async (req, res) => {
    try {
      const userId = req.body.id; // ID del usuario
      const fileId = req.body.idFile; // ID del archivo en Google Drive
  
      // Buscar al usuario y verificar que el archivo existe en el array `files`
      const user = await User.findOne({
        _id: userId,
        'files.fileName': fileId, // Cambia `fileName` si el campo es diferente
      });
  
      if (!user) {
        throw new ClientError('Usuario o archivo no encontrado', 404);
      }
  
      // Obtener el archivo de Google Drive
      const { file, stream } = await getFileById(fileId);
  
      if (!stream) {
        throw new ClientError('Archivo no encontrado en Google Drive', 404);
      }
  
      // Configurar los headers para la descarga
      res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
      res.setHeader('Content-Type', file.mimeType);
  
      // Enviar el archivo como un stream
      stream.pipe(res);

    } catch (error) {
      // Manejo de errores personalizados o genéricos
      if (error instanceof ClientError) {
        response(res, error.statusCode, { error: true, message: error.message });
      } else {
        response(res, 500, { error: true, message: 'Error interno del servidor' });
      }
    }
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
  
      // 4. Si todos los archivos se borraron correctamente,
      //    ahora sí procedemos a eliminar el usuario en la BD
      const messageDelete = await User.deleteOne({ _id: id });
  
      // 5. Retornar respuesta
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


    const parseField = (field, fieldName) => {
        try {
            const parsedField = JSON.parse(field);
            if (Array.isArray(parsedField)) {
                return parsedField;
            } else {
                throw new Error(`${fieldName} debe ser un array.`);
            }
        } catch (error) {
            throw new ClientError(`Error al procesar ${fieldName}: ${error.message}`, 400);
        }
    };

 

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
    
    if (req.body.firstName) updateFields.firstName =  capitalize(req.body.firstName);  // Capitalizamos el firstName
    
    if (req.body.lastName) updateFields.lastName = capitalize(req.body.lastName);
    if (req.body.email) updateFields.email = req.body.email.toLowerCase();
    if (req.body.role) updateFields.role = req.body.role;
    if (req.body.phone) updateFields.phone = req.body.phone;
    if (req.body.dni) updateFields.dni = req.body.dni;
    if (req.body.employmentStatus) updateFields.employmentStatus = req.body.employmentStatus;
    if (req.body.socialSecurityNumber) updateFields.socialSecurityNumber = req.body.socialSecurityNumber;
    if (req.body.bankAccountNumber) updateFields.bankAccountNumber = req.body.bankAccountNumber;

    if (req.body.disPercentage) updateFields.disability= {
        percentage:req.body.disPercentage
    };
    
    if (req.body.disNotes) updateFields.disability.notes= req.body.disNotes;
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

    
    const folderId = process.env.GOOGLE_DRIVE_APPFILE;

    // Obtener los archivos existentes en la base de datos
    const user = await User.findById(req.body._id).select('files');
    const existingFiles = user.files || [];

    if (files && files.length > 0) {
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
                const fileDriveData=await uploadFileToDrive(file, folderId, uniqueFileName);
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
        );
        response(res, 200, updatedUser);
    } catch (error) {
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




const deletePayroll = async (userId, payrollId, pdf) => {
    try {
        // Verificar si la nómina existe antes de intentar eliminarla
        const user = await User.findOne({ _id: userId, 'payrolls._id': payrollId });

        // Si el usuario o la nómina no existen, devolver false
        if (!user) {
            return false;
        }

        const deleteResponse = await deleteFileById(pdf)
        if (deleteResponse.success) {
            const result = await User.findByIdAndUpdate(
                userId,
                { $pull: { payrolls: { _id: payrollId } } },
                { new: true }
            );
            return result;
        } else {
            return false
        }
        // Usar $pull para eliminar directamente la nómina por su _id


    } catch (error) {
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
        const fileNameAux = `${userAux.dni}_${payrollMonth}_${payrollYear}_${userAux.firstName}_${userAux.lastName}.pdf`;

        const folderId=process.env.GOOGLE_DRIVE_NOMINAS;
        // Subir archivo a Google Drive
        const fileAux = await uploadFileToDrive(file, folderId, fileNameAux, true);

        if (fileAux) {
            // Crear objeto payroll
            const newPayroll = {
                payrollMonth: parseInt(payrollMonth, 10),
                payrollYear: parseInt(payrollYear, 10),
                pdf: fileAux.id
            };

            // Añadir la nómina al array de payrolls del usuario
            userAux.payrolls.push(newPayroll);
            // Guardar el usuario actualizado en la base de datos
            await userAux.save();
            return userAux;
        } else {
            throw new Error('Error al subir el archivo a Google Drive');
        }
    } catch (error) {
        return null;
    }
};

const signPayroll = async (idUser, file, payrollYear, payrollMonth, idPayroll) => {
    try {
        const userAux = await User.findById(idUser);
        if (!userAux) {
            throw new Error('Usuario no encontrado');
        }
        // Formatear el nombre del archivo
        const fileNameAux = `${userAux.dni}_${payrollMonth}_${payrollYear}_${userAux.firstName}_${userAux.lastName}_signed.pdf`;

        const folderId=process.env.GOOGLE_DRIVE_NOMINAS;
        // Subir archivo a Google Drive
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
            );
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
        if (!req.body.idPayroll && !req.body.pdf) {
            throw new ClientError('El campo idPayroll es requerido', 400);
        }
        const newUser = await deletePayroll(id, req.body.idPayroll, req.body.pdf);

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

    } else if(req.body.type === 'sign'){
        const requiredFields = ['payrollYear', 'payrollMonth', 'idPayroll'];
        validateRequiredFields(req.body, requiredFields);
        const signResult = await signPayroll(id, file, req.body.payrollYear, req.body.payrollMonth, req.body.idPayroll);
        if (!signResult) {
            throw new ClientError('No se ha podido subir la nómina', 400);
        } else {
            return response(res, 200, signResult);
        }
    }
};

const changeDispositiveNow = async (user) => {
    // Verifica si existe el array hiringPeriods
    if (!user.hiringPeriods || user.hiringPeriods.length === 0) {
      return user; // se devuelve sin cambios
    }
  
    // Filtra únicamente los hiringPeriods activos y sin fecha de fin
    const activeHiringsWithoutEndDate = user.hiringPeriods.filter(
      (hp) => hp.active && !hp.endDate
    );
  
    // Si no hay ningún hiringPeriod que cumpla la condición, se actualiza dispositiveNow a null
    if (activeHiringsWithoutEndDate.length === 0) {
      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        { $set: { dispositiveNow: null } },
        { new: true }
      );
      return updatedUser;
    }
  
    // Extrae el device de cada hiringPeriod que cumple la condición
    const devices = activeHiringsWithoutEndDate.map((hp) => hp.device);
  
    // Actualiza en la base de datos utilizando findOneAndUpdate
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { dispositiveNow: devices } },
      { new: true }
    );
  
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
    if (!req.body.userId) throw new ClientError("Error, contacte con el administrador", 400);
    if (!req.body.type) throw new ClientError("Error, contacte con el administrador", 400);
  
    let data;
    if (req.body.type === "put") {
      if (!Array.isArray(req.body.hirings)) throw new ClientError("Error, contacte con el administrador", 400);
      const cuerpo = convertIds(req.body.hirings);
  
      const userDoc = await User.findById(req.body.userId);
      if (!userDoc) throw new ClientError("Usuario no encontrado", 404);
  
      const openPeriods = cuerpo.filter(p => !p.endDate && p.active !== false);
      const ftCount = openPeriods.filter(p => p.workShift?.type === "completa").length;
      const ptCount = openPeriods.filter(p => p.workShift?.type === "parcial").length;
  
      if (ftCount > 1) throw new ClientError("Máximo 1 periodo completo abierto", 400);
      if (ftCount === 1 && ptCount > 0) throw new ClientError("No mezclar completo con parcial abierto", 400);
      if (ptCount > 2) throw new ClientError("Máximo 2 periodos parciales abiertos", 400);
  
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
      const userDoc = await User.findById(req.body.userId);
      if (!userDoc) throw new ClientError("Usuario no encontrado", 404);
  
      const openPeriods = userDoc.hiringPeriods.filter(p => !p.endDate && p.active !== false);
      const shiftType = newHiring?.workShift?.type;
      if (!shiftType) throw new ClientError("Falta el tipo de horario", 400);
  
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
  
      data = await User.findOneAndUpdate(
        { _id: req.body.userId },
        { $push: { hiringPeriods: newHiring } },
        { new: true }
      );
      if (!data) throw new ClientError("No se pudo crear el periodo de contratación", 400);
  
    } else if (req.body.type === "createLeave") {
      if (typeof req.body.leave !== "object" || Array.isArray(req.body.leave))
        throw new ClientError("'leave' debe ser un objeto", 400);
      if (!req.body.hirindId) throw new ClientError("Falta el id del periodo de contratación", 400);
  
      const userDoc = await User.findOne({
        _id: req.body.userId,
        "hiringPeriods._id": req.body.hirindId
      });
      if (!userDoc) throw new ClientError("No se encontró el periodo de contratación", 404);
  
      const hiringPeriod = userDoc.hiringPeriods.find(hp => hp._id.toString() === req.body.hirindId);
      if (!hiringPeriod) throw new ClientError("No existe el periodo de contratación", 400);
  
      const dataAux = req.body.leave;
      if (!dataAux.startLeaveDate) throw new ClientError("Falta la fecha de inicio de excedencia", 400);
      dataAux.leaveType = new mongoose.Types.ObjectId(dataAux.leaveType);
  
      // No se puede crear otro leave si hay uno abierto
      const openLeave = hiringPeriod.leavePeriods.find(lp => !lp.actualEndLeaveDate && lp.active !== false);
      if (openLeave) throw new ClientError("Ya hay una excedencia o baja abierta, no de puede crear otra", 400);
  
      // El nuevo startLeaveDate debe ser posterior al actualEndLeaveDate del último
      const sortedLeaves = [...hiringPeriod.leavePeriods].sort((a,b) => a.startLeaveDate - b.startLeaveDate);
      const lastLeave = sortedLeaves[sortedLeaves.length - 1];
      if (lastLeave?.actualEndLeaveDate) {
        if (new Date(dataAux.startLeaveDate) <= new Date(lastLeave.actualEndLeaveDate))
          throw new ClientError("La nueva excedencia o baja se debe iniciar después del último periodo de baja", 400);
      }
  
      data = await User.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(req.body.userId), "hiringPeriods._id": new mongoose.Types.ObjectId(req.body.hirindId)},
        { $push: { "hiringPeriods.$.leavePeriods": dataAux }},
        { new: true }
      ).catch(() => { throw new ClientError("Error creando la excedencia o baja", 400)});
  
    } else if (req.body.type === "delete") {
      data = await User.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(req.body.userId), "hiringPeriods._id": new mongoose.Types.ObjectId(req.body.hirindId)},
        { $set: { "hiringPeriods.$.active": false }},
        { new: true, runValidators: true }
      ).catch(() => { throw new ClientError("No se pudo eliminar el periodo de contratación", 400)});
  
    } else {
      throw new ClientError("Tipo inválido contacte con comunicacion@engloba.org.es", 400);
    }
  
    const userChangeDispotive = await changeDispositiveNow(data);
    response(res, 200, userChangeDispotive);
  };

  


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
    getFileUser:catchAsync(getFileUser),
    getUserName:catchAsync(getUserName)
}
