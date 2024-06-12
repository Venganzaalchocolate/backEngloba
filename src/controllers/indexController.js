const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter}=require("./userController");
const { login, validToken } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");


module.exports = {
    postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,
    login, validToken,
    tokenValid, tokenValidAdmin,
}