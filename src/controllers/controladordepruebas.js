const { User,
    UserCv,
    Bag,
    Program,
    OfferJob,
    Jobs,
    Provinces,
    Studies,
    Work_schedule,
    Finantial,
    Leavetype } = require('../models/indexModels');
const mongoose = require('mongoose');

const keepUserIds = [
    "66c6ff7831c271eb98de3f11", // ID del usuario 1 que quieres conservar
    "66c701f241340927825102a5", // ID del usuario 2 que quieres conservar
    "66ebff2cb0d67369b6d525a8"  // ID del usuario 3 que quieres conservar
];

const deleteAllExcept = async () => {
    try {
        // Borra todos los usuarios excepto los especificados en keepUserIds
        const result = await User.deleteMany({
            _id: { $nin: keepUserIds } // $nin selecciona documentos cuyo _id NO está en keepUserIds
        });

        console.log(`${result.deletedCount} usuarios eliminados.`);
    } catch (error) {
        console.error("Error eliminando usuarios:", error);
    }
};



const addFictitiousHiringPeriod = async () => {
    try {
        // IDs de los usuarios a los que deseas agregar el hiringPeriod
        const userIds = [
            "66c6ff7831c271eb98de3f11", // ID del usuario 1
            "66c701f241340927825102a5", // ID del usuario 2
            "66ebff2cb0d67369b6d525a8"  // ID del usuario 3
        ];

        // LeavePeriods ficticios con diferentes fechas
        const fictitiousLeavePeriods = [
            {
                leaveType: new mongoose.Types.ObjectId("673dba22eb7280f56e22b500"), // Enfermedad Común
                startLeaveDate: new Date("2024-01-15"),
                expectedEndLeaveDate: new Date("2024-01-30"),
                actualEndLeaveDate: null
            },
            {
                leaveType: new mongoose.Types.ObjectId("673dba22eb7280f56e22b500"), // Enfermedad Común
                startLeaveDate: new Date("2024-02-10"),
                expectedEndLeaveDate: new Date("2024-02-20"),
                actualEndLeaveDate: null
            },
            {
                leaveType: new mongoose.Types.ObjectId("673dba22eb7280f56e22b500"), // Enfermedad Común
                startLeaveDate: new Date("2024-03-05"),
                expectedEndLeaveDate: new Date("2024-03-15"),
                actualEndLeaveDate: null
            }
        ];

        // HiringPeriod ficticio con múltiples leavePeriods
        const fictitiousHiringPeriod = {
            position: new mongoose.Types.ObjectId("66a7650f46af20840262d0c1"), // ID de un job existente
            category: "3",
            startDate: new Date("2024-01-01"),
            endDate: new Date("2024-12-31"),
            device: new mongoose.Types.ObjectId("66c437f6b1d4c8df004637e9"), // ID de un dispositivo existente
            workShift: {
                nota: "Jornada completa ficticia",
                type: "total"
            },
            selectionProcess: new mongoose.Types.ObjectId("66c6e9bad9ce3be900ea7b69"), // ID de un proceso de selección existente
            leavePeriods: fictitiousLeavePeriods // Agregar múltiples leavePeriods ficticios
        };

        // Actualizar los usuarios
        const result = await User.updateMany(
            { _id: { $in: userIds } }, // Filtro para los usuarios específicos
            { $push: { hiringPeriods: fictitiousHiringPeriod } } // Agregar el hiringPeriod ficticio con leavePeriods
        );

        console.log(`${result.modifiedCount} usuarios actualizados con el hiringPeriod y leavePeriods ficticios.`);
    } catch (error) {
        console.error("Error al agregar hiringPeriod ficticio:", error);
    }
};

// Llamar a la función






const createLeaveTypes = async () => {
    try {
        const leaveTypes = [
            { name: "Enfermedad Común" },
            { name: "Accidente No Laboral" },
            { name: "Enfermedad Profesional" },
            { name: "Accidente Laboral" },
            { name: "Excedencia Voluntaria" },
            { name: "Excedencia por Cuidado de Hijos o Familiares" },
            { name: "Excedencia Forzosa" }
        ];

        const results = await Leavetype.insertMany(leaveTypes, { ordered: true });
        console.log("Tipos de baja creados:", results);
    } catch (error) {
        if (error.code === 11000) {
            console.error("Ya existe un tipo de baja con el mismo nombre:", error.keyValue);
        } else {
            console.error("Error al crear tipos de baja laboral:", error);
        }
    }
};

const updateUsersDispositiveNow = async () => {
    try {
        // IDs de los tres usuarios que quieres modificar
        const userIds = [
            "66c6ff7831c271eb98de3f11", // ID del usuario 1
            "66c701f241340927825102a5", // ID del usuario 2
            "66ebff2cb0d67369b6d525a8"  // ID del usuario 3
        ];

        // Nuevos datos del campo dispositiveNow
        const newDispositiveNow = {
            _id: new mongoose.Types.ObjectId('66c43cc75cb90a4af8fc63f3'), // Usar 'new' para ObjectId
            name: 'CRB La Morana'
        };

        // Actualizar los usuarios
        const result = await User.updateMany(
            { _id: { $in: userIds } }, // Filtrar por IDs específicos
            { $set: { dispositiveNow: newDispositiveNow } } // Modificar el campo dispositiveNow
        );

    } catch (error) {
        console.error("Error al actualizar dispositiveNow");
    }
};


// Ejecutar la función
// addFictitiousHiringPeriod();
// deleteAllExcept();
// createLeaveTypes();
//updateUsersDispositiveNow


module.exports = {
    //gestiono los errores con catchAsync
    createLeaveTypes: createLeaveTypes,
    addFictitiousHiringPeriod:addFictitiousHiringPeriod,
    updateUsersDispositiveNow:updateUsersDispositiveNow

}