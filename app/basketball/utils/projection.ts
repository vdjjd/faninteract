// 🔥 Simple fake-3D projection system
export function project3D(x: number, y: number, z: number) {
  const cameraZ = 2.0;      // distance from camera
  const dz = cameraZ - z;   // object depth (bigger dz = farther)

  return {
    screenX: (x - 50) * (1 / dz) + 50,
    screenY: (y - 50) * (1 / dz) + 50,
    scale: 1 / dz,
    zIndex: Math.floor(1000 - dz * 100), // bigger z → behind
  };
}
