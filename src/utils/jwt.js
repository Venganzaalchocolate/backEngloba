const jwt=require('jsonwebtoken')
require('dotenv').config()

const generarToken=async (user)=>{
    const token= jwt.sign(
        {
            _id:user._id,
            role:user.role
        },
        process.env.JWT,
        {
           expiresIn: "7d"
        }
    )
    return token
}

const verifyToken=async(token)=>{
    try {
        return jwt.verify(token, process.env.JWT)
    } catch (error) {
        return null
    }
}

module.exports={
    generarToken,
    verifyToken
  };