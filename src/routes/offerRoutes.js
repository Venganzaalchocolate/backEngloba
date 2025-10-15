const express = require('express');
const router = express.Router()
const {offerList,offerCreate,offerUpdate,offerHardDelete,offerId, tokenValid} = require('../controllers/indexController')



router.post("/offerlist",offerList)
router.post("/offercreate", tokenValid,offerCreate)
router.post("/offerupdate",tokenValid,offerUpdate)
router.post("/offerharddelete", tokenValid,offerHardDelete)
router.post("/offerid", offerId)


module.exports = router;