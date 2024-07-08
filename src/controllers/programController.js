const { Program } = require('../models/indexModels');
const { prevenirInyeccionCodigo, esPassSegura, validName, validEmail, catchAsync, response, generarHashpass, ClientError, sendEmail } = require('../utils/indexUtils');
const { dateAndHour } = require('../utils/utils');
/*
const fileSchema = new Schema({
  fileName: { type: String, required: true },
  fileTag: { type: String, required: true }
});

const deviceSchema = new Schema({
    name: { type: String, required: true },
    funding: { type: String, required: true },
    address: { type: String, required: true },
    files: [fileSchema],
    responsible: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
    protectionPlan: { type: String, required: true },
    organizationChart: { type: Boolean, required: true },
    operatingAuthorization: { type: Boolean, required: true },
    accidentInsurance: { type: Boolean, required: true },
    civilLiabilityInsurance: { type: Boolean, required: true },
    accidentInsuranceAgain: { type: Boolean, required: true }, // Duplicate entry in the provided table
    pestControl: { type: Boolean, required: true },
    fireExtinguishers: { type: Boolean, required: true },
    homeInsurance: { type: Boolean, required: true },
    multiRiskInsurance: { type: Boolean, required: true },
    rent: { type: Boolean, required: true },
    fireDrill: { type: Boolean, required: true }
});

const programSchema = new Schema({
  funding: {
    type: String,
    enum: ['Concierto', 'FSE', 'IRPF', 'NextGen', 'IAM'],
    required: true
  },
  name: { type: String, required: true },
  acronym: { type: String, required: true },
  files: [fileSchema],
  responsible: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
  devices: [deviceSchema]
});

*/
// crear usuario
const postCreateProgram = async (req, res) => {
    if (!req.body.funding || !req.body.name || !req.body.acronym ) throw new ClientError("Los datos no son correctos", 400);

    let dataProgram = {
        funding: req.body.funding,
        name: req.body.name,
        acronym: req.body.acronym,
    }


    const newProgram = new Program(dataProgram)
    const savedProgram = await newProgram.save();

    response(res, 200, savedProgram)
}

//recoge todos los usuarios
const getPrograms = async (req, res) => {
    try {
        const programs = await Program.find()
        // Responde con la lista de usuarios paginada y código de estado 200 (OK)
        response(res, 200, programs);
    } catch (error) {
        // Manejo de errores
        response(res, 500, { error: 'Error al obtener los programas' });
    }
}

const getProgramID = async (req, res) => {
    // Obtén el ID del parámetro de la solicitud
    const id = req.params.id;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const program = await Program.findById(id).catch(error => { throw new ClientError('Programa no encontrado', 404) });
    // Responde con el usuario encontrado y código de estado 200 (OK)
    response(res, 200, program);
}

const ProgramDeleteId = async (req, res) => {
    const id = req.params.id;
    const ProgramDelete = await Program.deleteOne({ _id: id });
    response(res, 200, ProgramDelete);
}

// modificar el usuario
const ProgramPut = async (req, res) => {
    const filter = { _id: req.body._id };
    const updateText = {};
    if (!!req.body.funding) updateText['funding'] = req.body.name;
    if (!!req.body.name) updateText['name'] = req.body.email;
    if (!!req.body.acronym) updateText['acronym'] = req.body.phone;

    if (req.body.files) {
        updateText['$push'] = {
            file: {
                fileName: req.body.fileName,
                fileTag: req.body.fileTag
            }
        };
    }


    let doc = await Program.findOneAndUpdate(filter, updateText,  { new: true });
    if (doc == null)  throw new ClientError("No existe el programa", 400)
    response(res, 200, doc);
}

const addDispositive= async(req,res)=>{
    const filter = { _id: req.body._id };
    
    const updateText = {};
    if (!!req.body.funding) updateText['funding'] = req.body.funding;
    if (!!req.body.name) updateText['name'] = req.body.name;
    if (!!req.body.address) updateText['address'] = req.body.address;

    if (req.body.protectionPlan!=undefined) updateText['protectionPlan'] = req.body.protectionPlan;
    if (req.body.organizationChart!=undefined) updateText['organizationChart'] = req.body.organizationChart;
    if (req.body.operatingAuthorization!=undefined) updateText['operatingAuthorization'] = req.body.operatingAuthorization;
    if (req.body.accidentInsurance!=undefined) updateText['accidentInsurance'] = req.body.accidentInsurance;
    if (req.body.civilLiabilityInsurance!=undefined) updateText['civilLiabilityInsurance'] = req.body.civilLiabilityInsurance;
    if (req.body.accidentInsuranceAgain!=undefined) updateText['accidentInsuranceAgain'] = req.body.accidentInsuranceAgain;
    if (req.body.pestControl!=undefined) updateText['pestControl'] = req.body.pestControl;
    if (req.body.fireExtinguishers!=undefined) updateText['fireExtinguishers'] = req.body.fireExtinguishers;
    if (req.body.homeInsurance!=undefined) updateText['homeInsurance'] = req.body.homeInsurance;
    if (req.body.multiRiskInsurance!=undefined) updateText['multiRiskInsurance'] = req.body.multiRiskInsurance;
    if (req.body.rent!=undefined) updateText['rent'] = req.body.rent;
    if (req.body.fireDrill!=undefined) updateText['fireDrill'] = req.body.fireDrill;

    const updateProgram={
        '$push':updateText
    }

    let doc = await Program.findOneAndUpdate(filter, updateProgram,  { new: true });
    if (doc == null)  throw new ClientError("No existe el programa", 400)
    response(res, 200, doc)
}

const crearProgrmasPrueba = async (req, res) => {
    const auxFunding = ['Concierto', 'FSE', 'IRPF', 'NextGen', 'IAM'];
    let contador = 0;

    try {
        for (let index = 0; index < 10; index++) {
            let auxData = {
                funding: auxFunding[Math.floor(Math.random() * auxFunding.length)],
                name: 'nombre' + contador,
                acronym: 'n' + contador,
            };

            const newProgram = new Program(auxData);
            const savedProgram = await newProgram.save();

            // Generar dispositivos para el programa recién creado
            for (let j = 0; j < 5; j++) {
                let auxFundingD = auxFunding[Math.floor(Math.random() * auxFunding.length)];
                let auxDispositive = {
                    funding: auxFundingD,
                    name: savedProgram.name + '_dispositivo_' + j,
                    address: 'jkshbihabijhbkjbk iahbdfihab', // Corregir 'adress' a 'address'
                };

                // Actualizar el programa con el nuevo dispositivo usando $push
                const updateProgram = {
                    $push: { devices: auxDispositive }, // Usar $push correctamente
                };

                const filter = { _id: savedProgram._id };
                await Program.findOneAndUpdate(filter, updateProgram, { new: true });
            }

            contador++;
        }

        res.status(200).json({ message: 'Programas de prueba creados exitosamente' });
    } catch (error) {
        console.error('Error al crear programas de prueba:', error);
        res.status(500).json({ error: 'Error al crear programas de prueba' });
    }
};



//work_schedule

module.exports = {
    //gestiono los errores con catchAsync
    postCreateProgram: catchAsync(postCreateProgram),
    getPrograms: catchAsync(getPrograms),
    getProgramID: catchAsync(getProgramID),
    ProgramDeleteId: catchAsync(ProgramDeleteId),
    ProgramPut: catchAsync(ProgramPut),
    crearProgrmasPrueba:catchAsync(crearProgrmasPrueba)
}
