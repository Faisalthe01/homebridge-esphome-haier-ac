let Characteristic, Service;
const stateManager = require('./stateManager');

class HeaterCooler {
    constructor(device, entity, state, platform) {
        Service = platform.api.hap.Service;
        Characteristic = platform.api.hap.Characteristic;

        // Store device/entity info
        this.config = entity.config;
        this.esphome = entity;
        this.log = platform.log;
        this.api = platform.api;
        this.id = this.config.uniqueId;              // Unique ID for accessory
        this.host = device.host;
        this.name = device.name;
        this.serial = this.id;                        // Serial number preserved
        this.model = 'AC';
        this.manufacturer = 'Haier AC';
        this.type = 'HeaterCooler';
        this.displayName = this.name;
        this.state = state;
        this.connected = true;
        this.pending = [];

        // Initialize state manager wrapper
        this.stateManager = stateManager;
        this.stateManager.init(platform.api);

        // Fan speed settings: AUTO, LOW, MID, HIGH
        this.fanSpeedSettings = {
            levels: [25, 50, 75, 100],   // UI display percentages
            modes: [2, 3, 4, 5],         // Corresponding mode IDs
            names: ['AUTO', 'LOW', 'MID', 'HIGH'],
            currentMode: this.state?.fanMode ?? 2
        };

        // Determine swing mode support
        if (this.config.supportedSwingModesList.length > 1) {
            this.swingModeValue = this.config.supportedSwingModesList.includes(1) ? 1 :
                                 (this.config.supportedSwingModesList.includes(2) ? 2 : 3);
        }

        // Generate unique UUID for HomeKit accessory
        this.UUID = this.api.hap.uuid.generate(this.id);
        this.accessory = platform.accessories.find(acc => acc.UUID === this.UUID);

        // Create or reuse accessory
        if (!this.accessory) {
            this.log(`Creating New ESPHome AC Accessory: "${this.name}"`);
            this.accessory = new this.api.platformAccessory(this.name, this.UUID);
            this.accessory.context.deviceId = this.id;
            this.accessory.context.host = this.host;
            this.accessory.context.lastTargetState = (this.state.mode && [1,2,3].includes(this.state.mode)) ? this.state.mode : 1;
            platform.accessories.push(this.accessory);
            this.api.registerPlatformAccessories(platform.PLUGIN_NAME, platform.PLATFORM_NAME, [this.accessory]);
        } else {
            this.log(`ESPHome device "${this.name}" is connected!`);
            if (this.state.mode && [1,2,3].includes(this.state.mode)) {
                this.accessory.context.lastTargetState = this.state.mode;
            }
        }

        // --- Accessory Information ---
        const infoService = this.accessory.getService(Service.AccessoryInformation)
                           || this.accessory.addService(Service.AccessoryInformation);

        // Set manufacturer, model, serial, and placeholder firmware
        infoService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.id) // Serial number preserved
            .setCharacteristic(Characteristic.FirmwareRevision, '2025.7.4'); // Temporary placeholder

        // Fetch firmware from ESPHome API once device is connected
        this.esphome.on('connected', async () => {
            try {
                const info = await this.esphome.device_info?.();
                if (info?.fw_version) {
                    infoService.updateCharacteristic(Characteristic.FirmwareRevision, info.fw_version);
                    this.log(`${this.name} firmware version: ${info.fw_version}`);
                }
            } catch (err) {
                this.log.error(`Failed to fetch firmware version: ${err.message}`);
            }
        });

        // Add main HeaterCooler service
        this.addHeaterCoolerService();

