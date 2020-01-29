/*** DummyDevice Z-Way HA module *******************************************

Version: 1.1.0
(c) Z-Wave.Me, 2017
-----------------------------------------------------------------------------
Author: Poltorak Serguei <ps@z-wave.me>, Ray Glendenning <ray.glendenning@gmail.com>
Description:
	Creates a Dummy device
******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function DummyDevice (id, controller) {
	// Call superconstructor first (AutomationModule)
	DummyDevice.super_.call(this, id, controller);
}

inherits(DummyDevice, AutomationModule);

_module = DummyDevice;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

DummyDevice.prototype.init = function (config) {
	DummyDevice.super_.prototype.init.call(this, config);

	var self = this,
		icon = "",
		level = "",
		deviceType = this.config.deviceType;
		
	switch(deviceType) {
		case "switchBinary":
			icon = "switch";
			level = "off";
			break;
		case "switchMultilevel":
			icon = "multilevel";
			level = 0;
			break;
	}
	
	var defaults = {
		metrics: {
			title: self.getInstanceTitle()
		}
	};
 
	var overlay = {
			deviceType: deviceType,
			metrics: {
				icon: icon,
				level: level
			}	  
	};

	this.vDev = this.controller.devices.create({
		deviceId: "DummyDevice_" + this.id,
		defaults: defaults,
		overlay: overlay,
		handler: function(command, args) {
			
			if (command != 'update') {
				var level = command;
				
				if (this.get('deviceType') === "switchMultilevel") {
					if (command === "on") {
						level = 99;
					} else if (command === "off") {
						level = 0;
					} else {
						level = args.level;
					}
				}

				this.set("metrics:level", level);
			}
		},
		moduleId: this.id
	});
};

DummyDevice.prototype.stop = function () {
	if (this.vDev) {
		this.controller.devices.remove(this.vDev.id);
		this.vDev = null;
	}

	DummyDevice.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------