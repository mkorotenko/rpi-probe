const piTemp = require('./drivers/cpu_temperature');
const FanDriver = require('./drivers/fan_driver');

const fanDriver = new FanDriver(14, 4);

module.exports = {
    start() {
        fanDriver.init();
        setInterval(async () => {
            try {
                const rpm = await fanDriver.getRPM();
                const temp = await piTemp.getTemp();
                // console.info('Fan RPM:', rpm, temp);
                const currentSpeed = fanDriver.getSpeed();
                if (temp > 60) {
                    if (currentSpeed > 60) {
                        fanDriver.setSpeedMax();
                        // console.info('Fan SET RPM 100%');
                    }
                } else if (temp <= 55) {
                    if (currentSpeed < 60) {
                        fanDriver.setSpeed50();
                        // console.info('Fan SET RPM MIN');
                    }
                }
                if (temp > 50) {
                    if (currentSpeed >= 180) {
                        fanDriver.setSpeed50();
                        // console.info('Fan SET RPM 50%');
                    }
                } else if (temp <= 45) {
                    if (currentSpeed <= 60) {
                        fanDriver.setSpeedMin();
                        // console.info('Fan SET RPM MIN');
                    }
                }
            } catch (error) {
                console.error('Fan RPM measure error:', error);
            }
        }, 5000);

        fanDriver.on('start', this.onStart.bind(this));
        fanDriver.on('stop', this.onStop.bind(this));
    },

    onStart() {
        // console.info('FAN start');
    },

    async onStop() {
        // console.info('FAN stop');
        const currentSpeed = fanDriver.getSpeed();
        await this.restart();
        fanDriver.setSpeed(currentSpeed);
    },

    async restart() {
        await fanDriver.start();
    }
}
