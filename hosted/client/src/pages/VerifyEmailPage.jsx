import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

export default function VerifyEmailPage() {
  const {
    user,
    requestEmailVerification,
    verifyEmailToken,
    refreshProfile,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [loading, setLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devToken, setDevToken] = useState('');

  const runVerification = async (tokenValue) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = await verifyEmailToken(tokenValue);
      setSuccess(data.message || 'Email verified successfully.');
      await refreshProfile().catch(() => {});
      setTimeout(() => {
        navigate('/app', { replace: true });
      }, 700);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify email');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (!tokenFromUrl) {
      return;
    }

    setToken(tokenFromUrl);
    runVerification(tokenFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerifySubmit = async (event) => {
    event.preventDefault();
    if (!token.trim()) {
      setError('Verification token is required.');
      return;
    }

    await runVerification(token.trim());
  };

  const handleRequestVerification = async () => {
    setRequestLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = await requestEmailVerification();
      if (data.alreadyVerified) {
        setSuccess('Your email is already verified.');
      } else {
        setSuccess(data.message || 'Verification token generated.');
      }

      if (data.verification?.token) {
        setDevToken(data.verification.token);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request verification token');
    } finally {
      setRequestLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <span className="logo-orb large" />
          <h1>Verify your email</h1>
          <p>Keep your account recoverable and secure.</p>
        </div>

        {!!user?.isEmailVerified && (
          <div className="auth-success">Your email is already verified.</div>
        )}

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <form className="auth-form" onSubmit={handleVerifySubmit}>
          <label htmlFor="verify-token">
            <span>Verification token</span>
            <input
              id="verify-token"
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste token"
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify email'}
          </button>
        </form>

        {!!user && !user.isEmailVerified && (
          <button
            type="button"
            className="ghost-btn"
            onClick={handleRequestVerification}
            disabled={requestLoading}
          >
            {requestLoading ? 'Generating token...' : 'Request verification token'}
          </button>
        )}

        {devToken && (
          <div className="dev-token-box">
            <strong>Dev token:</strong>
            <code>{devToken}</code>
            <button type="button" className="ghost-btn" onClick={() => runVerification(devToken)}>
              Verify with this token
            </button>
          </div>
        )}

        <div className="auth-footer">
          Back to <Link to="/app">Home</Link>
        </div>
      </div>
    </div>
  );
}
