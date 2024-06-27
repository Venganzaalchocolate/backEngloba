const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter}=require("./userController");
const { login, validToken } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut, getEnums } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv } = require("./ovhController");
const { postUploadFile, getFile } = require("./fileController");



module.exports = {
    postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,
    login, validToken,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut, getEnums,
    uploadFile, listBucketContents, getFile,
    postUploadFile
}