const piTemp = require('./drivers/cpu_temperature');
const FanDriver = require('./drivers/fan_driver');
const ipc = require('node-ipc');

const TRACK_INTERVAL = 5000;

ipc.config.id = 'fanDriver';
ipc.config.retry = 1500;

const fanDriver = new FanDriver(14, 4);

let manualMode = false;

ipc.serve(() => {
        ipc.server.on(
            'getSpeed',
            (data, socket) => {
                ipc.server.emit(
                    socket,
                    'getSpeed',
                    fanDriver.getSpeed()
                );
            }
        );
        ipc.server.on(
            'setSpeed',
            async (speed, socket) => {
                await fanDriver.setSpeed(speed);
                ipc.server.emit(
                    socket,
                    'setSpeed',
                    fanDriver.getSpeed()
                );
            }
        );
        ipc.server.on(
            'setManualMode',
            async (manual, socket) => {
                manualMode = manual;
                ipc.server.emit(
                    socket,
                    'setManualMode'
                );
            }
        );
        ipc.server.on(
            'getManualMode',
            async (manual, socket) => {
                ipc.server.emit(
                    socket,
                    'getManualMode',
                    manualMode
                );
            }
        );
    }
);
ipc.server.start();

const SPEED_GRID = [
    {
        temp: 60,
        speed: 0
    },
    {
        temp: 55,
        speed: 60
    },
    {
        temp: 50,
        speed: 120
    },
    {
        temp: 45,
        speed: 180
    },
    {
        temp: 20,
        speed: 200
    },
];

function getRequiredSpeed(temp) {
    const reqSpeed = SPEED_GRID.find(cs => cs.temp < temp);
    return reqSpeed.speed;
}

module.exports = {
    start() {
        fanDriver.init();
        setInterval(async () => {
            try {
                await fanDriver.getRPM();

                if (manualMode) {
                    return;
                }

                const temp = await piTemp.getTemp();
                const currentSpeed = fanDriver.getSpeed();
                const reqSpeed = getRequiredSpeed(temp);

                if (currentSpeed !== reqSpeed) {
                    fanDriver.setSpeed(reqSpeed);
                }
            } catch (error) {
                console.error('Fan RPM measure error:', error);
            }
        }, TRACK_INTERVAL);

        fanDriver.on('start', this.onStart.bind(this));
        fanDriver.on('stop', this.onStop.bind(this));
    },

    onStart() {
        // console.info('FAN start');
    },

    async onStop() {
        const currentSpeed = fanDriver.getSpeed();
        await this.restart();
        fanDriver.setSpeed(currentSpeed);
    },

    async restart() {
        await fanDriver.start();
    }
}
