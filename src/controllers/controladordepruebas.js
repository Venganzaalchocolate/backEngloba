const { UserCv } = require('../models/indexModels');
const { catchAsync, response } = require('../utils/indexUtils');

// Función para actualizar ofertas de usuarios
const updateOfferForUsers = async (oldOfferId, newOfferId) => {
    try {
        // Actualizar todos los usuarios con el ID de oferta actual
        const result = await UserCv.updateMany(
            { offer: oldOfferId }, // Condición: usuarios con el ID de oferta actual
            { $set: { offer: newOfferId } } // Actualización: establecer el nuevo ID de oferta
        );

        return {
            message: "Usuarios actualizados correctamente.",
            modifiedCount: result.modifiedCount,
        };

    } catch (error) {
        // Devolver el error para que pueda ser manejado en `main`
        return error.message
    }
};

// Función principal
const main = async () => {
    try {


    } catch (error) {
        console.log(error.message);
    }
};

// main();

module.exports = {
    main: catchAsync(main),
};
