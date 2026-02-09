// controllers/toolsServiceController.js
const { User } = require('../models/indexModels');
const { response, ClientError, catchAsync } = require('../utils/indexUtils');
const { uploadFileToDrive } = require('./googleController');

const TOOLS_BASE_URL = process.env.TOOLS_BASE_URL;
const API_KEY_BACK = process.env.API_KEY_BACK;
const PHOTOUSER_FOLDER= process.env.GOOGLE_DRIVE_PHOTOUSER;

const assertConfig = () => {
  if (!TOOLS_BASE_URL) throw new ClientError('Falta TOOLS_BASE_URL en .env', 500);
  if (!API_KEY_BACK) throw new ClientError('Falta API_KEY_BACK en .env', 500);
};

// === [TOOLS_PROFILE_512_CONTROLLER] START ===
// Ruta: POST /api/tools/profile
// Multer memoryStorage => req.file.buffer
const removeBgProfile512FromBuffer = async (req, res) => {
  assertConfig();

  const file = req.file;
  const idUser=req.body.idUser
  if (!file) throw new ClientError('Falta archivo (field "file")', 400);

  // (opcional) valida mimetype
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (file.mimetype && !allowed.has(file.mimetype)) {
    throw new ClientError('Formato no permitido. Usa JPG, PNG o WEBP', 400);
  }



  const url = `${TOOLS_BASE_URL.replace(/\/$/, '')}/image/profile-512`;

  // Node 20: FormData/Blob global
  const fd = new FormData();
  fd.append(
    'image_file',
    new Blob([file.buffer], { type: file.mimetype || 'image/jpeg' }),
    file.originalname || 'profile'
  );

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Api-Key': API_KEY_BACK,
      // NO pongas Content-Type, fetch lo pone con boundary
      Accept: 'image/png',
    },
    body: fd,
  });


  if(!r.ok){
    const t = await r.text().catch(() => '');
    const message='La redimensión falló' ;
    throw new Error(message)
  }

  const driveName=`${idUser}_photoProfile`

  const fileDriveAux=uploadFileToDrive(r, PHOTOUSER_FOLDER, driveName)
  //subir aarchivo a google, 
  const idDrive=fileDriveAux.id

  const userAux=User.findByIdAndUpdate(
    idUser,
    { $set: { photoProfile: idDrive } },
    { new: true, runValidators: true }
);
  
  //devolver al usuario actualizado
    response(res, 200, userAux)  
};
// === [TOOLS_PROFILE_512_CONTROLLER] END ===

module.exports = {
  removeBgProfile512FromBuffer: catchAsync(removeBgProfile512FromBuffer),
};
