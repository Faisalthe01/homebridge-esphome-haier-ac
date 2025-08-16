'use strict';

let Characteristic;
let sendTimeout = null;
let autoModeTemps = { low: null, high: null };
let uiTemps = { low: null, high: null };
let lastMidpointSent = null;

// Default low/high for AUTO mode
const defaultAutoTemps = { low: 20, high: 24 };

// Initialize with Homebridge API
const init = (api) => {
    Characteristic = api.hap.Characteristic;
};

const calculateMidpoint = (that) => {
    const low = autoModeTemps.low ?? defaultAutoTemps.low;
    const high = autoModeTemps.high ?? defaultAutoTemps.high;
    return Math.round((low + high) / 2);
};

const sendState = function(that) {
    return new Promise((resolve, reject) => {
        that.pending.push({ resolve, reject });
        clearTimeout(sendTimeout);
        sendTimeout = setTimeout(() => {
            const currentPending = [...that.pending];
            that.pending = [];
            if (that.connected) {
                that.log.easyDebug(`${that.name} - Sending command: ${JSON.stringify(that.state)}`);
                that.esphome.connection.climateCommandService(that.state);
                currentPending.forEach(p => p.resolve());
            } else {
                that.log.error(`ERROR setting status of ${that.name}, device is disconnected`);
                currentPending.forEach(p => p.reject(new that.api.hap.HapStatusError(-70402)));
            }
        }, that.setDelay || 100);
    });
};

