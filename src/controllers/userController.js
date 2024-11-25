const { User, Program, Jobs, Leavetype } = require('../models/indexModels');
const { prevenirInyeccionCodigo, esPassSegura, catchAsync, response, generarHashpass, ClientError } = require('../utils/indexUtils');
const { faker } = require('@faker-js/faker');
const mongoose = require('mongoose');
const { createAccentInsensitiveRegex, parseAndValidateDates } = require('../utils/utils');
const { uploadFile } = require('./ovhController');
const { uploadFileToDrive, getFileById, deleteFileById } = require('./googleController');



const postCreateUser = async (req, res) => {
    const files = req.files;
    const requiredFields = ['firstName', 'phone', 'email', 'dni'];

    // Verificar si algún campo requerido está ausente o vacío
    for (const field of requiredFields) {
        if (!req.body[field]) {
            throw new ClientError(`El campo ${field} es requerido`, 400);
        }
    }

    // Generar una contraseña segura usando el dni
    let passSegura;

    if (!req.body.password) {
        passSegura = await generarHashpass(req.body.dni);
    } else {
        passSegura = await generarHashpass(req.body.password);
    }


    // Parsear el campo hiringPeriods de JSON si existe
    let hiringPeriods = [];
    if (req.body.hiringPeriods) {
        try {
            hiringPeriods = JSON.parse(req.body.hiringPeriods);
        } catch (error) {
            throw new ClientError('El periodo de contratación no tiene un formato válido', 400);
        }
    }

    // Parsear responsibleDevices de JSON si existe
    let responsibleDevices = {};
    if (req.body.responsibleDevices) {
        try {
            responsibleDevices = JSON.parse(req.body.responsibleDevices);
        } catch (error) {
            throw new ClientError('El responsibleDevices no tiene un formato válido', 400);
        }
    }

    // Inicializamos el objeto del nuevo usuario
    let newUserData = {
        firstName: req.body.firstName,
        email: req.body.email,
        pass: passSegura,
        role: req.body.role || 'employer',
        phone: req.body.phone,
        dni: req.body.dni,
        lastName: req.body.lastName || '',
        employmentStatus: req.body.employmentStatus || 'en proceso de contratación',
        socialSecurityNumber: req.body.socialSecurityNumber || '',
        bankAccountNumber: req.body.bankAccountNumber || '',
        hiringPeriods: hiringPeriods,  // Esto es un array de objetos
        leavePeriods: req.body.leavePeriods || [],
        payrolls: req.body.payrolls || [],
    };

    // Si existe al menos un hiringPeriod con un device, asignamos dispositiveNow
    if (hiringPeriods.length > 0 && hiringPeriods[0].device) {
        newUserData.dispositiveNow = hiringPeriods[0].device;
    }

    // Crear la instancia del usuario sin guardar los archivos aún
    const newUser = new User(newUserData);
    // Guardar el usuario en la base de datos para obtener su ID
    const savedUser = await newUser.save();
    const userId = savedUser._id;
    // Actualizar los dispositivos responsables en la colección Program
    const deviceIds = Object.keys(responsibleDevices);  // Obtener los IDs de dispositivos del objeto responsibleDevices
    for (const deviceId of deviceIds) {
        // Buscar el programa que contiene este dispositivo
        const program = await Program.findOne({ 'devices._id': deviceId });
        if (program) {
            // Buscar el dispositivo dentro del programa
            const device = program.devices.id(deviceId);
            if (device) {
                // Asignar el campo `responsible` con el ID del nuevo usuario
                device.responsible = userId;
                await program.save().catch((x) => console.log(x));  // Guardar los cambios en el programa
            }
        }
    }

    // Crear un array para almacenar las promesas de subida de archivos
    let fileUploadPromises = [];

    // Iterar sobre los archivos y subir cada uno
    for (const fieldName in files) {
        const fileArray = files[fieldName];
        for (const file of fileArray) {
            const uniqueFileName = `${userId}-${fieldName}.${file.originalname.split('.').pop()}`;

            // Llamar a la función uploadFile y almacenar la promesa
            const uploadPromise = uploadFile(file, uniqueFileName);
            fileUploadPromises.push(uploadPromise);

            // Asociar el nombre del archivo subido al campo correspondiente en el usuario
            savedUser[fieldName] = uniqueFileName;
        }
    }

    // Esperar a que todos los archivos se suban
    const subida = await Promise.all(fileUploadPromises).catch((e) => console.log(e));
    // Guardar nuevamente el usuario con los nombres de archivos actualizados
    await savedUser.save();

    // Responder con el usuario guardado
    response(res, 200, savedUser);
};


