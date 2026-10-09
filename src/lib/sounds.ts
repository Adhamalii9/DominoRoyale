
const SOUNDS = {
  play: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', // Light subtle click
  win: 'https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3', // Short victory
};

class SoundManager {
  private audios: Map<string, HTMLAudioElement> = new Map();
  private muted: boolean = false;
  private initialized: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.muted = localStorage.getItem('game_muted') === 'true';
    }
  }

  private init() {
    if (this.initialized) return;
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.load(); // Force load
      this.audios.set(key, audio);
    });
    this.initialized = true;
  }

  play(sound: keyof typeof SOUNDS) {
    if (!this.initialized) this.init();
    
    if (this.muted) return;
    const audio = this.audios.get(sound);
    if (!audio) return;
    
    // Use clones for overlapping sounds (e.g. fast consecutive clicks)
    const clone = audio.cloneNode(true) as HTMLAudioElement;
    clone.volume = 0.5;
    clone.play().catch((err) => {
      console.warn('Audio play blocked:', err);
    });
  }

  unlock() {
    if (!this.initialized) this.init();
    
    this.audios.forEach(audio => {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('game_muted', String(this.muted));
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }
}

export const soundManager = new SoundManager();
