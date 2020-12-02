const { exec } = require('child_process');
const osUtils = require('os-utils');
const os = require('os');

// console.log(os.cpus());
// console.log(os.totalmem());
// console.log(os.freemem())

async function getTemp() {
    return new Promise((resolve, reject) => {
        try {
            exec('cat /sys/class/thermal/thermal_zone0/temp', function (error, stdout) {
                if (error) {
                    reject(error);
                    return;
                }
                const lines = stdout.toString().split('\n');
                if (lines.length && lines[0]) {
                    try {
                        const result = Math.round(parseFloat(lines[0])/100)/10;
                        resolve(result);
                    } catch(error) {
                        reject(error);
                    }
                }
                resolve(undefined);
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function getFrequency() {
    return new Promise((resolve, reject) => {
        try {
            exec('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq', function (error, stdout) {
                if (error) {
                    reject(error);
                    return;
                }
                const lines = stdout.toString().split('\n');
                if (lines.length && lines[0]) {
                    try {
                        const result = Math.round(parseFloat(lines[0])/1000);
                        resolve(result);
                    } catch(error) {
                        reject(error);
                    }
                }
                resolve(undefined);
            });
        } catch (error) {
            reject(error);
        }
    });
}

function getCpuCurrentSpeedSync() {

    let cpus = os.cpus();
    let minFreq = 999999999;
    let maxFreq = 0;
    let avgFreq = 0;
    let cores = [];

    if (cpus.length) {
        for (let i in cpus) {
            if ({}.hasOwnProperty.call(cpus, i)) {
                avgFreq = avgFreq + cpus[i].speed;
                if (cpus[i].speed > maxFreq) maxFreq = cpus[i].speed;
                if (cpus[i].speed < minFreq) minFreq = cpus[i].speed;
            }
            cores.push(parseFloat(((cpus[i].speed + 1) / 1000).toFixed(2)));
        }
        avgFreq = avgFreq / cpus.length;
        return {
            min: parseFloat(((minFreq + 1) / 1000).toFixed(2)),
            max: parseFloat(((maxFreq + 1) / 1000).toFixed(2)),
            avg: parseFloat(((avgFreq + 1) / 1000).toFixed(2)),
            cores: cores
        };
    } else {
        return {
            min: 0,
            max: 0,
            avg: 0,
            cores: cores
        };
    }
}

async function getCoreFrequency() {
    return new Promise((resolve) => {
        process.nextTick(() => {
            let result = getCpuCurrentSpeedSync();
            if (result.avg === 0 && _cpu_speed !== '0.00') {
                const currCpuSpeed = parseFloat(_cpu_speed);
                result = {
                    min: currCpuSpeed,
                    max: currCpuSpeed,
                    avg: currCpuSpeed,
                    cores: []
                };
            }
            resolve(result);
        });
    });
}

async function getUsage() {
    return new Promise((resolve) => osUtils.cpuUsage(usage => {
        resolve(Math.round(usage*100)/100);
    }));
}

module.exports = {
    getTemp,
    getUsage,
    getFrequency,
    getCoreFrequency
}