// Función para crear índice de leaveTypes
const createLeaveTypeIndex = (leaveTypes) => {
    const index = {};
    leaveTypes.forEach(leave => {
        // Crear un diccionario donde la clave es el ID y el valor es el leaveType completo
        index[leave._id.toString()] = leave;
    });
    return index;
};

// Función para crear índice de subcategorías de trabajos
const createJobSubcategoriesIndex = (jobs) => {
    const index = {};
    jobs.forEach(job => {
        // Crear un diccionario donde la clave es el ID de la subcategoría y el valor es la subcategoría completa
        job.subcategories?.forEach(sub => {
            index[sub._id.toString()] = sub;
        });
    });
    return index;
};

// Función para crear índice de dispositivos
const createProgramDevicesIndex = (programs) => {
    const index = {};
    programs.forEach(program => {
        if (Array.isArray(program.devices)) {
            // Crear un diccionario donde la clave es el ID del dispositivo y el valor incluye id y name
            program.devices.forEach(device => {
                index[device._id.toString()] = {
                    id: device._id.toString(),
                    name: device.name
                };
            });
        }
    });
    return index;
};

// Función para procesar usuarios
const processUsers = (users, leaveTypeIndex, jobSubcategories, programDevices) => {
    return users.map(user => {
        // Convertir usuario a un objeto plano si es un documento de Mongoose
        const plainUser = user.toObject ? user.toObject() : user;

        // Procesar cada periodo de contratación
        plainUser.hiringPeriods = Array.isArray(plainUser.hiringPeriods)
            ? plainUser.hiringPeriods.map(hiringPeriod => {
                // Procesar cada leavePeriod en el hiringPeriod
                hiringPeriod.leavePeriods = Array.isArray(hiringPeriod.leavePeriods)
                    ? hiringPeriod.leavePeriods.map(leavePeriod => {
                        // Buscar el leaveType correspondiente por ID
                        const matchedLeaveType = leaveTypeIndex[leavePeriod.leaveType?.toString()];
                        return {
                            ...leavePeriod,
                            leaveType: matchedLeaveType
                                ? { id: matchedLeaveType._id, name: matchedLeaveType.name }
                                : leavePeriod.leaveType
                        };
                    })
                    : [];

                // Buscar la subcategoría correspondiente por ID
                const matchedSubcategory = jobSubcategories[hiringPeriod.position?.toString()];
                if (matchedSubcategory) {
                    hiringPeriod.position = matchedSubcategory;
                }

                // Buscar el dispositivo correspondiente por ID
                const deviceId = hiringPeriod.device?.toString();
                const matchedDevice = programDevices[deviceId];
                if (matchedDevice) {
                    hiringPeriod.device = matchedDevice;
                }

                return hiringPeriod;
            })
            : [];

        return plainUser;
    });
};

