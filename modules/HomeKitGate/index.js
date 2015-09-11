/*
 Version: 1.0.1
 (c) Z-Wave.Me, 2014

 -----------------------------------------------------------------------------
 Author: Alex Skalozub <pieceofsummer@gmail.com> and Poltorak Serguei <ps@z-wave.me>
 Description:
     This module announces Z-Way HA devices to HomeKit

******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function HomeKitGate (id, controller) {
    // Call superconstructor first (AutomationModule)
    HomeKitGate.super_.call(this, id, controller);

    // Create instance variables
};

inherits(HomeKitGate, AutomationModule);

_module = HomeKitGate;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

HomeKitGate.prototype.init = function (config) {
    // Call superclass' init (this will process config argument and so on)
    HomeKitGate.super_.prototype.init.call(this, config);

    var that = this;

    this.hk = new HomeKit(this.config.name, function(r) {
        if (r.method == "GET" && r.path == "/accessories") {
        	return this.accessories.serialize(r);
        } else if (r.method == "PUT" && r.path == "/characteristics" && r.data && r.data.characteristics) {
            r.data.characteristics.forEach(function (c) {
                if (typeof c.value !== "undefined") {   
                    // use c.aid, c.iid and c.value here
                    var characteristic = this.accessories.find(c.aid, c.iid);
                    if (characteristic)
                        characteristic.value = c.value;

                    // update subscribers
                    this.update(c.aid, c.iid);
                }                          
                                           
                if (typeof c.ev === "boolean") { 
                    // set event subscription state  
                    r.events(c.aid, c.iid, c.ev);
                }
            }, this);
            return null; // 204
        } else if (r.method == "GET" && r.path.substring(0, 20) == "/characteristics?id=") {
            var ids = r.path.substring(20).split('.').map(function(x) { return parseInt(x) });

            var characteristic = this.accessories.find(ids[0], ids[1]);
            if (characteristic) {
                return {
                    characteristics: [
                        { aid: ids[0], iid: ids[1], value: characteristic.value }
                    ]
                };
            }
        } else if (r.path == "/identify") {
        	that.controller.addNotification("info", "HomeKit PIN: " + this.pin, "module", "HomeKit");
        }
    });

    this.hk.accessories = new HKAccessoryCollection(this.hk);
	
	// add main accessory
	this.hk.accessories.addAccessory("RaZberry", "z-wave.me", "RaZberry", "RaZberry");

	this.mapping = {}

	var self = this;

	var RGB2HSB = function(r, g, b) {
		if (r instanceof Object) {
			g = r.g;
			b = r.b;
			r = r.r;
		}

		var hue, saturation, brightness;
		var cmax = (r > g) ? r : g;
 		if (b > cmax) 
 			cmax = b;
  		var cmin = (r < g) ? r : g;
 		if (b < cmin) 
 			cmin = b;

		brightness = cmax / 255.0;
		if (cmax > 0) {
			saturation = (cmax - cmin) / cmax;
		} else {
			saturation = 0;
		}
		
		if (saturation == 0) {
			hue = 0;
		} else {
			var redc = (cmax - r) / (cmax - cmin);
			var greenc = (cmax - g) / (cmax - cmin);
			var bluec = (cmax - b) / (cmax - cmin);
			if (r == cmax)
				hue = bluec - greenc;
			else if (g == cmax)
				hue = 2.0 + redc - bluec;
			else
				hue = 4.0 + greenc - redc;
			hue = hue / 6.0;
			if (hue < 0)
				hue = hue + 1.0;
		}
		return { hue: hue, saturation: saturation, brightness: brightness };
	};

	var HSB2RGB = function(hue, saturation, brightness) {
		if (hue instanceof Object) {
			saturation = hue.saturation;
			brightness = hue.brightness;
			hue = hue.hue;
		}

		var r = 0, g = 0, b = 0;
		if (saturation == 0) {
			r = g = b = Math.floor(brightness * 255.0 + 0.5);
		} else {
			var h = (hue - Math.floor(hue)) * 6.0;
			var f = h - Math.floor(h);
			var p = brightness * (1.0 - saturation);
			var q = brightness * (1.0 - saturation * f);
			var t = brightness * (1.0 - (saturation * (1.0 - f)));
			switch (Math.floor(h)) {
				case 0:
					r = Math.floor(brightness * 255.0 + 0.5);
					g = Math.floor(t * 255.0 + 0.5);
					b = Math.floor(p * 255.0 + 0.5);
					break;
				case 1:
					r = Math.floor(q * 255.0 + 0.5);
					g = Math.floor(brightness * 255.0 + 0.5);
					b = Math.floor(p * 255.0 + 0.5);
					break;
				case 2:
					r = Math.floor(p * 255.0 + 0.5);
					g = Math.floor(brightness * 255.0 + 0.5);
					b = Math.floor(t * 255.0 + 0.5);
					break;
               	case 3:
                   	r = Math.floor(p * 255.0 + 0.5);
                   	g = Math.floor(q * 255.0 + 0.5);
                   	b = Math.floor(brightness * 255.0 + 0.5);
                   	break;
               	case 4:
                   	r = Math.floor(t * 255.0 + 0.5);
                   	g = Math.floor(p * 255.0 + 0.5);
                   	b = Math.floor(brightness * 255.0 + 0.5);
                   	break;
               	case 5:
                  	r = Math.floor(brightness * 255.0 + 0.5);
                  	g = Math.floor(p * 255.0 + 0.5);
                   	b = Math.floor(q * 255.0 + 0.5);
                  	break;
            }
        }
        return { r: r, g: g, b: b};
	};
	
	var onDeviceAddedCore = function (vDev) {
		var uniqueId = vDev.get("creatorId") || 1;
		var manufacturer = "z-wave.me"; // todo
		var deviceType = vDev.get("deviceType") || "virtualDevice";
		
		var m = self.mapping[vDev.id] = {};
		var accessory = m.$accessory = self.hk.accessories.addAccessory({
			get: function() { return vDev.get("metrics:title") || vDev.id; }
		}, manufacturer, deviceType, vDev.id, uniqueId);

		if ((deviceType === "sensorMultilevel" || deviceType === "sensorMultiline") && vDev.id.substring(0, 12) === "OpenWeather_") {
			// temperature sensor (OpenWeather)
			var service = accessory.addService(HomeKit.Services.TemperatureSensor, "OpenWeather");

			m.level = [];

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.CurrentTemperature, "float", {
				get: function() { 
					var value = parseFloat(vDev.get("metrics:level")) || 0.0;

					var scaleTitle = vDev.get("metrics:scaleTitle");
					if (scaleTitle && scaleTitle != "°C") {
						// temperature should always be in Celsius
						value = (value - 32) * 5 / 9;
					}

					return value; 
				}
			}, { unit: "celsius" }));

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.TemperatureUnits, "int", {
				get: function() { 
					return vDev.get("metrics:scaleTitle") == "°C" ? 0 : 1; 
				}
			}));

			if (deviceType === "sensorMultiline") {
				m.level.push(service.addCharacteristic(HomeKit.Characteristics.CurrentRelativeHumidity, "float", {
					get: function() {
						var info = vDev.get("metrics:zwaveOpenWeather");
						return (info && info.main && info.main.humidity) || 0.0;
					}
				}, { "unit": "percentage" }));
			}
		}
		else if (deviceType == "sensorMultilevel") {
			var idParts = vDev.id.split('-');
			if (idParts.length > 1) {
				var sensorTypeId = parseInt(idParts[idParts.length-1]);

				if (sensorTypeId === 1) {

					// temperature
					var service = accessory.addService(HomeKit.Services.TemperatureSensor, "Temperature");

					m.level = [];

					m.level.push(service.addCharacteristic(HomeKit.Characteristics.CurrentTemperature, "float", {
						get: function() { 
							var value = parseFloat(vDev.get("metrics:level")) || 0.0;

							var scaleTitle = vDev.get("metrics:scaleTitle");
							if (scaleTitle != "°C") {
								// temperature should always be in Celsius
								value = (value - 32) * 5 / 9;
							}

							return value;
						}
					}, { unit: "celsius" }));

					m.level.push(service.addCharacteristic(HomeKit.Characteristics.TemperatureUnits, "int", {
						get: function() { 
							return vDev.get("metrics:scaleTitle") == "°C" ? 0 : 1; 
						}
					}));

				} else if (sensorTypeId === 3) {

					// luminosity
					var service = accessory.addService(HomeKit.Services.LightSensor, "Luminosity");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.CurrentLightLevel, "float", {
						get: function() { return parseFloat(vDev.get("metrics:level")) || 0.0; }
					});

				} else if (sensorTypeId === 5) {
					
					// humidity
					var service = accessory.addService(HomeKit.Services.HumiditySensor, "Humidity");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.CurrentRelativeHumidity, "float", {
						get: function() { return parseFloat(vDev.get("metrics:level")) || 0.0; }
					});

				} else if (sensorTypeId === 17) {

					// CO2
					var service = accessory.addService(HomeKit.Services.CarbonDioxideSensor, "CO2");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.CarbonDioxideLevel, "float", {
						get: function() { return parseFloat(vDev.get("metrics:level")) || 0.0; }
					});

				} else {

					// todo: other sensor types

				}
			}
		}
		else if (deviceType == "sensorBinary") {
			var idParts = vDev.id.split('-');
			if (idParts.length > 1) {
				var sensorTypeId = parseInt(idParts[idParts.length-1]);

				if (sensorTypeId === 2) {

					// smoke
					var service = accessory.addService(HomeKit.Services.SmokeSensor, "Smoke Sensor");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.SmokeDetected, "bool", {
						get: function() { return vDev.get("metrics:level") === "on"; }
					});

				} else if (sensorTypeId === 3) {
					
					// CO
					var service = accessory.addService(HomeKit.Services.CarbonMonoxideSensor, "CO Sensor");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.CarbonMonoxideDetected, "bool", {
						get: function() { return vDev.get("metrics:level") === "on"; }
					});

				} else if (sensorTypeId === 4) {

					// CO2
					var service = accessory.addService(HomeKit.Services.CarbonDioxideSensor, "CO2 Sensor");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.CarbonDioxideDetected, "bool", {
						get: function() { return vDev.get("metrics:level") === "on"; }
					});

				} else if (sensorTypeId === 6) {
					
					// flood
					var service = accessory.addService(HomeKit.Services.LeakSensor, "Flood Sensor");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.LeakDetected, "bool", {
						get: function() { return vDev.get("metrics:level") === "on"; }
					});

				} else if (sensorTypeId === 10) {

					// door
					var service = accessory.addService(HomeKit.Services.Door, "Door Sensor");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.ObstructionDetected, "bool", {
						get: function() { return vDev.get("metrics:level") === "on"; }
					});

				} else if (sensorTypeId === 12) {
					
					// motion
					var service = accessory.addService(HomeKit.Services.MotionSensor, "Motion Sensor");
					
					m.level = service.addCharacteristic(HomeKit.Characteristics.MotionDetected, "bool", {
						get: function() { return vDev.get("metrics:level") === "on"; }
					});

				} else {

					// todo: other sensor types

				}
			}
		}
		else if (deviceType == "switchBinary") {
			var service = accessory.addService(HomeKit.Services.Lightbulb, "Binary Switch");
			
			m.level = service.addCharacteristic(HomeKit.Characteristics.PowerState, "bool", {
				get: function() { return vDev.get("metrics:level") === "on"; },
				set: function(value) { vDev.performCommand(value ? "on" : "off"); }
			});
		}
		else if (deviceType == "switchMultilevel") {
			var service = accessory.addService(HomeKit.Services.Lightbulb, "Multilevel Switch");
			
			m.level = [];

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.PowerState, "bool", {
				get: function() { return parseInt(vDev.get("metrics:level")) > 0; },
				set: function(value) { vDev.performCommand(value ? "on" : "off"); }
			}));

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.Brightness, "int", {
				get: function() { return Math.min(parseInt(vDev.get("metrics:level")) || 0, 100); },
				set: function(value) { vDev.performCommand("exact", { level: value }); }
			}, { unit: "percentage", minValue: 0, maxValue: 100, minStep: 1 }));
		}
		else if (deviceType == "switchRGBW") {
			var service = accessory.addService(HomeKit.Services.Lightbulb, "RGBW Switch");

			m.level = [];

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.PowerState, "bool", {
				get: function() { return vDev.get("metrics:level") === "on"; },
				set: function(value) { vDev.performCommand(value ? "on" : "off"); }
			}));

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.Hue, "float", {
				get: function() { 
					var color = vDev.get("metrics:color");
					var hsb = RGB2HSB(color);
					return hsb.hue * 360.0; 
				},
				set: function(value) { 
					var color = vDev.get("metrics:color");
					var hsb = RGB2HSB(color);
					hsb.hue = value / 360.0;
					color = HSB2RGB(hsb);
					vDev.performCommand("exact", { red: color.r, green: color.g, blue: color.b }); 
				}
			}, { unit: "arcdegrees", minValue: 0, maxValue: 360, minStep: 1 }));

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.Saturation, "int", {
				get: function() { 
					var color = vDev.get("metrics:color");
					var hsb = RGB2HSB(color);
					return Math.floor(hsb.saturation * 100.0 + 0.5); 
				},
				set: function(value) { 
					var color = vDev.get("metrics:color");
					var hsb = RGB2HSB(color);
					hsb.saturation = value / 100.0;
					color = HSB2RGB(hsb);
					vDev.performCommand("exact", { red: color.r, green: color.g, blue: color.b }); 
				}
			}, { unit: "percentage", minValue: 0, maxValue: 100, minStep: 1 }));

			m.level.push(service.addCharacteristic(HomeKit.Characteristics.Brightness, "int", {
				get: function() { 
					var color = vDev.get("metrics:color");
					var hsb = RGB2HSB(color);
					return Math.floor(hsb.brightness * 100.0 + 0.5); 
				},
				set: function(value) { 
					var color = vDev.get("metrics:color");
					var hsb = RGB2HSB(color);
					hsb.brightness = value / 100.0;
					color = HSB2RGB(hsb);
					vDev.performCommand("exact", { red: color.r, green: color.g, blue: color.b }); 
				}
			}, { unit: "percentage", minValue: 0, maxValue: 100, minStep: 1 }));
		}
		else if (deviceType == "battery") {
			var service = accessory.addService(HomeKit.Services.Battery, "Battery");
			
			m.level = service.addCharacteristic(HomeKit.Characteristics.BatteryLevel, "int", {
				get: function() { return parseInt(vDev.get("metrics:level")); }
			}, { unit: "percentage", minValue: 0, maxValue: 100 });
		}
		// todo
	}
	
	this.onDeviceAdded = function (vDev) {
		if (!vDev.get("permanently_hidden")) {
			console.log("HK: added", vDev.id);
			onDeviceAddedCore(vDev);
			// update device tree
			self.hk.update();
		}
	};
	
	this.onDeviceRemoved = function (vDev) {
		console.log("HK: removed", vDev.id);
		var m = self.mapping[vDev.id];
		if (m) {
			var accessory = m.$accessory;
			if (accessory)
				accessory.remove();
			
			delete self.mapping[vDev.id];
		}
		
		// update device tree
		self.hk.update();
	}

	this.onLevelChanged = function (vDev) {
		console.log("HK: updated", vDev.id);
		var m = self.mapping[vDev.id];
		if (!m) return;
		
		var accessory = m.$accessory;
		if (!accessory) return;
		
		if (m.level instanceof Array) {
			for (var i = 0; i < m.level.length; i++) {
				var characteristics = m.level[i];
				if (!characteristics) return;

				self.hk.update(accessory.aid, characteristics.iid);
			};
		} else {
			var characteristics = m.level;
			if (!characteristics) return;

			self.hk.update(accessory.aid, characteristics.iid);
		}
	}
	
	// add existing devices
	this.controller.devices.each(onDeviceAddedCore);
	
	// listen for future device collection changes
	this.controller.devices.on("created", this.onDeviceAdded);
	this.controller.devices.on("removed", this.onDeviceRemoved);

	this.controller.devices.on("change:metrics:level", this.onLevelChanged);
	this.controller.devices.on("change:metrics:color", this.onLevelChanged);
	this.controller.devices.on("change:metrics:scaleTitle", this.onLevelChanged);
	this.controller.devices.on("change:metrics:zwaveOpenWeather", this.onLevelChanged);
	
	// update device tree
    this.hk.update();

    console.log("HomeKit PIN:", this.hk.pin);
};

HomeKitGate.prototype.stop = function () {
    HomeKitGate.super_.prototype.stop.call(this);

	this.controller.devices.off("created", this.onDeviceAdded);
	this.controller.devices.off("removed", this.onDeviceRemoved);
	this.controller.devices.off("change:metrics:level", this.onLevelChanged);

    if (this.hk) {
        this.hk.stop();
    }
    
    delete this.mapping;
    delete this.onDeviceAdded;
    delete this.onDeviceRemoved;
    delete this.onLevelChanged;
};
// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------
