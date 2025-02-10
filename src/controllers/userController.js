const { User, Program, Jobs, Leavetype } = require('../models/indexModels');
const { prevenirInyeccionCodigo, esPassSegura, catchAsync, response, generarHashpass, ClientError } = require('../utils/indexUtils');
const { faker } = require('@faker-js/faker');
const mongoose = require('mongoose');

const { createAccentInsensitiveRegex, parseAndValidateDates, validateRequiredFields } = require('../utils/utils');
const { uploadFileToDrive, getFileById, deleteFileById } = require('./googleController');
const user = require('../models/user');



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
    const requiredFields=['dni','firstName','lastName','email','phone','hiringPeriods','role']

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
      } = req.body;

      validateRequiredFields(req.body, requiredFields);
      // Procesar el objeto de hiring
      const newHiring = convertIds(hiringPeriods)[0];
      const userData = {
        dni,
        role,
        firstName,
        lastName,
        email,
        phone,
        // hiringPeriods puede ser un array de objetos;
        // si necesitas transformarlos, hazlo aquí (p. ej. convertIds)
        hiringPeriods: newHiring,
        dispositiveNow:newHiring.device,
        employmentStatus,
        notes
      };

      const newUser=await User.create(userData)

      if(newUser.code==11000){
        const [[key, value]] = Object.entries(newUser.keyValue);
        throw new ClientError(`${value} esta duplicado, no se pudo crear el usuario`)
      } 
        
    // Responder con el usuario guardado
    response(res, 200, newUser);
};



// Controlador para obtener usuarios
const getUsers = async (req, res) => {
    if (!req.body.page || !req.body.limit) throw new ClientError("Faltan datos no son correctos", 400);

    // Paginación
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const filters = {};

    // // Consultas a la base de datos
    // const leaveTypes = await Leavetype.find(); // Obtener todos los tipos de permisos
    // const jobs = await Jobs.find(); // Obtener todos los trabajos
    const programs = await Program.find().select('name _id devices.name devices._id'); // Obtener todos los programas


    // Aplicar filtros de búsqueda
    if (req.body.firstName) filters["firstName"] = { $regex: new RegExp(req.body.firstName, 'i') };
    if (req.body.lastName) filters["lastName"] = { $regex: new RegExp(req.body.lastName, 'i') };
    if (req.body.email) filters["email"] = { $regex: req.body.email, $options: 'i' };
    if (req.body.phone) filters["phone"] = { $regex: req.body.phone, $options: 'i' };
    if (req.body.dni) filters["dni"] = { $regex: req.body.dni, $options: 'i' };
    if (req.body.status) filters["employmentStatus"] = req.body.status;

    // Filtrar por programa, si se envía programId
    if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
        const program = programs.find(pr => pr._id.toString() === req.body.programId);
        if (!program) throw new ClientError("Programa no encontrado", 404);
        filters.dispositiveNow = { $in: program.devices.map(device => device._id) };
    }

    // Filtrar por dispositivo específico
    if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) {
        filters["dispositiveNow"] = req.body.dispositive;
    }

    // Contar documentos que cumplen los filtros
    const totalDocs = await User.countDocuments(filters);

    // Calcular total de páginas
    const totalPages = Math.ceil(totalDocs / limit);

    // Obtener usuarios con paginación
    const users = await User.find(filters)
        .sort({ createdAt: -1 }) // Ordenar por fecha de creación descendente
        .skip((page - 1) * limit) // Saltar registros según la página
        .limit(limit); // Limitar registros por página

    // Responder con los usuarios procesados y paginados
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



// if (!archivoStream) {
    //     throw new ClientError('Archivo no encontrado', 404);
    //   }
    //   // Configurar la respuesta HTTP
    //   res.writeHead(200, {
    //     'Content-Type': 'application/pdf',
    //     'Content-Disposition': 'attachment; filename=' + req.body.id,
    //   });

    //   // Enviar el stream como respuesta HTTP
    //   archivoStream.pipe(res);

// borrar un usuario
const UserDeleteId = async (req, res) => {
    const id = req.params.id;
    const userDelete = await User.deleteOne({ _id: id });
    response(res, 200, userDelete);
}

