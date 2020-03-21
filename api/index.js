// Service settings: /etc/systemd/system/nodeserver.service
// systemctl daemon-reload
// systemctl restart nodeserver.service
const express = require('express');
const http = require('http');
const routes = require('./routes.js');
// import logger from './logger.mjs';
// import morgan from 'morgan';

const app = express(),
    server = http.createServer(app);

// app.use(morgan(':status :method :url :res[content-length] - :response-time ms', {
//     skip: (req, res) => res.statusCode < 400,
//     stream: logger.errorStream
//     // stream: process.stdout
// }));

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
    // logger.log('info',`Server is started on port ${port}`);
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
    // logger.error(_error);
});
