const { UserCv, User } = require('../models/indexModels');
const { catchAsync, response, ClientError, resError } = require('../utils/indexUtils');
const { dateAndHour, getSpainCurrentDate, createAccentInsensitiveRegex } = require('../utils/utils');
const { deleteFile } = require('./ovhController');

// crear usuario
const postCreateUserCv = async (req, res) => {
    if (!req.body.email || !req.body.phone || !req.body.jobs || !req.body.studies || !req.body.provinces || !req.body.work_schedule) throw new ClientError("Los datos no son correctos", 400);
    let dataUser = {
        date: new Date(),
        name: req.body.firstName.toLowerCase()+' '+req.body.lastName.toLowerCase(),
        email: req.body.email.toLowerCase(),
        phone: req.body.phone,
        jobs: req.body.jobs,
        studies:req.body.studies,
        provinces: req.body.provinces,
        work_schedule:req.body.work_schedule,
        firstName:req.body.firstName.toLowerCase(),
        lastName:req.body.lastName.toLowerCase(),
        gender:req.body.gender
    }

    if (!!req.body.dni) {               // el doble !! no hace falta
        const dni = req.body.dni.trim().toUpperCase();  // opcional: trim para limpiar espacios
        dataUser['dni'] = dni;           // usa notación punto o corchetes, ambas valen
      }
    if (!!req.body.about) dataUser['about'] = req.body.about
    if (!!req.body.offer) dataUser['offer'] = req.body.offer
    if (!!req.body.job_exchange) dataUser['job_exchange'] = req.body.job_exchange
    if(!!req.body.disability) dataUser['disability']= req.body.disability
    if (!!req.body.fostered) {
        dataUser['fostered'] = req.body.fostered === 'si';
      }

    const newUserCv = new UserCv(dataUser)
    const savedUserCv = await newUserCv.save();
    response(res, 200, savedUserCv)
}

//recoge todos los usuarios
const getUserCvs = async (req, res) => {
    if (!req.body.page || !req.body.limit) throw new ClientError("Faltan datos no son correctos", 400);
    const page = parseInt(req.body.page) || 1; // Página actual, por defecto página 1
    const limit = parseInt(req.body.limit) || 10; // Tamaño de página, por defecto 10 documentos por página


    const filters = {};
    if (req.body.name) {
        const nameRegex = createAccentInsensitiveRegex(req.body.name);
        filters["name"] = { $regex: nameRegex };
    }
    if (req.body.email) filters["email"] = { $regex: req.body.email, $options: 'i' };
    if (req.body.phone) filters["phone"] = { $regex: req.body.phone, $options: 'i' };
    if (req.body.jobs && req.body.jobs.length > 0) filters["jobs"] = { $in: req.body.jobs };
    if (req.body.provinces && req.body.provinces.length > 0) filters["provinces"] = { $in: req.body.provinces };
    if (req.body.work_schedule && req.body.work_schedule.length > 0) filters["work_schedule"] = { $in: req.body.work_schedule };
    if (req.body.studies && req.body.studies.length > 0) filters["studies"] = { $in: req.body.studies };

    if (req.body.fostered === 'si') {
        filters.fostered = true;
      } else if (req.body.fostered === 'no') {
        filters.fostered = false;
      }

    if (req.body.offer) filters["offer"] = req.body.offer;

    if (req.body.users) filters["_id"]={ $in: req.body.users }

    if (req.body.view !== undefined) {
        filters["view"] = req.body.view == '0' ? null  : { $ne: null };
    }

    if (req.body.favorite !== undefined) {
        filters["favorite"] = (req.body.favorite=='0') ? null : { $ne: null };
    }

    if (req.body.reject !== undefined) {
        filters["reject"] = req.body.reject == '0' ? null : { $ne: null };
    }

    if (req.body.disability > 0) {
        filters.disability = { $gt: 0 };
      }



    const totalDocs = await UserCv.countDocuments(filters);

    // Calcular el número total de páginas
    const totalPages = Math.ceil(totalDocs / limit);
    // Utiliza el método find() de Mongoose con skip() y limit() para paginar

    const users = await UserCv.find(filters).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)

      // 2. Reunimos los DNIs de todos los userCV encontrados
  const dnis = users.map((userCv) => userCv.dni);

  // 3. Buscamos si existen usuarios en la colección 'User' con alguno de esos DNIs
  const usersInEngloba = await User.find({ dni: { $in: dnis } });
  // 4. Creamos un set con los DNIs encontrados en 'User' para luego hacer una comprobación rápida
  const dnisSet = new Set(usersInEngloba.map((u) => u.dni));

  // 5. Recorremos los userCV y añadimos un nuevo campo indicando si ha trabajado en Engloba
  const usersWithEnglobaInfo = users.map((userCv) => {
    // Convertimos a objeto plain (para poder añadir campos sin problemas)
    const userCvObj = userCv.toObject();
    // El campo `workedInEngloba` será true si el DNI está en 'dnisSet'
    userCvObj.workedInEngloba = dnisSet.has(userCv.dni);
    return userCvObj;
  });


    // Responde con la lista de usuarios paginada y código de estado 200 (OK)
    response(res, 200, { users:usersWithEnglobaInfo, totalPages });

}

const getUserCvsFilter = async (req, res) => {
    let filter={}
    if(req.body.dni) filter = { dni: req.body.dni };
    else if(req.body.phone) filter = { phone: req.body.phone };
    else if(req.body.id) filter = { _id: req.body.id };
    // Utiliza el método find() de Mongoose para obtener todos los documentos en la colección
    const usuarios = await UserCv.find(filter);
    // Responde con la lista de usuarios y código de estado 200 (OK)
    response(res, 200, usuarios);
}


