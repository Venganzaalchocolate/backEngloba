const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter}=require("./userController");
const { login, validToken } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut, getEnums } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv } = require("./ovhController");
const { postUploadFile, getFile } = require("./fileController");
const { postCreateBag, getBags, getBagID, BagDeleteId, BagPut, getBagsFilter, BagPutDeleteUser } = require("./bagController");
const { crearProgrmasPrueba, getPrograms } = require("./programController");



module.exports = {
    postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,
    login, validToken,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut, getEnums,
    uploadFile, listBucketContents, getFile,
    postUploadFile,
    postCreateBag, getBags, getBagID,BagDeleteId, BagPut,getBagsFilter, BagPutDeleteUser,
    crearProgrmasPrueba, getPrograms
}