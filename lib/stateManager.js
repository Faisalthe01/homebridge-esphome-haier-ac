'use strict';

let Characteristic;
let sendTimeout = null;
let autoModeTemps = { low: null, high: null };
let uiTemps = { low: null, high: null };
let lastMidpointSent = null;
let isExternalUpdate = false;
let isHomeKitUpdate = false;

// Track last fan log to prevent duplicate logging
let lastLoggedFanMode = null;

// Default low/high for AUTO mode
const defaultAutoTemps = { low: 20, high: 24 };

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

const setTargetTemperature = function(that, temp, resolve, reject) {
    lastMidpointSent = null; // Reset AUTO mode tracking
    that.log(`${that.name} - [${that.state.mode === 2 ? 'COOL' : 'HEAT'}] HomeKit set Target Temperature: ${temp}\u00B0C`);
    if (that.state.targetTemperature !== temp) {
        that.state.targetTemperature = temp;
        sendState(that).then(resolve).catch(reject);
    } else {
        resolve(); // No change needed
    }
};

const StateManager = {
    init,
    set: {
// Inside StateManager.js... in the set: { ... } block

Active: function(active) {
    const that = this;
    return new Promise((resolve, reject) => {
        const isCurrentlyActive = that.state.mode !== 0;

        if (Boolean(active) === isCurrentlyActive) {
            that.log.easyDebug(`${that.name} - Active state already set to ${active}. Ignoring redundant command.`);
            return resolve();
        }

        if (active && !that.accessory.context.lastTargetState) {
            that.log.warn(`${that.name} - Cannot turn ON, no lastTargetState saved. Ignoring command.`);
            return resolve(); // Use resolve() to not show an error in HomeKit
        }
        
        const modeNames = { 1: 'AUTO', 2: 'COOL', 3: 'HEAT' };
        
        that.state.mode = active ? that.accessory.context.lastTargetState : 0;
        const modeName = modeNames[that.state.mode] || `mode ${that.state.mode}`;
        
        const logMessage = active ? 
            `${that.name} - Setting AC Active to ON (restoring ${modeName}) mode` : 
            `${that.name} - Setting AC Active to OFF`;

        that.log(logMessage);
        
        sendState(that).then(resolve).catch(reject);
    });
},


        TargetHeaterCoolerState: function(state) {


            const that = this;
            return new Promise((resolve, reject) => {
                autoModeTemps = { low: null, high: null };
                uiTemps = { low: null, high: null };
                lastMidpointSent = null;
                isExternalUpdate = false;
                isHomeKitUpdate = false;
                
                let logMode = null;
                switch (state) {
                    case 0: // AUTO
                        that.state.mode = 1;
                        that.accessory.context.lastTargetState = 1;

                        autoModeTemps.low = defaultAutoTemps.low;
                        autoModeTemps.high = defaultAutoTemps.high;
                        uiTemps.low = defaultAutoTemps.low;
                        uiTemps.high = defaultAutoTemps.high;

                        const midpoint = Math.round((autoModeTemps.low + autoModeTemps.high) / 2);
                        that.state.targetTemperature = midpoint;

                        const minTemp = that.config.visualMinTemperature ?? 16;
                        const maxTemp = that.config.visualMaxTemperature ?? 30;
                        uiTemps.low = Math.max(uiTemps.low, minTemp);
                        uiTemps.high = Math.min(uiTemps.high, maxTemp);

                        if (that.HeaterCoolerService && Characteristic) {
                            isHomeKitUpdate = true;
                            that.HeaterCoolerService
                                .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                                .updateValue(uiTemps.low);
                            that.HeaterCoolerService
                                .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                                .updateValue(uiTemps.high);
                        }

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
            if (isExternalUpdate) {
                isExternalUpdate = false;
                return resolve();
            }

            isHomeKitUpdate = true;
            uiTemps.high = temp;
            
            if (that.state.mode === 1) { // AUTO mode
                autoModeTemps.high = temp;
                const midpoint = calculateMidpoint(that);

                that.log(`${that.name} - [AUTO] HomeKit Set High:${temp}\u00B0C | Midpoint: ${midpoint}\u00B0C`);
                that.state.targetTemperature = midpoint;
                lastMidpointSent = midpoint;
                
                sendState(that).then(resolve).catch(reject);
            } else { // COOL mode - use the new helper function
                setTargetTemperature(that, temp, resolve, reject);
            }
        }, 50);
    });
},

HeatingThresholdTemperature: function(temp) {
    const that = this;
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (isExternalUpdate) {
                isExternalUpdate = false;
                return resolve();
            }

            isHomeKitUpdate = true;
            uiTemps.low = temp;
            
            if (that.state.mode === 1) { // AUTO mode
                autoModeTemps.low = temp;
                const midpoint = calculateMidpoint(that);

                that.log(`${that.name} - [AUTO] HomeKit Set Low:${temp}\u00B0C | Midpoint: ${midpoint}\u00B0C`);
                that.state.targetTemperature = midpoint;
                lastMidpointSent = midpoint;
                
                sendState(that).then(resolve).catch(reject);
            } else { // HEAT mode - use the new helper function
                setTargetTemperature(that, temp, resolve, reject);
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

                        // Only log once per change
                        if (lastLoggedFanMode !== mode) {
                            that.log(`${that.name} - Setting Fan to ${['AUTO','LOW','MID','HIGH'][mode-2]} (${speed}%)`);
                            lastLoggedFanMode = mode;
                        }

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
        // Reset update flags to ensure next ESPHome update is applied
        isExternalUpdate = false;
        isHomeKitUpdate = false;

        if (that.HeaterCoolerService && Characteristic) {
            // Only proceed if this is a temperature-related update
            if (that.state.targetTemperature !== undefined && 
                that.state.targetTemperature !== lastMidpointSent) {
                
                if (that.state.mode === 1) { // AUTO mode
                    const midpoint = that.state.targetTemperature;
                    const minTemp = that.config.visualMinTemperature ?? 16;
                    const maxTemp = that.config.visualMaxTemperature ?? 30;

                    // Only apply Â±2 logic if this is an external update (from ESPHome)
                    if (!isHomeKitUpdate) {
                        isExternalUpdate = true;
                        
                        uiTemps.low = Math.max(midpoint - 2, minTemp);
                        uiTemps.high = Math.min(midpoint + 2, maxTemp);

                        that.HeaterCoolerService
                            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                            .updateValue(uiTemps.low);
                        that.HeaterCoolerService
                            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                            .updateValue(uiTemps.high);
                        
                        that.log(`${that.name} - [AUTO] ESPHome Update Low:${uiTemps.low}\u00B0C High:${uiTemps.high}\u00B0C | Midpoint: ${midpoint}\u00B0C`);
                        lastMidpointSent = midpoint;
                    }
                    isHomeKitUpdate = false;
                } 
                else if (that.state.mode === 2) { // COOL mode
                    isExternalUpdate = true;
                    that.HeaterCoolerService
                        .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                        .updateValue(that.state.targetTemperature);
                    lastMidpointSent = that.state.targetTemperature;
                } 
                else if (that.state.mode === 3) { // HEAT mode
                    isExternalUpdate = true;
                    that.HeaterCoolerService
                        .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                        .updateValue(that.state.targetTemperature);
                    lastMidpointSent = that.state.targetTemperature;
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
