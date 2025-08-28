const moment = require('moment');
const { getISdk, handleError } = require('../api-util/sdk');
const integrationSdk = getISdk();
const sharetribeSdk = require('sharetribe-flex-sdk');
const { types } = sharetribeSdk;
const { UUID } = types;

const deleteCalenderExceptions = async (req, res) => {
  try {
    const { exceptionIds } = req.body;  

    if (!Array.isArray(exceptionIds) || exceptionIds.length === 0) {
      return res.status(400).send({ error: 'exceptionIds must be a non-empty array' });
    }

    // Run all deletions in parallel
    const responses = await Promise.all(
      exceptionIds.map(id =>
        integrationSdk.availabilityExceptions.delete({ id: new UUID(id) })
      )
    );

    return res.status(200).send({
      success: true,
      deleted: responses.map(r => r.data.data),
    });
  } catch (e) {
    console.error('Error deleting calendar exceptions:', e);
    return handleError(e, res);
  }
};

module.exports = { deleteCalenderExceptions };
