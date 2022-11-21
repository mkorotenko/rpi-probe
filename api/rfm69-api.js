const serializeError = require('serialize-error').serializeError;
const ipc = require('node-ipc');

function _handleError(error) {
    this.set('Content-Type', 'application/json; charset=utf-8');
    this.statusCode = error.code || error.statusCode || 500;
    this.send(serializeError(error));
}

let socketAPI;

ipc.config.id = 'rfm69_controller';
ipc.config.retry = 1500;

ipc.connectTo(
    'rfm69Driver',
    () => {
        // ipc.of.rfm69Driver.on(
        //     'connect',
        //     () => console.info('Connected to IPC server')
        // );
        // ipc.of.rfm69Driver.on(
        //     'disconnect',
        //     () => console.info('Disconnected from IPC server')
        // );
        ipc.of.rfm69Driver.on(
            'rfm69.data',
            (data) => {
                if (!socketAPI) {
                    return;
                }
                socketAPI.emit('rfm69.data', data);
            }
        );
        // ipc.of.rfm69Driver.on(
        //     'rfm69.start',
        //     () => {
        //         if (!socketAPI) {
        //             return;
        //         }
        //         socketAPI.emit('rfm69.start');
        //     }
        // );
        // ipc.of.rfm69Driver.on(
        //     'rfm69.stop',
        //     (speed) => {
        //         if (!socketAPI) {
        //             return;
        //         }
        //         socketAPI.emit('rfm69.stop', speed);
        //     }
        // );
        ipc.of.rfm69Driver.on(
            'rfm69.error',
            (error) => {
                if (!socketAPI) {
                    return;
                }
                socketAPI.emit('rfm69.error', error);
            }
        );
    }
);

async function sendToIPC(message, data) {
    return new Promise((resolve, reject) => {
        const errorHandler = (error) => {
            ipc.of.rfm69Driver.off(message, messageHandler);
            reject(error);
        };
        const messageHandler = (message) => {
            ipc.of.rfm69Driver.off('error', errorHandler);
            resolve(message);
        };
        ipc.of.rfm69Driver.once('error', errorHandler);
        ipc.of.rfm69Driver.once(message, messageHandler);
        ipc.of.rfm69Driver.emit(message, data);
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
        post: {
            start: async (req, res) => {
                try {
                    await sendToIPC('start');
                    res.json({ message: 'done' });
                } catch (error) {
                    _handleError.bind(res)(error);
                }
            }
        }
    }
}
