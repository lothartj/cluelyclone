import { contextBridge, ipcRenderer, desktopCapturer, screen } from 'electron';

contextBridge.exposeInMainWorld('cluely', {
  version: '0.1.0',
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    hide: () => ipcRenderer.invoke('window:hide'),
    close: () => ipcRenderer.invoke('window:close'),
    getBounds: () => ipcRenderer.invoke('window:get-bounds')
  },
  capture: {
    screenshotFull: async () => {
      try {
        const primary = screen.getPrimaryDisplay();
        const { width, height, scaleFactor } = primary.size && primary ? {
          width: primary.size.width,
          height: primary.size.height,
          scaleFactor: primary.scaleFactor || 1
        } : { width: 1920, height: 1080, scaleFactor: 1 };
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: Math.floor(width * scaleFactor), height: Math.floor(height * scaleFactor) }
        });
        let source = sources.find(s => String(s.id).includes(String(primary.id)));
        if (!source && sources.length > 0) source = sources[0];
        if (!source) throw new Error('No screen source available');
        const dataUrl = source.thumbnail.toDataURL();
        return { dataUrl, width, height, scaleFactor };
      } catch (e) {
        return { error: e.message || 'Failed to capture screen' };
      }
    }
  },
  selector: {
    open: () => ipcRenderer.invoke('selector:open'),
    cancel: () => ipcRenderer.invoke('selector:cancel'),
    complete: (payload) => ipcRenderer.invoke('selector:complete', payload),
    onVisualAsk: (callback) => {
      const listener = (_e, data) => callback?.(data);
      ipcRenderer.on('visual-ask', listener);
      return () => ipcRenderer.removeListener('visual-ask', listener);
    }
  }
}); 