// Service settings: /etc/systemd/system/web-server.service
// sudo systemctl daemon-reload
// sudo systemctl restart web-server.service
// debug: HTTP_PORT=3001 node --inspect=192.168.1.20 dev/Probe/api/index.js
const express = require('express');
const http = require('http');
const routes = require('./routes.js');
const socketIo = require('socket.io')

const app = express(),
    server = http.createServer(app),
    socket = socketIo(server);

const port = (process.env && process.env.HTTP_PORT) || 80;
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

if (!('toJSON' in Error.prototype)) {
    Object.defineProperty(Error.prototype, 'toJSON', {
        value: function () {
            var alt = {};

            Object.getOwnPropertyNames(this).forEach(function (key) {
                alt[key] = this[key];
            }, this);

            return alt;
        },
        configurable: true,
        writable: true
    });
}

// Catch errors
app.on('error', (error) => {
    console.error(new Date(), 'ERROR', error);
    let _error;
    try {
        _error = JSON.stringify(code);
    } catch (e) {
        _error = '<stringify error>'
    }
});

routes(app, socket);

socket.on('connection', function (client) {
    console.log('Socket: client connected');
});

server.listen(port, () => {
    console.log(`Server is started on port ${port}`);
});
