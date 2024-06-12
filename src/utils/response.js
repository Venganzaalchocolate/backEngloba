// explicación minuto 47 https://www.youtube.com/watch?v=MaIeZeHhUgM&t=2147s

const response=(res, statusCode, data)=>{
    res.status(statusCode).json({
        error:false,
        data,
    })
}

module.exports={
    response
}