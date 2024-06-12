// minuto 1:03:00 https://www.youtube.com/watch?v=MaIeZeHhUgM&t=2147s
const resError=(res, status,message)=>{
    res.status(status).json({
      error:true,
      message:message
    })
  }

  module.exports = {
    resError
  };