//busca un usuario por ID
const getUsersCvsIDs = async (req, res) => {
    // Obtén el ID del parámetro de la solicitud
    const userIds = req.body.ids;
    // Utiliza el método findById() de Mongoose para buscar un usuario por su ID
    // Si no se encuentra el usuario, responde con un código de estado 404 (Not Found)
    const usuarios = await UserCv.find({ _id: { $in: userIds } })
    const dnis = usuarios.map((userCv) => userCv.dni);

    // 3. Buscamos si existen usuarios en la colección 'User' con alguno de esos DNIs
    const usersInEngloba = await User.find({ dni: { $in: dnis } });
    // 4. Creamos un set con los DNIs encontrados en 'User' para luego hacer una comprobación rápida
    const dnisSet = new Set(usersInEngloba.map((u) => u.dni));
  
    // 5. Recorremos los userCV y añadimos un nuevo campo indicando si ha trabajado en Engloba
    const usersWithEnglobaInfo = usuarios.map((userCv) => {
      // Convertimos a objeto plain (para poder añadir campos sin problemas)
      const userCvObj = userCv.toObject();
      // El campo `workedInEngloba` será true si el DNI está en 'dnisSet'
      userCvObj.workedInEngloba = dnisSet.has(userCv.dni);
      return userCvObj;
    });
  

    // Responde con el usuario encontrado y código de estado 200 (OK)
    response(res, 200, usersWithEnglobaInfo);
}

const getUserCvID=()=>{

}

// borrar un usuario
const UserCvDeleteId = async (req, res) => {
    const filter = { _id: req.body._id };
    const deleteFileAux= await deleteFile(req.body._id)
    if(deleteFileAux) responseDelete=await UserCv.deleteOne(filter);
    else throw new ClientError('No se ha podido borrar el cv', 400)
    response(res, 200, {userDelete:true});
}

// modificar el usuario
const UserCvPut = async (req, res) => {
    const filter = { _id: req.body._id };
    const updateText = {};
    if (!!req.body.name) updateText['name'] = req.body.name;
    if (!!req.body.email) updateText['email'] = req.body.email;
    if (!!req.body.dni) {               // el doble !! no hace falta
        const dni = req.body.dni.trim().toUpperCase();  // opcional: trim para limpiar espacios
        updateText.dni = dni;           // usa notación punto o corchetes, ambas valen
      }
    if (!!req.body.phone) updateText['phone'] = req.body.phone;
    if (!!req.body.jobs) updateText['jobs'] = req.body.jobs;
    if (!!req.body.studies) updateText['studies'] = req.body.studies;
    if (!!req.body.provinces) updateText['provinces'] = req.body.provinces;
    if (!!req.body.about) updateText['about'] = req.body.about
    if (!!req.body.offer) updateText['offer'] = req.body.offer
    if (!!req.body.work_schedule) updateText['work_schedule'] = req.body.work_schedule
    if (!!req.body.job_exchange) updateText['job_exchange'] = req.body.job_exchange
    if (!!req.body.numberCV) updateText['numberCV'] = req.body.numberCV
    if(!!req.body.gender)updateText['gender'] = req.body.gender
    // Manejo de comentarios
    const dateNow = new Date();
    // Manejar comentarios independientes

    if (req.body.fostered !== undefined) {
        updateText['fostered'] = (req.body.fostered === 'si');
    }

    if (req.body.commentsPhone) {
        updateText['view'] = req.body.id
        updateText['$push'] = {
            commentsPhone: {
                userCv: req.body.id,
                nameUser: req.body.nameUserComment,
                date: dateNow,
                message: req.body.commentsPhone
            }
        };
    }

    if (req.body.commentsVideo) {
        updateText['view'] = req.body.id
        updateText['$push'] = {
            commentsVideo: {
                userCv: req.body.id,
                nameUser: req.body.nameUserComment,
                date: dateNow,
                message: req.body.commentsVideo
            }
        };
    }

    if (req.body.commentsInperson) {
        updateText['view'] = req.body.id
        updateText['$push'] = {
            commentsInperson: {
                userCv: req.body.id,
                nameUser: req.body.nameUserComment,
                date: dateNow,
                message: req.body.commentsInperson
            }
        };
    }

    if (req.body.notes) {
        updateText['view'] = req.body.id
        updateText['$push'] = {
            notes: {
                userCv: req.body.id,
                nameUser: req.body.nameUserComment,
                date: dateNow,
                message: req.body.notes
            }
        };
    }


    if (!!req.body.view || req.body.view==null) updateText['view'] = req.body.view
    if (!!req.body.favorite || req.body.favorite==null) updateText['favorite'] = req.body.favorite
    if (!!req.body.reject || req.body.reject==null) updateText['reject'] = req.body.reject

    let doc = await UserCv.findOneAndUpdate(filter, updateText,  { new: true });
    if (doc == null)  throw new ClientError("No existe el usuario", 400)
    response(res, 200, doc);
}




module.exports = {
    //gestiono los errores con catchAsync
    postCreateUserCv: catchAsync(postCreateUserCv),
    getUserCvs: catchAsync(getUserCvs),
    getUserCvID: catchAsync(getUserCvID),
    UserCvDeleteId: catchAsync(UserCvDeleteId),
    UserCvPut: catchAsync(UserCvPut),
    getUserCvsFilter: catchAsync(getUserCvsFilter),
    getUsersCvsIDs:catchAsync(getUsersCvsIDs)
}
