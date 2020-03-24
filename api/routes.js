'use strict';

const path = require('path');
const bodyParser = require('body-parser');
const serializeError = require('serialize-error').serializeError;

const fanApi = require('./fan-api');
const coreApi = require('./core-api');

// Allowed extensions list can be extended depending on your own needs
const allowedExt = [
    '.js', '.ico', '.css', '.png', '.jpg',
    '.woff2', '.woff', '.ttf', '.svg',
];

function _handleError(error) {
    this.set('Content-Type', 'application/json; charset=utf-8');
    this.statusCode = error.code || error.statusCode || 500;
    this.send(serializeError(error));
}

module.exports = function (app) {

    function addRoutesMethods(module, controllerName) {
        let contrName = controllerName || '';
        if (contrName) {
            contrName = `${contrName}/`;
        }
        for (let route in module.get)
            app.route(`/api/${contrName}${route}`)
                .get(module.get[route]);

        for (let route in module.post)
            app.route(`/api/${contrName}${route}`)
                .post(module.post[route]);

        for (let route in module.put)
            app.route(`/api/${contrName}${route}`)
                .put(module.put[route]);

        for (let route in module.patch)
            app.route(`/api/${contrName}${route}`)
                .patch(module.patch[route]);

        for (let route in module.delete)
            app.route(`/api/${contrName}${route}`)
                .delete(module.delete[route]);
    }

    const get = {
        'test': async (req, res) => {
            try {
                res.json({ some: 'I am RPi 3 B+' });
            } catch (error) {
                _handleError.bind(res)(error);
            }
        }
    };

    addRoutesMethods({ get });
    addRoutesMethods(fanApi, 'fan');
    addRoutesMethods(coreApi, 'core');

    app.get(`*`, (req, res) => {
        if (allowedExt.filter(ext => req.url.indexOf(ext) > 0).length > 0) {
            res.sendFile(path.resolve(__dirname, `../dist${req.url}`));
        } else {
            res.sendFile(path.resolve(__dirname, `../dist/index.html`));
        }
    });

    app.use(bodyParser.json({ limit: `50mb` }));
    app.use(bodyParser.raw({ limit: `50mb` }));
    app.use(bodyParser.text({ limit: `50mb` }));
    app.use(bodyParser.urlencoded({
        limit: `50mb`,
        extended: true
    }));

};