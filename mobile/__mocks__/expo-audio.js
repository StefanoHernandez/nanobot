// expo-audio needs native modules at import time; stub for jest.
module.exports = {
  useAudioPlayer: () => ({ play() {}, pause() {}, seekTo() {} }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
};