        // Listen to state changes from ESPHome
        this.esphome.on('state', this.updateState.bind(this));
    }

    // --- Add HeaterCooler service and configure characteristics ---
    addHeaterCoolerService() {
        this.log(`Adding HeaterCooler service for "${this.name}"`);
        this.HeaterCoolerService = this.accessory.getService(Service.HeaterCooler)
                                || this.accessory.addService(Service.HeaterCooler, this.name);

        // Active state (ON/OFF)
        this.HeaterCoolerService.getCharacteristic(Characteristic.Active)
            .onSet(this.stateManager.set.Active.bind(this));

        // Target mode (HEAT, COOL, AUTO)
        this.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .onSet(this.stateManager.set.TargetHeaterCoolerState.bind(this));

        // Current temperature
        this.HeaterCoolerService.getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({ minValue: -100, maxValue: 100, minStep: 0.1 });

        // Cooling threshold
        if (this.config.supportedModesList.includes(2) || this.config.supportedModesList.includes(1)) {
            this.HeaterCoolerService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
                .setProps({
                    minValue: this.config.visualMinTemperature,
                    maxValue: this.config.visualMaxTemperature,
                    minStep: this.config.visualTargetTemperatureStep
                })
                .onSet(this.stateManager.set.CoolingThresholdTemperature.bind(this));
        }

        // Heating threshold
        if (this.config.supportedModesList.includes(3) || this.config.supportedModesList.includes(1)) {
            this.HeaterCoolerService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                .setProps({
                    minValue: this.config.visualMinTemperature,
                    maxValue: this.config.visualMaxTemperature,
                    minStep: this.config.visualTargetTemperatureStep
                })
                .onSet(this.stateManager.set.HeatingThresholdTemperature.bind(this));
        }

        // Swing mode (if supported)
        if (this.swingModeValue) {
            this.HeaterCoolerService.getCharacteristic(Characteristic.SwingMode)
                .onSet(this.stateManager.set.SwingMode.bind(this));
        }

        // Fan speed control
        this.HeaterCoolerService.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minValue: 0, maxValue: 100, minStep: 25 })
            .onSet(async (value) => {
                try { await this.handleFanSpeedChange(value); }
                catch (err) { this.log.error(`Fan speed error: ${err}`); }
            });

        // Initialize state display
        this.updateState(this.state);
    }

    // --- Handle fan speed change ---
    async handleFanSpeedChange(speed) {
        // Map speed percentage to fan mode
        let index;
        if (speed <= 25) index = 0;
        else if (speed <= 50) index = 1;
        else if (speed <= 75) index = 2;
        else index = 3;

        const newMode = this.fanSpeedSettings.modes[index];
        const speedName = this.fanSpeedSettings.names[index];

        if (this.fanSpeedSettings.currentMode === newMode) return;

        // this.log(`${this.name} - Setting Fan to ${speedName} (${speed}%)`);
        this.fanSpeedSettings.currentMode = newMode;

        // Prepare state update
        const stateUpdate = {};
        if (this.config.supportedFanModesList.includes(newMode)) stateUpdate.fanMode = newMode;
        else if (this.config.supportedCustomFanModesList.includes(newMode)) stateUpdate.customFanMode = newMode;
        else {
            this.log.error(`${this.name} - Unsupported fan mode: ${newMode}`);
            return;
        }

        Object.assign(this.state, stateUpdate);

        // Send update via stateManager
        await this.stateManager.set.RotationSpeed.call(this, speed);
    }

    // --- Update HomeKit characteristics based on device state ---
    updateState(state) {
        try {
            this.state = state;

            // Update AUTO mode UI
            if (this.state.mode === 1) this.stateManager.set.updateUI(this);

            // Current temperature
            this.HeaterCoolerService.getCharacteristic(Characteristic.CurrentTemperature)
                .updateValue(this.state.currentTemperature);

// If the mode is AUTO, let the dedicated updateUI function handle the special temperature range.
// For all other modes (HEAT/COOL), update both characteristics to keep them synced and prevent the glitch.
if (this.state.mode === 1) { // AUTO mode
    // This was already in your code and is correct. It calls the special
    // logic in statemanager.js to create the ±2 degree range for the UI.
    this.stateManager.set.updateUI(this);

} else { // For HEAT, COOL, etc.
    // This is the fix. It ensures both characteristics are always aligned with the
    // device's target temperature, eliminating the UI glitch when switching modes.
    if (this.state.targetTemperature !== undefined) {
        this.HeaterCoolerService.getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .updateValue(this.state.targetTemperature);
        this.HeaterCoolerService.getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .updateValue(this.state.targetTemperature);
    }
}
            if ([1,2,3].includes(this.state.mode)) this.accessory.context.lastTargetState = this.state.mode;

            // Update states for different modes
            switch (this.state.mode) {
                case 0: // OFF
                    this.HeaterCoolerService.getCharacteristic(Characteristic.Active).updateValue(0);
                    this.HeaterCoolerService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                        .updateValue(Characteristic.CurrentHeaterCoolerState.INACTIVE);
                    break;

                case 1: // AUTO
                    this.HeaterCoolerService.getCharacteristic(Characteristic.Active).updateValue(1);
                    this.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                        .updateValue(Characteristic.TargetHeaterCoolerState.AUTO);

                    if (this.state.currentTemperature !== undefined && this.state.targetTemperature !== undefined) {
                        const midpoint = this.state.targetTemperature;
                        let currentState = Characteristic.CurrentHeaterCoolerState.IDLE;
                        if (this.state.currentTemperature < midpoint) currentState = Characteristic.CurrentHeaterCoolerState.HEATING;
                        else if (this.state.currentTemperature > midpoint) currentState = Characteristic.CurrentHeaterCoolerState.COOLING;
                        this.HeaterCoolerService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                            .updateValue(currentState);
                    }
                    break;

                case 2: // COOL
                    this.HeaterCoolerService.getCharacteristic(Characteristic.Active).updateValue(1);
                    this.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                        .updateValue(Characteristic.TargetHeaterCoolerState.COOL);

                    if (this.state.currentTemperature !== undefined && this.state.targetTemperature !== undefined) {
                        const currentState = this.state.currentTemperature > this.state.targetTemperature
                            ? Characteristic.CurrentHeaterCoolerState.COOLING
                            : Characteristic.CurrentHeaterCoolerState.IDLE;
                        this.HeaterCoolerService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                            .updateValue(currentState);
                    }
                    break;

                case 3: // HEAT
                    this.HeaterCoolerService.getCharacteristic(Characteristic.Active).updateValue(1);
                    this.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                        .updateValue(Characteristic.TargetHeaterCoolerState.HEAT);

                    if (this.state.currentTemperature !== undefined && this.state.targetTemperature !== undefined) {
                        const currentState = this.state.currentTemperature < this.state.targetTemperature
                            ? Characteristic.CurrentHeaterCoolerState.HEATING
                            : Characteristic.CurrentHeaterCoolerState.IDLE;
                        this.HeaterCoolerService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                            .updateValue(currentState);
                    }
                    break;

                case 4: // FAN_ONLY
                case 5: // DRY
                    this.HeaterCoolerService.getCharacteristic(Characteristic.Active).updateValue(1);
                    this.HeaterCoolerService.getCharacteristic(Characteristic.TargetHeaterCoolerState)
                        .updateValue(Characteristic.TargetHeaterCoolerState.AUTO);
                    this.HeaterCoolerService.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
                        .updateValue(Characteristic.CurrentHeaterCoolerState.IDLE);
                    break;
            }

            // Update swing mode
            if (this.swingModeValue) {
                this.HeaterCoolerService.getCharacteristic(Characteristic.SwingMode)
                    .updateValue(this.state.swingMode ? 1 : 0);
            }

            // Update fan speed display
            const fanMode = this.state.fanMode || this.state.customFanMode;
            if (fanMode !== undefined) {
                const index = this.fanSpeedSettings.modes.indexOf(fanMode);
                if (index !== -1) {
                    const speed = this.fanSpeedSettings.levels[index];
                    this.HeaterCoolerService.getCharacteristic(Characteristic.RotationSpeed)
                        .updateValue(speed);
                }
            }

        } catch (err) {
            this.log.error(`Error updating state: ${err.message}`);
            if (err.stack) this.log.debug(err.stack);
        }
    }
}

module.exports = HeaterCooler;
