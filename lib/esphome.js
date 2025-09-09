const { Client } = require('@2colors/esphome-native-api');
const HeaterCooler = require('./HeaterCooler');

module.exports = {
  init: function() {
    this.devices.forEach(device => {
      let client;

      const markNotResponding = (reason) => {
        this.log.error(`?? ${device.name} marked as Not Responding: ${reason}`);
      };

      try {
        client = new Client({
          host: device.host,
          port: device.port || 6053,
          encryptionKey: device.encryptionKey || '',
          clearSession: false,
          reconnectInterval: 5000
        });
      } catch (err) {
        markNotResponding(err.message || 'Invalid encryptionKey');
        return;
      }

      const addNewAccessory = entity => {
        this.log.easyDebug('Entity Detected:', entity);
        if (entity.type === 'Climate') {
          entity.once('state', (state) => {
            this.log.easyDebug(`${device.name} Entity State:`, state);
            this.log(`Initializing Heater Cooler Accessory - ${device.name}`);
            this.esphomeDevices[entity.config.uniqueId] = new HeaterCooler(device, entity, state, this);
            client.off('newEntity', addNewAccessory);

            client.on('disconnected', () => {
              this.log(`${device.name} client disconnected!`);
              this.esphomeDevices[entity.config.uniqueId].connected = false;
              markNotResponding('Disconnected');
            });

            client.on('connected', () => {
              this.log(`${device.name} client reconnected`);
              this.esphomeDevices[entity.config.uniqueId].connected = true;
            });
          });
        } else {
          this.log.easyDebug(`Not a Climate type device - ${entity.name} (${entity.type}) !`);
        }
      };

      try {
        client.connect();
      } catch (err) {
        markNotResponding(err.message || 'Connect failed');
        return;
      }

      client.on('newEntity', addNewAccessory);

      let loggedErrors = new Set();
      client.on('error', (err) => {
        const errMsg = err.message || err.toString();
        if (!loggedErrors.has(errMsg)) {
          this.log.error(`${device.name} Error Occurred:`);
          this.log.error(err.stack || errMsg);
          loggedErrors.add(errMsg);
        } else {
          this.log.easyDebug(`Suppressed repeated error: ${errMsg}`);
        }
      });
    });

    // Remove deleted devices
    this.accessories.forEach(accessory => {
      if (!this.devices.find(device => device.host === accessory.context.host)) {
        this.log(`Unregistering deleted device: "${accessory.displayName}"`);
        this.api.unregisterPlatformAccessories(this.PLUGIN_NAME, this.PLATFORM_NAME, [accessory]);
      }
    });
  }
};
