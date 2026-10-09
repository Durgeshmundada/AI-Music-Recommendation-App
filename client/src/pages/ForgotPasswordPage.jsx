import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devToken, setDevToken] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setDevToken('');

    try {
      const data = await requestPasswordReset(email);
      setSuccess(data.message || 'If your email exists, a reset token was created.');
      if (data.reset?.token) {
        setDevToken(data.reset.token);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <span className="logo-orb large" />
          <h1>Reset password</h1>
          <p>Enter your email and we will generate a reset token.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <label htmlFor="forgot-email">
            <span>Email</span>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'Sending request...' : 'Send reset request'}
          </button>
        </form>

        {devToken && (
          <div className="dev-token-box">
            <strong>Dev token:</strong>
            <code>{devToken}</code>
            <Link to={`/reset-password?token=${encodeURIComponent(devToken)}`}>Open reset page</Link>
          </div>
        )}

        <div className="auth-footer">
          Back to <Link to="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
