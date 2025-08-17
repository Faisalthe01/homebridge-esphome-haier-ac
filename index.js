const ESPHome = require('./lib/esphome');
const PLUGIN_NAME = 'homebridge-esphome-haier-ac';
const PLATFORM_NAME = 'HaierAC'; // Unique platform name

module.exports = (api) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, ESPHomeAC);
};

class ESPHomeAC {
    constructor(log, config, api) {
        this.api = api;
        this.log = log;

        this.accessories = [];
        this.esphomeDevices = {};
        this.PLUGIN_NAME = PLUGIN_NAME;
        this.PLATFORM_NAME = PLATFORM_NAME;
        this.name = config.name || PLATFORM_NAME;
        this.devices = config.devices || [];
        this.debug = config.debug || false;

        // Debug logger
        this.log.easyDebug = (...content) => {
            if (this.debug) {
                this.log(content.join(' '));
            } else {
                this.log.debug(content.join(' '));
            }
        };

        this.api.on('didFinishLaunching', ESPHome.init.bind(this));
    }

    configureAccessory(accessory) {
        this.log.easyDebug(`Found Cached Accessory: ${accessory.displayName} (${accessory.context.deviceId})`);
        this.accessories.push(accessory);
    }
}
