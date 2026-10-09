import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './state/AuthContext.jsx';
import { PlayerProvider } from './state/PlayerContext.jsx';
import './styles.css';

// YouTube rejects some music embeds on numeric loopback origins. Use the
// actual local hostname (and send its real origin/referrer) for local playback.
if (window.location.hostname === '127.0.0.1') {
  const localUrl = new URL(window.location.href);
  localUrl.hostname = 'localhost';
  window.location.replace(localUrl.href);
} else {
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PlayerProvider>
          <App />
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
}
