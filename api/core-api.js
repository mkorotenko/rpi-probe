const serializeError = require('serialize-error').serializeError;
const core = require('../drivers/core_driver');

function _handleError(error) {
    this.set('Content-Type', 'application/json; charset=utf-8');
    this.statusCode = error.code || error.statusCode || 500;
    this.send(serializeError(error));
}

module.exports = {
    get: {
        temperature: async (req, res) => {
            try {
                const temp = await core.getTemp();
                res.json({ temp });
            } catch (error) {
                _handleError.bind(res)(error);
            }
        },
        frequency: async (req, res) => {
            try {
                const frequency = await core.getFrequency();
                res.json({ frequency });
            } catch (error) {
                _handleError.bind(res)(error);
            }
        },
        coreFrequency: async (req, res) => {
            try {
                const coreFrequency = await core.getCoreFrequency();
                res.json({ coreFrequency });
            } catch (error) {
                _handleError.bind(res)(error);
            }
        },
        usage: async (req, res) => {
            try {
                const usage = await core.getUsage();
                res.json({ usage });
            } catch (error) {
                _handleError.bind(res)(error);
            }
        }
    }
}
