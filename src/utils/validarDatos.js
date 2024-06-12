const { generarHashpass } = require('./indexUtils');

const validEmail =(email)=>{
  // Expresión regular para validar una dirección de correo electrónico
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Verificar si el correo electrónico coincide con la expresión regular
  return emailRegex.test(email);
  }

const validName=(name)=>{
    const caracteresProhibidos = /[<>]/;
    // Verificar si el input es un string
    if (typeof name !== 'string') return false;
    // Verificar la longitud del string
    if (name.length > 30) return false;
    // Verificar si hay caracteres especiales que podrían indicar intento de inyección de código
    if (caracteresProhibidos.test(name)) return false;
    // Si todo está bien, el string es válido
    return true;
}

const validDataString=(palabra)=>{
  const caracteresProhibidos = /[<>&"]/;

  // Verificar si hay caracteres especiales que podrían indicar intento de inyección de código
  if (caracteresProhibidos.test(palabra)) return false;
  // Si todo está bien, el string es válido
  return true;
}

const prevenirInyeccionCodigo=(cadenaEntrada)=>{
  // Codifica la cadena para evitar escape de HTML
  // Sanitiza la cadena para eliminar caracteres potencialmente dañinos
  return cadenaEntrada.replace(/[<>%\/"`\s]+/g, '_');
}

const validDate=(fecha)=>{
  // Utilizamos el operador typeof para verificar si el dato es un objeto Date
  return Object.prototype.toString.call(fecha) === '[object Date]';
}

const createDate=(fecha)=> {
    const date = new Date(fecha);
    return (!isNaN(date))?date:false;
}
  
const esPassSegura=(pass)=>{
  if (pass == undefined) return false
  // Verificar si la contraseña tiene al menos 8 caracteres
  if (pass.length < 8) {
    return false;
  }

  // Verificar si la contraseña contiene al menos una letra minúscula
  if (!/[a-z]/.test(pass)) {
    return false;
  }
  // Verificar si la contraseña contiene al menos una letra mayúscula
  if (!/[A-Z]/.test(pass)) {
    return false;
  }
  // Verificar si la contraseña contiene al menos un número
  if (!/\d/.test(pass)) {
    return false;
  }
  // Verificar si la contraseña contiene al menos un carácter especial
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
    return false;
  }
  // La contraseña cumple con todos los criterios
  return true;
  }

 const validText=(texto, longitudMinima, longitudMaxima, numerosycaracteresespeciales=false)=>{
    // Verificar la longitud del texto
    if (texto.length < longitudMinima || texto.length > longitudMaxima) {
        return false;
    }
  
    // Definir la expresión regular para caracteres permitidos (letras, números y espacios)
    const regex =(numerosycaracteresespeciales) ?/^[a-zA-ZÀ-ÿ0-9\s,º:/()]+$/:/^[a-zA-ZÀ-ÿ\s]+$/;
    return regex.test(texto);
  }
  
  
const validNumber=(texto, cero=false)=>{
    let regex =/^[1-9][0-9]*$/; 
    if(cero) regex =/^(0|[1-9][0-9]*)$/;
    return regex.test(texto);
  }
  
 const validDecimalNumber=(texto)=>{
    const regex =/^[0-9]+(\.[0-9]+)?$/;
    return regex.test(texto);
  }


  module.exports = {
    validEmail,
    esPassSegura,
    validName,
    validNumber,
    validDate,
    createDate,
    validDataString,
    prevenirInyeccionCodigo,
    validText,
    validDecimalNumber

  };