const StateManager = {
    init,
    set: {
        Active: function(active) {
            const that = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    if ((!active && that.state.mode) || (!that.state.mode && active)) {
                        that.state.mode = active ? that.accessory.context.lastTargetState : 0;
                        that.log(`${that.name} - Setting AC Active to ${active}`);
                        sendState(that).then(resolve).catch(reject);
                    } else {
                        resolve();
                    }
                }, 100);
            });
        },

        TargetHeaterCoolerState: function(state) {
            const that = this;
            return new Promise((resolve, reject) => {
                autoModeTemps = { low: null, high: null };
                uiTemps = { low: null, high: null };
                lastMidpointSent = null;
                
                let logMode = null;
                switch (state) {
case 0: // AUTO
    that.state.mode = 1;
    that.accessory.context.lastTargetState = 1;

    // Apply default low/high if not set
    autoModeTemps.low = defaultAutoTemps.low;
    autoModeTemps.high = defaultAutoTemps.high;
    uiTemps.low = defaultAutoTemps.low;
    uiTemps.high = defaultAutoTemps.high;

    // Calculate midpoint and send to ESPHome
    const midpoint = Math.round((autoModeTemps.low + autoModeTemps.high) / 2);
    that.state.targetTemperature = midpoint;

    // Update HomeKit characteristics immediately
    if (that.HeaterCoolerService && Characteristic) {
        that.HeaterCoolerService
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .updateValue(uiTemps.low);
        that.HeaterCoolerService
            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .updateValue(uiTemps.high);
    }

    // Send midpoint to ESPHome
    sendState(that);

    logMode = 'AUTO';
    break;
                    case 1: // HEAT
                        that.state.mode = 3;
                        that.accessory.context.lastTargetState = 3;
                        logMode = 'HEAT';
                        break;
                    case 2: // COOL
                        that.state.mode = 2;
                        that.accessory.context.lastTargetState = 2;
                        logMode = 'COOL';
                        break;
                }
                that.log(`${that.name} - Setting AC Mode to ${logMode}`);
                sendState(that).then(resolve).catch(reject);
            });
        },

        CoolingThresholdTemperature: function(temp) {
            const that = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    uiTemps.high = temp;
                    
                    if (that.state.mode === 1) {
                        autoModeTemps.high = temp;
                        const midpoint = calculateMidpoint(that);
                        
                        if (midpoint !== lastMidpointSent) {
                            that.log(`${that.name} - [AUTO] Low:${uiTemps.low||'N/A'}°C High:${uiTemps.high}°C | Midpoint: ${midpoint}°C`);
                            that.state.targetTemperature = midpoint;
                            lastMidpointSent = midpoint;
                            
                            if (that.HeaterCoolerService && Characteristic) {
                                that.HeaterCoolerService
                                    .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                    .updateValue(uiTemps.low || midpoint);
                                that.HeaterCoolerService
                                    .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                    .updateValue(uiTemps.high || midpoint);
                            }
                            
                            return sendState(that).then(resolve).catch(reject);
                        }
                        resolve();
                    } else {
                        lastMidpointSent = null;
                        if (that.state.targetTemperature !== temp) {
                            that.state.targetTemperature = temp;
                            if (that.state.mode === 2 && that.HeaterCoolerService) {
                                that.HeaterCoolerService
                                    .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                    .updateValue(temp);
                            }
                            sendState(that).then(resolve).catch(reject);
                        } else {
                            resolve();
                        }
                    }
                }, 50);
            });
        },

        HeatingThresholdTemperature: function(temp) {
            const that = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    uiTemps.low = temp;
                    
                    if (that.state.mode === 1) {
                        autoModeTemps.low = temp;
                        const midpoint = calculateMidpoint(that);
                        
                        if (midpoint !== lastMidpointSent) {
                            that.log(`${that.name} - [AUTO] Low:${uiTemps.low}°C High:${uiTemps.high||'N/A'}°C | Midpoint: ${midpoint}°C`);
                            that.state.targetTemperature = midpoint;
                            lastMidpointSent = midpoint;
                            
                            if (that.HeaterCoolerService && Characteristic) {
                                that.HeaterCoolerService
                                    .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                    .updateValue(uiTemps.low || midpoint);
                                that.HeaterCoolerService
                                    .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                    .updateValue(uiTemps.high || midpoint);
                            }
                            
                            return sendState(that).then(resolve).catch(reject);
                        }
                        resolve();
                    } else {
                        lastMidpointSent = null;
                        if (that.state.targetTemperature !== temp) {
                            that.state.targetTemperature = temp;
                            if (that.state.mode === 3 && that.HeaterCoolerService) {
                                that.HeaterCoolerService
                                    .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                    .updateValue(temp);
                            }
                            sendState(that).then(resolve).catch(reject);
                        } else {
                            resolve();
                        }
                    }
                }, 50);
            });
        },

        SwingMode: function(swing) {
            const that = this;
            return new Promise((resolve, reject) => {
                that.state.swingMode = swing ? that.swingModeValue : 0;
                that.log(`${that.name} - Setting AC Swing to ${swing ? 'ON' : 'OFF'}`);
                sendState(that).then(resolve).catch(reject);
            });
        },

        RotationSpeed: function(speed) {
            const that = this;
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    try {
                        if (speed < 0 || speed > 100) return resolve();

                        let mode;
                        if (speed <= 25) mode = 2;
                        else if (speed <= 50) mode = 3;
                        else if (speed <= 75) mode = 4;
                        else mode = 5;

                        const isSupported = (that.config.supportedFanModesList && that.config.supportedFanModesList.includes(mode)) || 
                                          (that.config.supportedCustomFanModesList && that.config.supportedCustomFanModesList.includes(mode));

                        if (!isSupported) {
                            that.log(`${that.name} - Fan mode ${mode} not supported`);
                            return resolve();
                        }

                        delete that.state.fanMode;
                        delete that.state.customFanMode;
                        
                        if (that.config.supportedFanModesList && that.config.supportedFanModesList.includes(mode)) {
                            that.state.fanMode = mode;
                        } else {
                            that.state.customFanMode = mode;
                        }

                        that.log(`${that.name} - Setting Fan to ${['AUTO','LOW','MID','HIGH'][mode-2]} (${speed}%)`);
                        sendState(that).then(resolve).catch(reject);

                    } catch (err) {
                        that.log.error(`Fan speed error: ${err}`);
                        reject(err);
                    }
                }, 50);
            });
        },

        updateUI: function(that) {
            try {
                if (that.HeaterCoolerService && Characteristic) {
                    if (that.state.mode === 1) { // AUTO
                        const midpoint = calculateMidpoint(that);
                        that.HeaterCoolerService
                            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                            .updateValue(uiTemps.low || midpoint);
                        that.HeaterCoolerService
                            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                            .updateValue(uiTemps.high || midpoint);
                    } else if (that.state.mode === 2) { // COOL
                        if (that.state.targetTemperature !== undefined) {
                            that.HeaterCoolerService
                                .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                .updateValue(that.state.targetTemperature);
                        }
                    } else if (that.state.mode === 3) { // HEAT
                        if (that.state.targetTemperature !== undefined) {
                            that.HeaterCoolerService
                                .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                .updateValue(that.state.targetTemperature);
                        }
                    }
                }
            } catch (err) {
                that.log.error(`UI update error: ${err}`);
            }
        }
    }
};

module.exports = StateManager;
