const Buffer = require('buffer').Buffer;

function decodeDate(zipDate) {
    let s, m, h, dd, mm, yy;
    s = zipDate & 63;
    zipDate = zipDate >> 6;
    m = zipDate & 63;
    zipDate = zipDate >> 6;
    h = zipDate & 31;
    zipDate = zipDate >> 5;
    dd = zipDate & 31;
    zipDate = zipDate >> 5;
    mm = zipDate & 15;
    zipDate = zipDate >> 4;
    yy = zipDate & 63;
    return new Date(Date.UTC(2000 + yy, mm - 1, dd, h, m, s));
}

function encodeDate(date) {
    let zipDate;
    zipDate = date.getUTCFullYear() - 2000;
    zipDate = zipDate << 4;
    zipDate += date.getUTCMonth() + 1;
    zipDate = zipDate << 5;
    zipDate += date.getUTCDate();
    zipDate = zipDate << 5;
    zipDate += date.getUTCHours();
    zipDate = zipDate << 6;
    zipDate += date.getUTCMinutes();
    zipDate = zipDate << 6;
    zipDate += date.getUTCSeconds();
    return zipDate;
}

function dataSize(indexContainer, size) {
    const shift = indexContainer.index;
    indexContainer.index += size;
    return shift;
}

function UINT_8(buffer, indexContainer) {
    return buffer.readUInt8(dataSize(indexContainer, 1));
}
function INT_8(buffer, indexContainer) {
    return buffer.readInt8(dataSize(indexContainer, 1));
}
function UINT_16(buffer, indexContainer) {
    return buffer.readUInt16LE(dataSize(indexContainer, 2));
}
function INT_16(buffer, indexContainer) {
    return buffer.readInt16LE(dataSize(indexContainer, 2));
}
function UINT_32(buffer, indexContainer) {
    return buffer.readUInt32LE(dataSize(indexContainer, 4));
}
function DATE_TIME(buffer, indexContainer) {
    const zipDate = UINT_32(buffer, indexContainer);
    return decodeDate(zipDate);
}
function current_date_time() {
    return new Date();
}
function dataProcess(type, mul, div) {
    return function (buffer, indexContainer) {
        let result = type(buffer, indexContainer) || 0;
        if (mul != null) {
            result = result * mul;
        }
        if (div) {
            result = result / div;
        }
        return result;
    }
}
function probeState(buffer, indexContainer) {
    let stateDate = UINT_32(buffer, indexContainer);
    const res = {};
    ErrorFlags.forEach(flag => {
        if (stateDate & 1) {
            res[flag] = true;
        }
        stateDate = stateDate >> 1;
    });
    res.count = stateDate;
    return res;
}

const HEADStruct = {
    // pipe: UINT_8,
    // rssi: INT_8,
    pack_type: UINT_8,
    num: UINT_8,
    serverDate: current_date_time
}
const DHTStruct = {
    temp: dataProcess(INT_16, undefined, 10),
    hum: dataProcess(UINT_16, undefined, 10),
    date: DATE_TIME,
    bat_v: dataProcess(UINT_8, undefined, 10),
    core_t: UINT_8
}
const UIDStruct = {
    UID: UINT_32,
}
const StateStruct = {
    state: probeState,
}
const CustomStruct = {
    packSize: UINT_8,
    dataTypes: UINT_16,
    bat_v: dataProcess(UINT_16, undefined, 10),
    core_t: UINT_16
}

const TYPES_MAP = {
    1: UIDStruct,
    2: DHTStruct,
    3: UIDStruct,
    4: CustomStruct,
    10: StateStruct
}

function getBody(buffer, result, dataType, indexContainer) {
    if (dataType) {
        Object.keys(dataType).forEach(key => {
            result[key] = dataType[key](buffer, indexContainer);
        });
    }
}

function getData(buffer, indexContainer) {
    const data = {};
    const startIndex = indexContainer.index;
    getBody(buffer, data, HEADStruct, indexContainer);
    getBody(buffer, data, TYPES_MAP[data.pack_type], indexContainer);
    if (data.packSize) {
        indexContainer.index = startIndex + data.packSize + 3;
    }
    return data;
}

function pipePad(pipe, size) {
    var sign = Math.sign(pipe) === -1 ? '-' : '';
    return sign + new Array(size).concat([Math.abs(pipe)]).join('0').slice(-size);
}

function getPackTitle(packData) {
    let result = `${packData.serverDate.toJSON()} | NUM: ${packData.num} | Pipe: ${pipePad(packData.pipe, 3)} | RSSI: ${packData.rssi} | TYPE: ${packData.pack_type}`;
    switch (packData.pack_type) {
        case 1:
            result = `${result} | UID: ${packData.UID}`;
            break;
        case 2:
            result = `${result} | BAT: ${packData.bat_v.toFixed(1)} | CORE: ${pipePad(packData.core_t, 2)} | TEMP: ${packData.temp.toFixed(1)} | HUM: ${packData.hum.toFixed(1)}`;
            break;
        case 3:
            result = `${result} | UID: ${packData.UID}`;
            break;
        case 4:
            result = `${result} | SIZE: ${packData.packSize} | TYPES: ${packData.dataTypes} | BAT: ${packData.bat_v.toFixed(1)} | CORE: ${pipePad(packData.core_t, 2)}`;
            break;
    }
    return `${result} %s`;
}

const pipeNumbers = {
    2228287: 2,
    2228289: 3,
    2883623: 4,
    4587579: 5,
    4587581: 6,
}

function setAddressPack(address) {
    return [6, 0, 0, 0, address];
}

function reqUIDPack() {
    return [2];
}

module.exports = {
    processDHTpack: (pipe, rssi, dataArray) => {
        let comData = [];
        const buffer = Buffer.from(dataArray);

        const bufferStep = { index: 0 };
        while (bufferStep.index < buffer.length) {
            const packData = getData(buffer, bufferStep);
            packData.pipe = pipe;
            packData.rssi = rssi;
            console.log(getPackTitle(packData), '');
            comData.push(packData);
        }
        return comData;
    },
    getPipeAckData: (pipe, packData) => {
        if (packData.pack_type == 1) {
            if (pipeNumbers[packData.UID]) {
                return setAddressPack(pipeNumbers[packData.UID]);
            }
        } else if (pipe == 255) {
            return reqUIDPack();
        }
        return [0];
    }
}
