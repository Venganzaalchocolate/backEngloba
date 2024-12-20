const {postCreateUser, getUserID, getUsers, UserDeleteId, userPut, getUsersFilter, payroll, hirings}=require("./userController");
const { login, validToken } = require("./loginController");
const {tokenValid, tokenValidAdmin} = require("./authController");
const { getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut } = require("./userCvController");
const { uploadFile, listBucketContents, getFileCv, deleteFile } = require("./ovhController");
const { postUploadFile, getFile, deleteIdFile } = require("./fileController");
const { postCreateBag, getBags, getBagID, bagDeactivateId, BagPut, getBagsFilter, BagPutDeleteUser } = require("./bagController");
const { getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive, getDispositiveResponsable } = require("./programController");
const { postCreateOfferJob, getOfferJobID, getOfferJobs, OfferJobDeleteId, OfferJobPut } = require("./offerController");
const { getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers } = require("./enumsController");





module.exports = {
    postCreateUser, getUserID, getUsers, UserDeleteId, userPut,getUsersFilter,
    login, validToken,
    tokenValid, tokenValidAdmin,
    getUserCvsFilter, postCreateUserCv, getUserCvID, getUserCvs, UserCvDeleteId, UserCvPut, payroll, hirings,
    uploadFile, listBucketContents, getFile, deleteFile,
    postUploadFile, deleteIdFile,
    postCreateBag, getBags, getBagID,bagDeactivateId, BagPut,getBagsFilter, BagPutDeleteUser,
    getPrograms, postCreateProgram, getProgramID, ProgramPut, ProgramDeleteId, addDispositive, getDispositive, updateDispositive, deleteDispositive,getDispositiveResponsable,
    postCreateOfferJob, getOfferJobID, getOfferJobs,OfferJobDeleteId, OfferJobPut,
    getEnums, putEnums, postEnums, deleteEnums, deleteSubcategory, getEnumEmployers,

}