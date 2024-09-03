const { User, Program } = require('../models/indexModels');
const { prevenirInyeccionCodigo, esPassSegura, catchAsync, response, generarHashpass, ClientError } = require('../utils/indexUtils');
const { faker } = require('@faker-js/faker');
const mongoose = require('mongoose');
const { createAccentInsensitiveRegex } = require('../utils/utils');
const { uploadFile } = require('./ovhController');

// crear usuario
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
    const passSegura = await generarHashpass(req.body.dni);

    // Crear la instancia del usuario sin guardar los archivos aún
    const newUser = new User({
        firstName: req.body.firstName,
        email: req.body.email,
        pass: passSegura,
        role: req.body.role || 'employer',
        phone: req.body.phone,
        dni: req.body.dni,
        lastName: req.body.lastName || '',
        employmentStatus: req.body.employmentStatus || 'en proceso de contratación',
        dispositiveNow: req.body.dispositiveNow === "null" ? null : req.body.dispositiveNow,
        socialSecurityNumber: req.body.socialSecurityNumber || '',
        bankAccountNumber: req.body.bankAccountNumber || '',
        hiringPeriods: req.body.hiringPeriods || [],
        leavePeriods: req.body.leavePeriods || [],
        payrolls: req.body.payrolls || []
    });

    // Guardar el usuario en la base de datos para obtener su ID
    const savedUser = await newUser.save();
    const userId = savedUser._id;

    // Crear un array para almacenar las promesas de subida de archivos
    let fileUploadPromises = [];

    // Iterar sobre los archivos y subir cada uno
    for (const fieldName in files) {
        const fileArray = files[fieldName];
        for (const file of fileArray) {
            // Generar un nombre único para el archivo usando el ID del usuario, la clave del campo, y la fecha actual
            const timestamp = Date.now();
            const uniqueFileName = `${userId}-${fieldName}-${timestamp}.${file.originalname.split('.').pop()}`;

            // Llamar a la función uploadFile y almacenar la promesa
            const uploadPromise = uploadFile(file, uniqueFileName);
            fileUploadPromises.push(uploadPromise);

            // Asociar el nombre del archivo subido al campo correspondiente en el usuario
            savedUser[fieldName] = uniqueFileName;
        }
    }

    // Esperar a que todos los archivos se suban
    await Promise.all(fileUploadPromises);

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
    const filter = { _id: req.body.id };
    const updateText = {};
    if (req.body.nombre != null) updateText['name'] = prevenirInyeccionCodigo(req.body.nombre);
    if (req.body.email != null) updateText['email'] = prevenirInyeccionCodigo(req.body.email);
    if (req.body.direccion != null) updateText['direction'] = prevenirInyeccionCodigo(req.body.direccion);
    if (req.body.password != null && esPassSegura(req.body.password)) updateText['pass'] = await generarHashpass(req.body.password);
    if (req.body.role != null && (req.body.role == 'normal' || req.body.role == 'admin')) updateText['role'] = req.body.role;
    let doc = await User.findOneAndUpdate(filter, updateText);
    if (doc != null) doc = await User.findById(req.body.id)
    else throw new ClientError("No existe el usuario", 400)
    response(res, 200, doc);
}




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
