const { Program, Provinces, Dispositive, Filedrive } = require('../models/indexModels');
const { catchAsync, response, ClientError, toId } = require('../utils/indexUtils');
const mongoose = require('mongoose');
const { generateEmailHTML, sendEmail } = require('./emailControllerGoogle');
const { ensureWorkspaceGroupsForModel } = require('./workspaceController');



const postCreateProgram = async (req, res) => {

  const { name, acronym, area, active, responsible, finantial, about } = req.body;

  if (!name || !acronym) throw new ClientError('Falta datos', 400);

  const newProgram = new Program({
    name,
    acronym,
    area: area || "no identificado",
    active: active,
    responsible: Array.isArray(responsible) ? responsible.filter(id => mongoose.Types.ObjectId.isValid(id)) : [],
    finantial: Array.isArray(finantial) ? finantial.filter(id => mongoose.Types.ObjectId.isValid(id)) : [],
    about: {
      description: about?.description || "",
      objectives: about?.objectives || "",
      profile: about?.profile || "",
    }
  });

  //j



  const savedProgram = await newProgram.save();
  //crear grupos de workspace no critico y no espera
  void ensureWorkspaceGroupsForModel({
    type: 'program',
    id: savedProgram._id,
    requiredSubgroups: ['direction'],
  }).catch(err => {
    console.warn('⚠️ Workspace groups (program) falló:', savedProgram._id, err?.message || err);
  });

  // 5. Enviar el email al usuario con el código
  const asunto = "Creación de un nuevo programa";
  const textoPlano = `Area: ${savedProgram.area}
            Nombre: ${savedProgram.name}
            Creador: ${req.body?.userCreate}
            `;

  const htmlContent = generateEmailHTML({
    logoUrl: "https://app.engloba.org.es/graphic/logotipo_blanco.png",
    title: "Creación de un nuevo programa",
    greetingName: 'Persona maravillosa', // o user.nombre
    bodyText: 'Se ha creado un nuevo programa',
    highlightText: textoPlano, // el código que quieras resaltar
    footerText: "Gracias por usar nuestra plataforma. Si tienes dudas, contáctanos."
  });

  await sendEmail(['comunicacion@engloba.org.es', 'web@engloba.org.es'], asunto, textoPlano, htmlContent);
  response(res, 200, savedProgram);

};

// Recoger todos los programas con paginación y filtros
// Recoger todos los programas
const getPrograms = async (req, res) => {
  const programs = await Program.find().populate('funding').populate('devices.responsible');
  response(res, 200, programs);
};

// Recoger programa por ID
const getProgramID = async (req, res) => {
  const id = req.body.id;  // Usando body en lugar de params
  const program = await Program.findById(id).populate('funding')
    .catch(error => { throw new ClientError('Programa no encontrado', 404) });
  response(res, 200, program);
};

// Eliminar programa por ID
const ProgramDeleteId = async (req, res) => {
  const id = req.body.id;
  const ProgramDelete = await Program.deleteOne({ _id: id });
  response(res, 200, ProgramDelete);
};


const ProgramPut = async (req, res) => {
  const { id, name, acronym, area, active, finantial, about, cronology, type, essentialDocumentationProgram, essentialDocumentationDevice } = req.body;
  let query = { _id: id };
  const updateObj = {};

  // Actualiza campos simples
  const update = {};
  if (name !== undefined) update.name = name;
  if (acronym !== undefined) update.acronym = acronym;
  if (area !== undefined) update.area = area;
  if (active !== undefined) update.active = active;
  if (Array.isArray(finantial)) update.finantial = finantial.filter(i => mongoose.Types.ObjectId.isValid(i));
  if (about) {
    if (about.description !== undefined) update['about.description'] = about.description;
    if (about.objectives !== undefined) update['about.objectives'] = about.objectives;
    if (about.profile !== undefined) update['about.profile'] = about.profile;
  };



  if (Object.keys(update).length) updateObj.$set = update;

  // Procesa documentación (solo "add" o "delete")
  const processDoc = (field, doc) => {
    if (!type || !['add', 'delete'].includes(type))
      throw new ClientError('Falta el tipo o es inválido para documentación', 400);
    if (!mongoose.Types.ObjectId.isValid(doc))
      throw new ClientError('Documento inválido', 400);
    return type === 'add'
      ? { $addToSet: { [field]: doc } }
      : { $pull: { [field]: doc } };
  };


  if (essentialDocumentationProgram !== undefined)
    Object.assign(updateObj, processDoc('essentialDocumentationProgram', essentialDocumentationProgram));
  if (essentialDocumentationDevice !== undefined)
    Object.assign(updateObj, processDoc('essentialDocumentationDevice', essentialDocumentationDevice));

  // Procesa cronology (se permiten "add", "delete" y "edit")
  if (cronology !== undefined) {
    if (!type || !['add', 'delete', 'edit'].includes(type))
      throw new ClientError('Falta el tipo o es inválido para cronology', 400);
    if (type === 'add') {
      Object.assign(updateObj, { $addToSet: { cronology } });
    } else if (type === 'delete') {
      if (!cronology._id)
        throw new ClientError('Falta _id para eliminar cronology', 400);
      Object.assign(updateObj, { $pull: { cronology: { _id: cronology._id } } });
    } else if (type === 'edit') {
      if (!cronology._id)
        throw new ClientError('Falta _id para editar cronology', 400);
      Object.assign(updateObj, { $set: { "cronology.$": cronology } });
      query["cronology._id"] = cronology._id;
    }
  }

  const program = await Program.findOneAndUpdate(query, updateObj, { new: true });
  if (!program) return response(res, 400, { error: "No existe el programa" });
  response(res, 200, program);
};






const getProgramId = async (req, res) => {
  if (!req.body.programId) {
    throw new ClientError("Falta el Id del Programa", 400);
  }

  const id = toId(req.body.programId);

  // 1) Obtener todos los archivos de ese programa
  const files = await Filedrive.find({ idModel: id });

  // 2) Obtener datos del programa + responsables
  let data = await Program.findById(id).populate([
    {
      path: "responsible",
      select: "firstName lastName email phoneJob",
    }
  ]);

  if (!data) {
    throw new ClientError("Programa no encontrado", 404);
  }

  // 3) Añadir los archivos a la respuesta
  data = data.toObject();
  data.files = files;

  response(res, 200, data);
};




module.exports = {
  postCreateProgram: catchAsync(postCreateProgram),
  getPrograms: catchAsync(getPrograms),
  getProgramID: catchAsync(getProgramID),
  ProgramDeleteId: catchAsync(ProgramDeleteId),
  ProgramPut: catchAsync(ProgramPut),
  getProgramId: catchAsync(getProgramId)
}
