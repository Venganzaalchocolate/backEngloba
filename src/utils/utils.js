const dateAndHour = () => {
    const currentDate = new Date();
    const formattedDate = currentDate.getDate() + '-' +
        (currentDate.getMonth() + 1) + '-' +
        currentDate.getFullYear() + '_' +
        currentDate.getHours() + '-' +
        currentDate.getMinutes() + '-' +
        currentDate.getSeconds();
    return formattedDate
}

const getSpainCurrentDate = () => {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    
    // Horario de verano empieza el último domingo de marzo
    const startDST = new Date(year, 2, 31 - (new Date(year, 2, 31).getDay()));
    // Horario de verano termina el último domingo de octubre
    const endDST = new Date(year, 9, 31 - (new Date(year, 9, 31).getDay()));

    let spainOffset = 1; // UTC+1 para horario de invierno

    // Si estamos en horario de verano, UTC+2
    if (currentDate >= startDST && currentDate < endDST) {
        spainOffset = 2;
    }

    const spainDate = new Date(currentDate.getTime() + spainOffset * 60 * 60 * 1000);
    
    // Obtener día, mes y año
    const day = spainDate.getDate();
    const month = spainDate.getMonth() + 1; // Los meses son de 0 a 11, por eso sumamos 1
    const yearFormatted = spainDate.getFullYear();
    
    // Obtener horas, minutos y segundos
    const hours = spainDate.getHours();
    const minutes = spainDate.getMinutes();
    const seconds = spainDate.getSeconds();
    
    // Formatear en día_mes_año_hh:minuto:segundo
    const formattedDate = `${day}_${month}_${yearFormatted} ${hours}:${minutes}:${seconds}`;
    
    return formattedDate;
};

function createAccentInsensitiveRegex(str) {
    const accentMap = {
        'a': '[aáàâäãå]',
        'e': '[eéèêë]',
        'i': '[iíìîï]',
        'o': '[oóòôöõ]',
        'u': '[uúùûü]',
        'n': '[nñ]',
        'c': '[cç]'
    };

    const regexStr = str.split('').map(char => {
        const lowerChar = char.toLowerCase();
        return accentMap[lowerChar] || char;
    }).join('');

    return new RegExp(regexStr, 'i');
}


module.exports = {
    dateAndHour,
    getSpainCurrentDate,
    createAccentInsensitiveRegex
};