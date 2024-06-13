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


module.exports = {
    dateAndHour
};