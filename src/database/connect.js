require('dotenv').config();
const mongoose = require('mongoose');


const connectToDatabase = async () => {
    try {
      const uri = `mongodb+srv://comunicacion:${process.env.PASS}@engloba.knu8mxl.mongodb.net/?retryWrites=true&w=majority&appName=${process.env.BBDDNAME}`;
      await mongoose.connect(uri);
      console.log('Conexión exitosa a MongoDB');
    } catch (error) {
      console.error('Error de conexión a MongoDB:', error.message);
      process.exit(1); // Finalizar el proceso en caso de error
    }
  };

  

  

module.exports = { connectToDatabase };