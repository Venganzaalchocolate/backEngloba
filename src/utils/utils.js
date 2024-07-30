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
    return spainDate;
};

module.exports = {
    dateAndHour,
    getSpainCurrentDate
};