'use strict';
const Gpio = require('pigpio').Gpio;
const ipc = require('node-ipc');

ipc.config.id = 'gpio_service';
ipc.config.retry = 1500;

ipc.serve(() => {
    ipc.server.on(
        'Gpio',
        (data, socket) => {
console.log('GPIO request');
            ipc.server.emit(
                socket,
                'Gpio',
                Gpio
            );
        }
    );
    ipc.server.on(
        'destroy', 
        () => {
            console.log('GPIO server destroyed');
        }
    )
});
ipc.server.start();
console.log('GPIO server started');
