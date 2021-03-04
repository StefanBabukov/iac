/* eslint-disable no-console */
const WorkResponseService = require('../route-services/work-response');
const logger = require('../../utils/logging');
const parseSNSMessage = require('../../utils/parse-sns-message');

module.exports = {
  'work#response': async (req, res) => {
    let result;

    try {
      result = await parseSNSMessage(req);
    } catch (e) {
      logger.error('Parsing initial SNS message failed:', e);

      res.status(400).send('nok');
      return;
    }

    const { io, parsedMessage } = result;

    let responseService = null;

    try {
      responseService = await new WorkResponseService(io, parsedMessage);
    } catch (e) {
      logger.error(
        'Error initializing work response service: ', e,
      );

      res.status(500).send('nok');
      return;
    }

    try {
      await responseService.handleResponse();
    } catch (e) {
      logger.error(
        'Error processing the work response message: ', e,
      );

      const { workResponse } = responseService;
      const { socketId, uuid } = workResponse.request;

      io.to(socketId).emit(`WorkResponse-${uuid}`, {
        ...workResponse,
        response: {
          cacheable: false,
          error: e.message,
        },
      });

      res.status(500).send('nok');
      return;
    }

    // SNS is really dumb, so we can just send back a generic response.
    // It doesn't really care what we do afterwards.
    res.status(200).send('ok');
  },
};
