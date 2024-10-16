
const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');


// Cargar credenciales desde una ruta diferente según el entorno
const keyFilePath = process.env.NODE_ENV === 'production'
  ? path.join('/etc/secrets/credenciales.json')
  : path.join(__dirname, '../database/credenciales.json');
// Cargar credenciales desde un archivo JSON
const auth = new google.auth.GoogleAuth({
  keyFile: keyFilePath,
  scopes: ['https://www.googleapis.com/auth/drive'],
});

// Crear el cliente de Google Drive
const drive = google.drive({ version: 'v3', auth });

async function uploadFile() {
  try {
    //https://drive.google.com/drive/folders/1zobB2yRQ94MWs0rfrV_chZTD2wMXfPSj?usp=drive_link
    const fileMetadata = {
      name: 'example.txt',
      parents: ['1zobB2yRQ94MWs0rfrV_chZTD2wMXfPSj'], // Reemplaza 'folderId' con el ID de la carpeta destino
    };
    const media = {
      mimeType: 'text/plain',
      body: fs.createReadStream('src/controllers/testfile.txt'), // Ruta del archivo a subir
    };

    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    console.log('File uploaded, ID:', res.data.id);
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}


const watchFolder = async (folderId, webhookUrl) => {

  try {
    const res = await drive.files.watch({
      fileId: folderId,
      requestBody: {
        id: 'unique-channel-id', // Identificador único para el canal de notificación
        type: 'webhook',
        address: webhookUrl, // URL del webhook
      },
    });
    console.log('Webhook registrado:', res.data);
  } catch (error) {
    console.error('Error al configurar el webhook:', error);
  }
};



async function listFiles(folderId, pageToken = null) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 500, // Cambia esto según el número de archivos que desees en cada página
      pageToken: pageToken,
    });

    res.data.files.forEach(file => {
      console.log(`${file.name} (${file.id})`);
    });

    // Si hay más páginas, vuelve a llamar a la función con el nextPageToken
    if (res.data.nextPageToken) {
      await listFiles(folderId, res.data.nextPageToken);
    }
  } catch (error) {
    console.error('Error listing files:', error);
  }
}

const notification=async(req,res)=>{
    const usuario = 'hay cambios';
    response(res,200,usuario)

}

module.exports={
  listFiles,
  watchFolder,
  notification
}