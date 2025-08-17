# homebridge-esphome-haier-ac

[Homebridge](https://homebridge.io) plugin for ESPHome Haier AC Accessories.

if you like to Integrate Haier AC with ESPHome module. Here are the instructions, you can buy ESPHome chip and some wiring 

https://esphome.io/components/climate/haier.html

# Homebridge 2.0 compatible
Now it is Homebridge 2.0 compatible

# How to install this fork

```bash
npm install -g homebridge-esphome-haier-ac
```

-----------------------------------------------------------------------------
# Fixes from original plugin

I have fixed the following and can be used with Haier AC

## Heat / Cool Mode
- HomeKit shows the correct **current state**:
  - When the target temperature is reached, the tile displays **“Heat”** (heat mode) or **“Cool”** (cool mode).  
  - When actively heating or cooling, it displays **“Heating”** or **“Cooling”**.  

## Auto Mode
- Supports **two selectable temperatures** (low and high).  
- HomeKit sends the **midpoint temperature** to the AC.  
- Default visual values: **Low = 20°C, High = 24°C**, for a better interface display.
- Syncs from AC remote or Haier app, it will show Low value as 2 below the set temperature and High vale as 2 above the set temperature

## Dry / Fan Modes
- These modes are not fully supported by HomeKit.  
- If changed via AC remote or Haier app, HomeKit shows the AC in **“IDLE”** state.  

## Fan Speed
- Supports **AUTO, LOW, MID, HIGH** fan speeds.  
- **Duplicate commands are avoided**.  
- Changes via AC remote or Haier app are **reflected in HomeKit**.  

## Swing Mode
- Changes via AC remote or Haier app are **reflected in HomeKit**.  

## Other Changes
- AC **restores the last mode** when turned on from HomeKit.  
- AC **temperature and mode state** are always synchronized with HomeKit.

--------------------------------------------------------------------------------------


## Why this plugin?

I created this plugin because I did not like the Home Assistant integration for Air Conditioner in HomeKit. this plugin give better control over AC accessory with fan speed and oscilate directly from the accessory settings instead of adding another fan accessory.

It also better shows the state of Cooling/Heating and allow to turn ON/OFF by one tap from the home screen instead of going into the accessory settings..

## Installation

You can configure each of the esphome devices directly from the Homebridge UI or view the attached config-sample.json to see how to configure with the config.json file

The plugin will automatically collect your configurations from ESPHome and will allow those to be controlled from HomeKit




-------------------------------------------