const userPut = async (req, res) => {
    const files = req.files;

    if (!req.body._id) {
        throw new ClientError('El ID de usuario es requerido', 400);
    }

    // Inicializar el objeto de actualización
    let updateFields = {};

    if (req.body.pass) {
        updateFields.pass = await generarHashpass(req.body.pass);
    }

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
        firstName: req.body.firstName,
        email: req.body.email,
        role: req.body.role,
        phone: req.body.phone,
        dni: req.body.dni,
        lastName: req.body.lastName,
        employmentStatus: req.body.employmentStatus,
        socialSecurityNumber: req.body.socialSecurityNumber,
        bankAccountNumber: req.body.bankAccountNumber,
    };

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
  
    // Filtra únicamente los hiringPeriods activos
    const activeHirings = user.hiringPeriods.filter((hp) => hp.active);
  
    // Si no hay ningún hiringPeriod activo, retornamos el user tal cual
    if (!activeHirings || activeHirings.length === 0) {
        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id },
            { $set: { dispositiveNow: null } },
            { new: true }
          );
          return updatedUser;
    }
  
    // 1. Ordenar los hiringPeriods activos por startDate (desc)
    activeHirings.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  
    // 2. Asignar el device del hiringPeriod activo más reciente
    const mostRecentDevice = activeHirings[0].device;

  
    // 3. Actualizar en la base de datos usando findOneAndUpdate
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { dispositiveNow: mostRecentDevice } },
      { new: true }
    );
  
    return updatedUser;
  };
  

// Controlador principal
const hirings = async (req, res) => {

    // Validar campos generales requeridos
    if (!req.body.userId) {
        throw new ClientError('El campo userId es requerido', 400);
    }
    if (!req.body.type) {
        throw new ClientError('La acción es requerida', 400);
    }


    // Realizar la operación en MongoDB
    let data;
    if (req.body.type === 'put') {
        if (!Array.isArray(req.body.hirings)) {
            throw new ClientError('El campo hirings debe ser un array', 400);
        }
        const cuerpo = convertIds(req.body.hirings);
        data = await User.findOneAndUpdate(
            { _id: req.body.userId },
            { $set: { hiringPeriods: cuerpo } }, // Actualización completa del array
            { new: true } // Devolver el documento actualizado
        );
    } else if (req.body.type === 'create') {
        if (typeof req.body.hirings !== 'object' || Array.isArray(req.body.hirings)) {
            throw new ClientError('El campo hirings debe ser un objeto', 400);
        }

        // Procesar el objeto de hiring
        const newHiring = convertIds([req.body.hirings])[0];

        // Agregar el nuevo elemento al array hiringPeriods
        data = await User.findOneAndUpdate(
            { _id: req.body.userId },
            { $push: { hiringPeriods: newHiring } }, // Agregar al array existente
            { new: true } // Devolver el documento actualizado
        )
    } else if (req.body.type === 'createLeave') {
        if (typeof req.body.leave !== 'object' || Array.isArray(req.body.leave)) {
            throw new ClientError('El campo leave debe ser un objeto', 400);
        }

        let dataAux=req.body.leave
        dataAux.leaveType=new mongoose.Types.ObjectId(dataAux.leaveType);

        data = await User.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(req.body.userId), "hiringPeriods._id": new mongoose.Types.ObjectId(req.body.hirindId) }, // Filtra por userId y el hiringId específico
            {
                $push: {
                    "hiringPeriods.$.leavePeriods": dataAux // Agrega el nuevo período de excedencia al campo leavePeriods
                }
            },
            { new: true } // Devuelve el documento actualizado
        ).catch((x)=>{throw new ClientError('No se ha podido crear el periodo de contratación', 400)})

    } else if(req.body.type === 'delete'){

        data = await User.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(req.body.userId),
                'hiringPeriods._id': new mongoose.Types.ObjectId(req.body.hirindId), // Filtra el hiringPeriod específico
            },
            {
                $set: { 'hiringPeriods.$.active': false } // Actualiza el campo active a false
            },
            {
                new: true, // Devuelve el documento actualizado
                runValidators: true // Asegura que se validen los datos durante la actualización
            }
        ).catch((x)=>{throw new ClientError('No se ha podido eliminar el periodo de contratación', 400)});
    } else {
        throw new ClientError('El tipo no es valido', 400);
    }

    const userChangeDispotive =await changeDispositiveNow(data)
    response(res, 200, userChangeDispotive)
    // Responder con los datos actualizados
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
    getFileUser:catchAsync(getFileUser)
}