// Controlador para obtener usuarios
const getUsers = async (req, res) => {
    if (!req.body.page || !req.body.limit) throw new ClientError("Faltan datos no son correctos", 400);

    // Paginación
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const filters = {};

    // Consultas a la base de datos
    const leaveTypes = await Leavetype.find(); // Obtener todos los tipos de permisos
    const jobs = await Jobs.find(); // Obtener todos los trabajos
    const programs = await Program.find().select('name _id devices.name devices._id'); // Obtener todos los programas

    // Crear índices para acceso rápido
    const leaveTypeIndex = createLeaveTypeIndex(leaveTypes);
    const jobSubcategories = createJobSubcategoriesIndex(jobs);
    const programDevices = createProgramDevicesIndex(programs);

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

    // Procesar usuarios para enriquecer los datos
    const userModificados = processUsers(users, leaveTypeIndex, jobSubcategories, programDevices);

    // Responder con los usuarios procesados y paginados
    response(res, 200, { users: userModificados, totalPages });
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

// borrar un usuario
const UserDeleteId = async (req, res) => {
    const id = req.params.id;
    const userDelete = await User.deleteOne({ _id: id });
    response(res, 200, userDelete);
}

//modificar Usuario
const userPut = async (req, res) => {
    const files = req.files;

    // Verificar si el ID de usuario está presente en el cuerpo de la solicitud
    if (!req.body._id) {
        throw new ClientError('El ID de usuario es requerido', 400);
    }

    // Inicializar el objeto de actualización
    let updateFields = {};

    // Si se proporciona un password, generar una nueva contraseña segura
    if (!!req.body.password) {
        updateFields.pass = await generarHashpass(req.body.password);
    }

    // Parsear campos complejos (arrays y objetos)
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


    // Parsear y validar responsibleDevices
    if (req.body.responsibleDevices) {
        updateFields.responsibleDevices = parseField(req.body.responsibleDevices, 'responsibleDevices');
    }

    // Transformar vacationDays en un array de fechas
    if (req.body.vacationDays) {
        try {
            const vacationDays = parseField(req.body.vacationDays, 'vacationDays');
            updateFields.vacationDays = vacationDays.map((date) => {
                const parsedDate = new Date(date);
                if (isNaN(parsedDate)) {
                    throw new Error(`Fecha no válida en vacationDays: ${date}`);
                }
                return parsedDate;
            });
        } catch (error) {
            throw new ClientError(`Error al procesar vacationDays: ${error.message}`, 400);
        }
    }

    // Transformar personalDays en un array de fechas
    if (req.body.personalDays) {
        try {
            const personalDays = parseField(req.body.personalDays, 'personalDays');
            updateFields.personalDays = personalDays.map((date) => {
                const parsedDate = new Date(date);
                if (isNaN(parsedDate)) {
                    throw new Error(`Fecha no válida en personalDays: ${date}`);
                }
                return parsedDate;
            });
        } catch (error) {
            throw new ClientError(`Error al procesar personalDays: ${error.message}`, 400);
        }
    }


    // Actualizar los campos del usuario con los datos del cuerpo de la solicitud
    updateFields.firstName = req.body.firstName;
    updateFields.email = req.body.email;
    updateFields.role = req.body.role;
    updateFields.phone = req.body.phone;
    updateFields.dni = req.body.dni;
    updateFields.lastName = req.body.lastName;
    updateFields.employmentStatus = req.body.employmentStatus;
    updateFields.socialSecurityNumber = req.body.socialSecurityNumber;
    updateFields.bankAccountNumber = req.body.bankAccountNumber;

    // Validar y actualizar dispositiveNow
    if (req.body.dispositiveNow !== undefined && req.body.dispositiveNow !== 'undefined') {
        updateFields.dispositiveNow = req.body.dispositiveNow === 'null' ? null : req.body.dispositiveNow;
    }

    // Crear un array para almacenar las promesas de subida de archivos
    let fileUploadPromises = [];

    if (files) {
        for (const fieldName in files) {
            const fileArray = files[fieldName];

            // Verificar si fileArray existe y es un array antes de iterar
            if (Array.isArray(fileArray)) {
                for (const file of fileArray) {
                    // Generar un nombre único para el archivo usando el ID del usuario, la clave del campo, y la fecha actual
                    const uniqueFileName = `${req.body._id}-${fieldName}.pdf`;

                    // Llamar a la función uploadFile y almacenar la promesa
                    const uploadPromise = uploadFile(file, uniqueFileName);
                    fileUploadPromises.push(uploadPromise);

                    // Asociar el nombre del archivo subido al campo correspondiente en el usuario
                    updateFields[fieldName] = uniqueFileName;
                }
            }
        }
    }

    // Esperar a que todos los archivos se suban (si los hay)
    await Promise.all(fileUploadPromises);

    // Realizar la actualización con findOneAndUpdate
    const updatedUser = await User.findOneAndUpdate(
        { _id: req.body._id },
        { $set: updateFields },
        { new: true, runValidators: true }
    ).catch((e) => {
        console.error(e);
        throw new ClientError('Error al actualizar el usuario', 500);
    });

    // Responder con el usuario actualizado
    response(res, 200, updatedUser);
};




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
        file['originalname'] = `${userAux.dni}_${payrollMonth}_${payrollYear}_${userAux.firstName}_${userAux.lastName}.pdf`;

        // Subir archivo a Google Drive
        const fileAux = await uploadFileToDrive(file, '1jQAvrTL7zasN1X5vpbX_bA2mH1eOghge');

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
        console.error(error);
        return null;
    }
};

