import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (import.meta.env.VITE_HOSTED_SITES) {
    if (user) return <Navigate to="/app" replace />;
    return <div className="auth-screen"><div className="auth-card">
      <div className="auth-header"><span className="logo-orb large" /><h1>AI Music Studio</h1><p>Your Bollywood favorites, playlists, and uploaded songs.</p></div>
      <a className="primary-btn hosted-signin" href="/signin-with-chatgpt?return_to=%2Fapp" target="_top">Sign in with ChatGPT</a>
      <Link className="hosted-signin" to="/app">Continue listening without an account</Link>
    </div></div>;
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <span className="logo-orb large" />
          <h1>AI Music Studio</h1>
          <p>Log in to your personalized recommendation workspace.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          <label htmlFor="login-email">
            <span>Email</span>
            <input
              type="email"
              id="login-email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label htmlFor="login-password">
            <span>Password</span>
            <input
              type="password"
              id="login-password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Log in'}
          </button>
        </form>
        <div className="auth-footer">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <div className="auth-footer">
          New here? <Link to="/register">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
