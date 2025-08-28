const moment = require('moment');
const { getISdk, handleError, getSdk } = require('../api-util/sdk');
const integrationSdk = getISdk();
const sharetribeSdk = require('sharetribe-flex-sdk');
const { types } = sharetribeSdk;
const { UUID } = types;

const checkCalenderAvailability = async (req, res) => { 
  const sdk = getSdk(req, res);
  const responses = [];

  try {
    const { bookmarks } = req.body;

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return res.status(400).send({ error: 'No bookmarks provided.' });
    }

    for (let index = 0; index < bookmarks.length; index++) {
      const { id, startDate, endDate } = bookmarks[index];

      if (!id || !startDate || !endDate) {
        responses.push({ id, error: 'Missing listingId or dates' });
        continue;
      }

      const startMoment = moment(startDate);
      const endMoment = moment(endDate);
      const now = moment();

      // Skip if start is beyond the 92-day allowed window
      const daysFromNow = startMoment.diff(now, 'days');
      // if (daysFromNow > MAX_LOOKAHEAD_DAYS) {
      //   responses.push({ id, warning: 'Date range is beyond 92-day limit.' });
      //   continue;
      // }

      try {
        const response = await sdk.timeslots.query({
          listingId: id,
          start: startMoment.startOf('day').toDate(),
          end: endMoment.endOf('day').add(2, 'days').toDate(), // small buffer
        });

        const timeslots = response?.data?.data || [];

        // Filter for timeslots > 24 hours
        const longSlots = timeslots.filter(slot => {
          const slotStart = moment(slot.attributes.start);
          const slotEnd = moment(slot.attributes.end);
          const durationMinutes = slotEnd.diff(slotStart, 'minutes');
          return durationMinutes > 1440;
        });

        responses.push({
          id,
          data: longSlots,
        });
      } catch (apiError) {
        console.error(`Failed to fetch timeslots for listing ${id}:`, apiError.message);
        responses.push({
          id,
          error: 'Failed to fetch timeslots.',
        });
      }
    }

    return res.status(200).send({ data: responses });

  } catch (e) {
    console.error('Error in checkCalenderAvailability:', e);
    return res.status(500).send({
      error: 'An error occurred while checking calendar availability.',
    });
  }
};

module.exports = { checkCalenderAvailability };
