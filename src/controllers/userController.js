const { User, Program } = require('../models/indexModels');
const { prevenirInyeccionCodigo, esPassSegura, catchAsync, response, generarHashpass, ClientError } = require('../utils/indexUtils');
const { faker } = require('@faker-js/faker');
const mongoose = require('mongoose');
const { createAccentInsensitiveRegex } = require('../utils/utils');
const { uploadFile } = require('./ovhController');


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

    if(!req.body.password){
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
                await program.save().catch((x)=>console.log(x));  // Guardar los cambios en el programa
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
            console.log(uploadFile)
            fileUploadPromises.push(uploadPromise);

            // Asociar el nombre del archivo subido al campo correspondiente en el usuario
            savedUser[fieldName] = uniqueFileName;
        }
    }

    // Esperar a que todos los archivos se suban
    const subida=await Promise.all(fileUploadPromises).catch((e)=>console.log(e));
    // Guardar nuevamente el usuario con los nombres de archivos actualizados
    await savedUser.save();

    // Responder con el usuario guardado
    response(res, 200, savedUser);
};





//recoge todos los usuarios
const getUsers = async (req, res) => {
    if (!req.body.page || !req.body.limit) throw new ClientError("Faltan datos no son correctos", 400);

    const page = parseInt(req.body.page) || 1; // Página actual, por defecto página 1
    const limit = parseInt(req.body.limit) || 10; // Tamaño de página, por defecto 10 documentos por página
    const filters = {};

    // Filtros adicionales
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
    if (req.body.status) filters["employmentStatus"] = req.body.status;

    if(req.body.dispositiveNow) filters["dispositiveNow"]=req.body.dispositiveNow
    // Filtrado por ID del programa
    if (req.body.programId && mongoose.Types.ObjectId.isValid(req.body.programId)) {
        // Buscar el programa específico por ID
        const program = await Program.findById(req.body.programId);
        if (!program) {
            throw new ClientError("Programa no encontrado", 404);
        }
        // Obtener los IDs de los dispositivos asociados a ese programa
        const deviceIds = program.devices.map(device => device._id);
        // Agregar filtro para los usuarios que tienen un dispositiveNow asociado a los dispositivos del programa
        filters.dispositiveNow = { $in: deviceIds };
    }

    if (req.body.dispositive && mongoose.Types.ObjectId.isValid(req.body.dispositive)) filters["dispositiveNow"] = req.body.dispositive;

    // Contar el total de documentos que coinciden con los filtros
    const totalDocs = await User.countDocuments(filters);

    // Calcular el número total de páginas
    const totalPages = Math.ceil(totalDocs / limit);

    // Obtener los usuarios que coinciden con los filtros, con paginación
    const users = await User.find(filters)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    // Responder con la lista de usuarios paginada y código de estado 200 (OK)
    response(res, 200, { users, totalPages });
}

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

