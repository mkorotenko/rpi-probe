'use strict';
const Gpio = require('pigpio').Gpio;
const EventEmitter = require('events').EventEmitter;

const FREQUENCY = 5;
const MIN_DUTY = 180;
const MIN_START_DUTY = 120;
const MEASURE_DUTY = 400;
const FAN_STAB_DUTY = 300;

class FanDriver extends EventEmitter {

    constructor(controlPin, probePin) {
        super();
        this.controlPin = controlPin;
        this.probePin = probePin;
        this.control = new Gpio(this.controlPin, {
            mode: Gpio.OUTPUT,
            pullUpDown: Gpio.PUD_DOWN,
        });
        this.probe = new Gpio(this.probePin, {
            mode: Gpio.INPUT,
            pullUpDown: Gpio.PUD_OFF,
            edge: Gpio.FALLING_EDGE
        });
        this.calcPulses = this.calcPulses.bind(this);
        this.currentSpeed = 255;
        this.stoped = true;
    }

    async init() {
        return await this.start();
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.control.pwmFrequency(FREQUENCY);
            this.control.pwmWrite(MIN_START_DUTY);
            setTimeout(() => {
                this.setSpeedMin();
                resolve();
            }, FAN_STAB_DUTY);    
        });
    }

    async stop() {
        return new Promise((resolve, reject) => {
            this.control.pwmWrite(255);
            setTimeout(resolve, FAN_STAB_DUTY);    
        });
    }

    async getRPM() {
        if (!this.measure) {
            this.measureTask = new Promise((resolve, reject) => {
                this.pulses = 0;
                this.measure = true;
                if (!MEASURE_DUTY) {
                    reject('No measure duty');
                }
                this.probe.on('interrupt', this.calcPulses);
                setTimeout(() => {
                    this.measure = false;
                    this.measureTask = undefined;
                    this.probe.off('interrupt', this.calcPulses);
                    const rpm = this.pulses;//Math.round((this.pulses * 1000)/MEASURE_DUTY);
                    resolve(rpm);
                    if (rpm <= 4) {
                        this.stopDetected();
                    } else {
                        this.runDetected();
                    }
                }, MEASURE_DUTY);
            })
        }
        return this.measureTask;
    }

    getSpeed() {
        return this.currentSpeed;
    }

    runDetected() {
        if (this.stoped) {
            this.stoped = false;
            this.emit('start');
        }
    }

    stopDetected() {
        if (!this.stoped) {
            this.stoped = true;
            this.emit('stop');
        }
    }

    async setSpeed(speed) {
        return new Promise((resolve, reject) => {
            if (speed > 255) {
                reject();
            }
            this.currentSpeed = speed;
            this.control.pwmWrite(speed);
            setTimeout(resolve, FAN_STAB_DUTY);  
        })
    }

    async setSpeedMin() {
        return new Promise((resolve, reject) => {
            this.currentSpeed = MIN_DUTY;
            this.control.pwmWrite(MIN_DUTY);
            setTimeout(resolve, FAN_STAB_DUTY);  
        })
    }

    async setSpeed50() {
        return new Promise((resolve, reject) => {
            this.currentSpeed = MIN_START_DUTY/2;
            this.control.pwmWrite(this.currentSpeed);
            setTimeout(resolve, FAN_STAB_DUTY);  
        })
    }

    async setSpeedMax() {
        return new Promise((resolve, reject) => {
            this.currentSpeed = 0;
            this.control.pwmWrite(0);
            setTimeout(resolve, FAN_STAB_DUTY);  
        })
    }

    calcPulses() {
        if (!this.measure) {
            return;
        }
        this.pulses++;
    }

}

module.exports = FanDriver;
