let apiPromise;

export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const previous = window.onYouTubeIframeAPIReady;
      const timeout = setTimeout(() => fail(), 20000);
      function fail() {
        clearTimeout(timeout);
        script.remove();
        apiPromise = undefined;
        reject(new Error('YouTube could not connect. Check your connection or open the song on YouTube.'));
      }
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout);
        previous?.();
        resolve(window.YT);
      };
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export function youtubeError(code) {
  if ([100, 101, 150].includes(code)) return 'This video is unavailable here. Open it on YouTube or choose another song.';
  if (code === 153) return 'YouTube could not verify this site. Open the song on YouTube to continue.';
  return 'YouTube could not play this video. Retry, open it on YouTube, or choose another song.';
}