// modificar el usuario
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
    
    // Parsear el campo hiringPeriods de JSON si existe
    if (req.body.hiringPeriods) {
        try {
            updateFields.hiringPeriods = JSON.parse(req.body.hiringPeriods);
        } catch (error) {
            throw new ClientError('El periodo de contratación no tiene un formato válido', 400);
        }
    }
    
    // Parsear responsibleDevices de JSON si existe
    if (req.body.responsibleDevices) {
        try {
            updateFields.responsibleDevices = JSON.parse(req.body.responsibleDevices);
        } catch (error) {
            throw new ClientError('El responsibleDevices no tiene un formato válido', 400);
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
    updateFields.leavePeriods = req.body.leavePeriods;
    updateFields.payrolls = req.body.payrolls;
    updateFields.vacationDays=req.body.vacationDays;
    updateFields.personalDays=req.body.personalDays;
    
    // Validar y actualizar dispositiveNow
    if (req.body.dispositiveNow !== undefined && req.body.dispositiveNow !== "undefined") {
        updateFields.dispositiveNow = req.body.dispositiveNow === "null" ? null : req.body.dispositiveNow;
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
    const fileUpdate=await Promise.all(fileUploadPromises)

    // Realizar la actualización con findOneAndUpdate
    const updatedUser = await User.findOneAndUpdate(
        { _id: req.body._id },
        { $set: updateFields },
        { new: true, runValidators: true }
    );
    
    // Responder con el usuario actualizado
    response(res, 200, updatedUser);
    
};





// Crear usuario aleatorio con subesquemas
const postCreateUserRandom = async (req, res) => {
    // Generar contraseña segura aleatoria
    const randomPassword = faker.internet.password();
    const passSegura = await generarHashpass(randomPassword);

    // Generar datos aleatorios para subesquemas
    const hiringPeriods = Array.from({ length: faker.number.int({ min: 1, max: 3 }) }).map(() => ({
        position: faker.person.jobTitle(),
        category: faker.helpers.arrayElement(['grupo 1', 'grupo 2', 'grupo 3']),
        startDate: faker.date.past(),
        endDate: faker.date.future(),
        workShift: {
            nota: faker.lorem.sentence(),
            type: faker.helpers.arrayElement(['total', 'parcial'])
        },
        selectionProcess: new mongoose.Types.ObjectId() // Este debería ser un ID válido de 'Bag'
    }));



    const leavePeriods = Array.from({ length: faker.number.int({ min: 0, max: 2 }) }).map(() => ({
        leaveType: faker.helpers.arrayElement(['excedencia voluntaria', 'excedencia forzosa', 'enfermedad común', 'accidente laboral', 'maternidad', 'riesgo emparazo', 'lactancia']),
        startLeaveDate: faker.date.past(),
        expectedEndLeaveDate: faker.date.future(),
        actualEndLeaveDate: faker.date.future()
    }));



    const payrolls = Array.from({ length: faker.number.int({ min: 1, max: 12 }) }).map(() => ({
        payrollDate: faker.date.past(),
        pdf: faker.internet.url(),
        seen: faker.datatype.boolean()
    }));



    // Crear el nuevo usuario con datos aleatorios
    const newUser = new User({
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        pass: passSegura,
        role: faker.helpers.arrayElement(['global', 'root', 'auditor', 'employer', 'responsable']),
        phone: faker.phone.number(),
        dni: faker.string.alphanumeric(10),
        dispositiveNow: faker.helpers.arrayElement(['66c437f6b1d4c8df004637e9', '66cecab2e4bac7389bd092d6']),
        employmentStatus: faker.helpers.arrayElement(['baja', 'activo', 'en proceso de contratación', 'excedencia']),
        hiringPeriods: hiringPeriods,
        leavePeriods: leavePeriods,
        payrolls: payrolls,
        socialSecurityNumber: faker.string.alphanumeric(11),
        bankAccountNumber: faker.finance.accountNumber(),
        cv: faker.internet.url(),
        sexualOffenseCertificate: faker.internet.url(),
        model145: faker.internet.url(),
        firePrevention: faker.internet.url(),
        contract: faker.internet.url(),
        employmentHistory: faker.internet.url(),
        dataProtection: faker.internet.url(),
        ethicalChannel: faker.internet.url(),
        dniCopy: faker.internet.url()
    });



    const savedUser = await newUser.save().catch((e) => {
        console.log(e);
        throw new ClientError("Error al guardar el usuario", 500);
    });
    // Respuesta con el usuario creado y los datos aleatorios generados
    response(res, 200, savedUser);
};

module.exports = {
    //gestiono los errores con catchAsync
    postCreateUser: catchAsync(postCreateUser),
    getUsers: catchAsync(getUsers),
    getUserID: catchAsync(getUserID),
    UserDeleteId: catchAsync(UserDeleteId),
    userPut: catchAsync(userPut),
    getUsersFilter: catchAsync(getUsersFilter),
    postCreateUserRandom: catchAsync(postCreateUserRandom)

}
