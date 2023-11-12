var { WebUSB } = require("usb");
const { app, Tray, Menu, nativeImage } = require("electron");
if (require("electron-squirrel-startup")) app.quit();

const path = require("path");
const rootPath = app.getAppPath();
let tray;
let batteryCheckInterval;

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(
    path.join(rootPath, "src/assets/battery_0.png")
  );
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: "Quit", type: "normal", click: QuitClick },
  ]);

  batteryCheckInterval = setInterval(() => {
    SetTrayDetails(tray);
  }, 30000);

  SetTrayDetails(tray);

  tray.setContextMenu(contextMenu);
  tray.setToolTip("Searching for device");
  tray.setTitle("Razer battery life");
});

function SetTrayDetails(tray) {
  GetBatteryState().then((battState) => {
    if (battState.battLife === 0 || battState.battLife === undefined) return;

    let assetPath = GetBatteryIconPath(battState.battLife);

    tray.setImage(nativeImage.createFromPath(path.join(rootPath, assetPath)));
    tray.setToolTip(
      battState.battLife == 0
        ? "Device disconnected"
        : (battState.isCharging
            ? "Charging: " + battState.battLife
            : battState.battLife) + "%"
    );
  });
}

function GetBatteryIconPath(val) {
  let iconName;
  iconName = Math.floor(val / 10) * 10;
  return `src/assets/battery_${iconName}.png`;
}

function QuitClick() {
  clearInterval(batteryCheckInterval);
  if (process.platform !== "darwin") app.quit();
}

// mouse stuff
const RazerVendorId = 0x1532;
const RazerProducts = {
  0x00aa: {
    name: "Razer Basilisk V3 Pro",
    transactionId: 0x1f,
  },
  0x00ab: {
    name: "Razer Basilisk V3 Pro",
    transactionId: 0x1f,
  },
  0x007c: {
    name: "Razer DeathAdder V2 Pro Wired",
    transactionId: 0x3f,
  },
  0x007d: {
    name: "Razer DeathAdder V2 Pro Wireless",
    transactionId: 0x3f,
  },
  0x009c: {
    name: "Razer DeathAdder V2 X HyperSpeed",
    transactionId: 0x1f,
  },
  0x00b3: {
    name: "Razer Hyperpolling Wireless Dongle",
    transactionId: 0x1f,
  },
  0x00b6: {
    name: "Razer Deathadder V3 Pro Wired",
    transactionId: 0x1f,
  },
  0x00b7: {
    name: "Razer Deathadder V3 Pro Wireless",
    transactionId: 0x1f,
  },
  0x0083: {
    name: "Razer Basilsk X HyperSpeed",
    transactionId: 0x1f,
  },
  0x0086: {
    name: "Razer Basilisk Ultimate",
    transactionId: 0x1f,
  },
  0x0088: {
    name: "Razer Basilisk Ultimate Dongle",
    transactionId: 0x1f,
  },
  0x008f: {
    name: "Razer Naga v2 Pro Wired",
    transactionId: 0x1f,
  },
  0x0090: {
    name: "Razer Naga v2 Pro Wireless",
    transactionId: 0x1f,
  },
  0x00a5: {
    name: "Razer Viper V2 Pro Wired",
    transactionId: 0x1f,
  },
  0x00a6: {
    name: "Razer Viper V2 Pro Wireless",
    transactionId: 0x1f,
  },
  0x007b: {
    name: "Razer Viper Ultimate",
    transactionId: 0x3f,
  },
  0x007a: {
    name: "Razer Viper Ultimate Dongle",
    transactionId: 0x3f,
  },
};

function GetMessage(mouse, command_class, command_id, data_size) {
  // Function that creates and returns the message to be sent to the device
  let msg = Buffer.from([
    0x00,
    mouse.transactionId,
    0x00,
    0x00,
    0x00,
    data_size,
    command_class,
    command_id,
  ]);
  let crc = 0;

  for (let i = 2; i < msg.length; i++) {
    crc = crc ^ msg[i];
  }

  // the next 80 bytes would be storing the data to be sent, but for getting the battery no data is sent
  msg = Buffer.concat([msg, Buffer.alloc(80)]);

  // the last 2 bytes would be the crc and a zero byte
  msg = Buffer.concat([msg, Buffer.from([crc, 0])]);

  return msg;
}

async function GetMouse() {
  const customWebUSB = new WebUSB({
    // This function can return a promise which allows a UI to be displayed if required
    devicesFound: (devices) => {
      // let dStr = devices.reduce((acc, d) => acc += `${d.productId}||${d.productName}\r\n`,'')
      // new Notification({title: 'Info', body: dStr}).show()
      return devices.find(
        (device) =>
          RazerVendorId && RazerProducts[device.productId] != undefined
      );
    },
  });

  // Returns device based on injected 'devicesFound' function
  const device = await customWebUSB.requestDevice({
    filters: [{}],
  });

  if (device) {
    return device;
  } else {
    throw new Error("No Razer device found on system");
  }
}

async function GetBatteryState() {
  try {
    const mouse = await GetMouse();
    await mouse.open();

    const batteryLevelMsg = GetMessage(mouse, 0x07, 0x80, 0x02);
    const isChargingMsg = GetMessage(mouse, 0x07, 0x84, 0x02);

    if (mouse.configuration === null) {
      await mouse.selectConfiguration(1);
    }

    await mouse.claimInterface(
      mouse.configuration.interfaces[0].interfaceNumber
    );

    const batteryLevelRequest = await ControlTransferOut(
      mouse,
      batteryLevelMsg
    );
    await new Promise((res) => setTimeout(res, 500));
    const batteryLevelReply = await ControlTransferIn(mouse);

    const isChargingRequest = await ControlTransferOut(mouse, isChargingMsg);
    await new Promise((res) => setTimeout(res, 500));
    const isChargingReply = await ControlTransferIn(mouse);

    return {
      battLife: ((batteryLevelReply.data.getUint8(9) / 255) * 100).toFixed(1),
      isCharging: isChargingReply.data.getUint8(9) == 1,
    };
  } catch (error) {
    console.error(error);
  }
}

async function ControlTransferOut(mouse, msg) {
  return mouse.controlTransferOut(
    {
      requestType: "class",
      recipient: "interface",
      request: 0x09,
      value: 0x300,
      index: 0x00,
    },
    msg
  );
}

async function ControlTransferIn(mouse) {
  return mouse.controlTransferIn(
    {
      requestType: "class",
      recipient: "interface",
      request: 0x01,
      value: 0x300,
      index: 0x00,
    },
    90
  );
}
