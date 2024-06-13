const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const { catchAsync } = require('../utils/catchAsync');
const fs = require('fs');

require('dotenv').config()

const accessToken = process.env.DROPBOX
const dbx = new Dropbox({ accessToken: accessToken });

const postUploadFile = async (req, res) => {
    const { file } = req;
    const { folderName, fileName } = req.body;

    if (!file) {
        return res.status(400).json({ error: "No hay archivo" });
    }

    if (!folderName) {
        return res.status(400).json({ error: "No hay nombre de carpeta" });
    }

    if (!fileName) {
        return res.status(400).json({ error: "No hay nombre de archivo" });
    }

    try {
        // Verifica si la carpeta existe
        try {
            await dbx.filesGetMetadata({
                path: `/${folderName}`,
            });
        } catch (error) {
            if (error.status === 409) {
                // Si la carpeta no existe, crea la carpeta en Dropbox
                await dbx.filesCreateFolderV2({
                    path: `/${folderName}`,
                    autorename: false,
                });
            } else {
                throw error;
            }
        }

        // Lee el archivo subido
        const fileContent = await fs.promises.readFile(file.path);

        // Verifica si el archivo ya existe en la carpeta
        let uploadPath = `/${folderName}/${fileName}`;
        try {
            const exist=await dbx.filesGetMetadata({
                path: `/${folderName}/${fileName}`,
            });

            if(exist.status==200){
            const currentDate = new Date().toISOString().replace(/[:.]/g, '-');
            console.log(currentDate)
            const ext = path.extname(fileName);
            console.log(ext)
            const baseName = path.basename(fileName, ext);
            uploadPath = `/${folderName}/${baseName}-${currentDate}${ext}`; 
            }
            // Si el archivo ya existe, añade la fecha actual al nombre del archivo
            
        } catch (error) {
            if (error.status !== 409) {
                throw error;
            }
        }

        // Sube el archivo
        const uploadFileResponse = await dbx.filesUpload({
            path: uploadPath, // Ruta completa del archivo en Dropbox
            contents: fileContent,
        });

        // Enviar respuesta exitosa
        res.status(200).json(uploadFileResponse);
    } catch (error) {
        console.error('Error al subir archivo:', error);
        res.status(500).json({ error: 'Error al subir archivo a Dropbox' });
    }
};




module.exports = {
    postUploadFile: catchAsync(postUploadFile)
}