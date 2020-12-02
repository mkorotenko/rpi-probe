const serializeError = require('serialize-error').serializeError;
const ipc = require('node-ipc');

function _handleError(error) {
    this.set('Content-Type', 'application/json; charset=utf-8');
    this.statusCode = error.code || error.statusCode || 500;
    this.send(serializeError(error));
}

let socketAPI;

ipc.config.id = 'fan_controller';
ipc.config.retry = 1500;

ipc.connectTo(
    'fanDriver',
    () => {
        ipc.of.fanDriver.on(
            'connect',
            () => console.info('Connected to IPC server')
        );
        ipc.of.fanDriver.on(
            'disconnect',
            () => console.info('Disconnected from IPC server')
        );
        ipc.of.fanDriver.on(
            'fan.data',
            (data) => {
                // console.info('fan.data', data.temp, data.speed)
                if (!socketAPI) {
                    return;
                }
                socketAPI.emit('fan.data', data);
            }
        );
        ipc.of.fanDriver.on(
            'fan.start',
            () => {
                // console.info('fan.start')
                if (!socketAPI) {
                    return;
                }
                socketAPI.emit('fan.start');
            }
        );
        ipc.of.fanDriver.on(
            'fan.stop',
            (speed) => {
                // console.info('fan.stop', speed)
                if (!socketAPI) {
                    return;
                }
                socketAPI.emit('fan.stop', speed);
            }
        );
        ipc.of.fanDriver.on(
            'fan.error',
            (error) => {
                // console.info('fan.error', error)
                if (!socketAPI) {
                    return;
                }
                socketAPI.emit('fan.error', error);
            }
        );
    }
);

async function sendToIPC(message, data) {
    return new Promise((resolve, reject) => {
        const errorHandler = (error) => {
            ipc.of.fanDriver.off(message, messageHandler);
            reject(error);
        };
        const messageHandler = (message) => {
            ipc.of.fanDriver.off('error', errorHandler);
            resolve(message);
        };
        ipc.of.fanDriver.once('error', errorHandler);
        ipc.of.fanDriver.once(message, messageHandler);
        ipc.of.fanDriver.emit(message, data);
    });
}

async function requestPayload(req) {
    return new Promise((resolve, reject) => {
        let body = [];
        req.on('data', chunk => body.push(chunk.toString()));
        req.on('end', () => resolve(JSON.parse(body.join(''))));
        req.on('error', error => reject(error));
    })
}

module.exports = {
    setSocket(socket) {
        socketAPI = socket;
    },
    routes: {
        get: {
            speed: async (req, res) => {
                try {
                    const speed = await sendToIPC('getSpeed');
                    res.json({ speed });
                } catch (error) {
                    _handleError.bind(res)(error);
                }
            },
            mode: async (req, res) => {
                try {
                    const manual = await sendToIPC('getManualMode');
                    res.json({ manual });
                } catch (error) {
                    _handleError.bind(res)(error);
                }
            }
        },
        post: {
            speed: async (req, res) => {
                try {
                    const payload = await requestPayload(req);
                    await sendToIPC('setSpeed', payload.speed);
                    res.json({ message: 'done' });
                } catch (error) {
                    _handleError.bind(res)(error);
                }
            },
            mode: async (req, res) => {
                try {
                    const payload = await requestPayload(req);
                    await sendToIPC('setManualMode', payload.manual);
                    res.json({ message: 'done' });
                } catch (error) {
                    _handleError.bind(res)(error);
                }
            }
        }
    }
}