// Función para validar campos requeridos
const validateRequiredFields = (body, fields) => {
    for (const field of fields) {
        if (!body[field]) {
            throw new ClientError(`El campo ${field} es requerido`, 400);
        }
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
    const requiredFields = ['payrollYear', 'payrollMonth'];
    const file = req.file;  // El archivo puede no estar presente en algunos casos

    if (req.body.type === 'create') {
        if (!file) {
            throw new ClientError('El archivo es requerido para la creación de nóminas', 400);
        }
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


        const payroll = await getFileById(req.body.pdf);
        if (payroll && payroll.file && payroll.file.id) {
            // Establecer los encabezados para la descarga del archivo
            res.setHeader('Content-Type', payroll.file.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename=${payroll.file.name}`);
            // Pipear el stream al response
            payroll.stream.pipe(res); // Enviar el stream directamente al cliente
        } else {
            throw new ClientError('No se ha podido encontrar el archivo', 404);
        }
    }
};

// Función para convertir IDs dentro de los datos de contratación
const convertIds = (hirings) => {
    return hirings.map(hiring => {
        // Validar y convertir position._id
        if (!hiring.position || !hiring.position._id) {
            throw new ClientError('El campo position._id es requerido', 400);
        }
        hiring.position = new mongoose.Types.ObjectId(hiring.position._id);

        // Validar y convertir device.id
        if (!hiring.device || !hiring.device.id) {
            throw new ClientError('El campo device.id es requerido', 400);
        }
        hiring.device = new mongoose.Types.ObjectId(hiring.device.id);

        // Validar y convertir leavePeriods.leaveType.id
        if (Array.isArray(hiring.leavePeriods)) {
            hiring.leavePeriods = hiring.leavePeriods.map(period => {
                if (!period.leaveType || !period.leaveType.id) {
                    throw new ClientError('El campo leaveType.id es requerido en leavePeriods', 400);
                }
                period.leaveType = new mongoose.Types.ObjectId(period.leaveType.id);
                return period;
            });
        } else {
            hiring.leavePeriods = []; // Manejar el caso en el que leavePeriods no sea un array
        }

        return hiring;
    });
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
        if (!Array.isArray(req.body.hirings)) {
            throw new ClientError('El campo hirings debe ser un array', 400);
        }

        // Convertir los IDs en los datos de contratación
        const cuerpo = convertIds(req.body.hirings);

        // Realizar la operación en MongoDB
        let data;
        if (req.body.type === 'put') {
            data = await User.findOneAndUpdate(
                { _id: req.body.userId },
                { $set: { hiringPeriods: cuerpo } }, // Actualización completa del array
                { new: true } // Devolver el documento actualizado
            );
        }

        response(res,200,data)
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
}
