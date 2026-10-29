// The Desktop's pages (public/farm.js) talk to the app through this, their
// only way to it: each asks for its window to take clicks while the mouse
// is over a Pixeling, and to let them through to what is under it the rest
// of the time. Behind your windows, the back page says who is asking you
// something and where they stand, and the front page (over every window)
// hears it, to show just them.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pixelings', {
  catchClicks: on => ipcRenderer.send('desktop-catch-clicks', on === true),
  front: list => ipcRenderer.send('desktop-front', list),
  onFront: listen => ipcRenderer.on('desktop-front', (e, list) => listen(list)),
})
