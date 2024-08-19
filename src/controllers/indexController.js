const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter}=require("./userController");
const { login, validToken } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv } = require("./ovhController");
const { postUploadFile, getFile } = require("./fileController");
const { postCreateBag, getBags, getBagID, BagDeleteId, BagPut, getBagsFilter, BagPutDeleteUser } = require("./bagController");
const { getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive } = require("./programController");
const { postCreateOfferJob, getOfferJobID, getOfferJobs, OfferJobDeleteId, OfferJobPut } = require("./offerController");
const { getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory } = require("./enumsController");



module.exports = {
    postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,
    login, validToken,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut,
    uploadFile, listBucketContents, getFile,
    postUploadFile,
    postCreateBag, getBags, getBagID,BagDeleteId, BagPut,getBagsFilter, BagPutDeleteUser,
    getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive,
    postCreateOfferJob, getOfferJobID, getOfferJobs,OfferJobDeleteId, OfferJobPut,
    getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory
}