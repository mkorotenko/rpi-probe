// Service settings: /etc/systemd/system/nodeserver.service
// systemctl daemon-reload
// systemctl restart nodeserver.service
// debug: HTTP_PORT=3001 node --inspect=192.168.1.101 probe/api/index.js
const express = require('express');
const http = require('http');
const routes = require('./routes.js');

const app = express(),
    server = http.createServer(app);

const port = (process.env && process.env.HTTP_PORT) || 3000;
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

routes(app);

server.listen(port, () => {
    console.log(`Server is started on port ${port}`);
});

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
