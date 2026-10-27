'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';
import {
  MailIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  RefreshCwIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  CampaignPulseLogoSymbol,
  ArrowRightIcon,
} from '@/components/Icons.jsx';

// Accepted admin passwords for instant real-time verification while typing
const ACCEPTED_PASSWORDS = [
  'Shortfundly@2026',
  'ShortfundlyAdmin#2026',
  'ShortfundlyAdmin',
  'Shortfundly@Pass2026!',
];

export default function LoginPage() {
  const router = useRouter();

  // Field states
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isEmailValid, setIsEmailValid] = useState(false);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaNonce, setCaptchaNonce] = useState(1);

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState(null);
  const [capsLockActive, setCapsLockActive] = useState(false);

  // Field element refs for smooth auto-advancing focus
  const passwordInputRef = useRef(null);
  const captchaInputRef = useRef(null);

  useEffect(() => {
    setCaptchaNonce(Date.now());
    // Invalidate any residual session so login is required every time
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }, []);

  const refreshCaptcha = () => {
    setCaptchaNonce(Date.now());
    setCaptchaAnswer('');
  };

  const checkCapsLock = (e) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  // Real-time email validation while typing
  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    setGeneralError(null);

    if (!val) {
      setEmailError('');
      setIsEmailValid(false);
      return;
    }

    // 1. Error on Capital letters
    if (/[A-Z]/.test(val)) {
      setEmailError('Capital letters are not allowed in email. Use only lowercase letters.');
      setIsEmailValid(false);
      return;
    }

    // 2. Error on Numbers
    if (/[0-9]/.test(val)) {
      setEmailError('Numbers are not allowed in email. Use only lowercase letters.');
      setIsEmailValid(false);
      return;
    }

    // 3. Error on disallowed characters (spaces or special symbols other than @ and .)
    if (/[^a-z@.]/.test(val)) {
      setEmailError('Special characters and spaces are not allowed in email.');
      setIsEmailValid(false);
      return;
    }

    // 4. Must contain only a single @
    const atCount = (val.match(/@/g) || []).length;
    if (atCount > 1) {
      setEmailError('Email cannot contain multiple "@" symbols.');
      setIsEmailValid(false);
      return;
    }

    // 5. Must end with @gmail.com
    if (!val.endsWith('@gmail.com')) {
      setEmailError('Email must end with @gmail.com');
      setIsEmailValid(false);
      return;
    }

    // 6. Username prefix before @gmail.com must be non-empty and lowercase letters only
    const prefix = val.slice(0, -10); // length of '@gmail.com' is 10
    if (!prefix || prefix.length === 0) {
      setEmailError('Please enter your email prefix before @gmail.com');
      setIsEmailValid(false);
      return;
    }

    if (!/^[a-z]+$/.test(prefix)) {
      setEmailError('Email prefix must contain only lowercase letters (no dots or symbols).');
      setIsEmailValid(false);
      return;
    }

    // Valid email achieved!
    setEmailError('');
    setIsEmailValid(true);

    // Auto-advance focus to Password field if not already filled
    setTimeout(() => {
      if (passwordInputRef.current && !password) {
        passwordInputRef.current.focus();
      }
    }, 50);
  };

  // Real-time password validation while typing
  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    setGeneralError(null);

    if (!val) {
      setPasswordError('');
      setIsPasswordValid(false);
      return;
    }

    // Real-time check if typed password matches accepted system password
    const matches = ACCEPTED_PASSWORDS.includes(val);
    if (!matches) {
      setPasswordError('Wrong password. Please enter the correct password.');
      setIsPasswordValid(false);
      return;
    }

    // Correct password verified!
    setPasswordError('');
    setIsPasswordValid(true);

    // Auto-advance focus to Captcha verification field
    setTimeout(() => {
      if (captchaInputRef.current && !captchaAnswer) {
        captchaInputRef.current.focus();
      }
    }, 50);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError(null);

    if (!isEmailValid) {
      setGeneralError('Please enter a valid email address ending with @gmail.com (no capital letters or numbers).');
      return;
    }

    if (!isPasswordValid) {
      setGeneralError('Please enter the correct password.');
      return;
    }

    if (!captchaAnswer.trim()) {
      setGeneralError('Please enter the security verification code displayed below.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
          captcha_answer: captchaAnswer.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push('/dashboard');
        router.refresh();
      } else {
        let msg = data.error || 'Invalid email or password. Please try again.';
        if (capsLockActive) {
          msg += ' (Notice: Caps Lock is on. Passwords are case-sensitive.)';
        }
        setGeneralError(msg);
        refreshCaptcha();
      }
    } catch {
      setGeneralError('Network communication failed. Please check server connectivity.');
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authViewport}>
      <div className={styles.loginCard}>
        {/* Top Navigation */}
        <div className={styles.cardTopNav}>
          <Link href="/" className={styles.returnLink}>
            <span>&larr;</span> Back to Home
          </Link>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Secure Login</span>
        </div>

        {/* Brand Area */}
        <div className={styles.brandArea}>
          <div className={styles.logoIcon}>
            <CampaignPulseLogoSymbol size={44} />
          </div>
          <div className={styles.titleArea}>
            <h1 className={styles.brandTitle}>
              Campus <span className={styles.brandTeal}>Automation</span>
            </h1>
            <p className={styles.brandSubtitle}>
              Sign in to manage your campus email campaigns
            </p>
          </div>
        </div>

        {/* General Alerts */}
        {generalError && (
          <div className={styles.errorAlert} role="alert">
            <AlertCircleIcon size={16} className={styles.alertIcon} />
            <span>{generalError}</span>
          </div>
        )}

        {capsLockActive && (
          <div className={styles.capsLockAlert}>
            <LockIcon size={14} />
            <span>
              <strong>Caps Lock is Active:</strong> Passwords are case-sensitive.
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.formElement} noValidate>
          {/* Step 1: Email Address */}
          <div className={styles.fieldUnit}>
            <label className={styles.fieldLabel} htmlFor="email">
              <span className={`${styles.stepBadge} ${isEmailValid ? styles.stepBadgeCompleted : styles.stepBadgeActive}`}>
                {isEmailValid ? '✓' : '1'}
              </span>
              Email Address
            </label>
            <div className={styles.inputShell}>
              <span className={styles.inputPrefix}><MailIcon size={16} /></span>
              <input
                id="email"
                type="text"
                className={`${styles.textInput} ${isEmailValid ? styles.inputValid : emailError ? styles.inputInvalid : ''}`}
                placeholder="e.g. campus@gmail.com"
                value={email}
                onChange={handleEmailChange}
                onKeyDown={checkCapsLock}
                onKeyUp={checkCapsLock}
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            {/* Email Real-time Feedback */}
            {emailError && (
              <div className={styles.fieldError}>
                <AlertCircleIcon size={13} />
                <span>{emailError}</span>
              </div>
            )}
            {isEmailValid && (
              <div className={styles.fieldSuccess}>
                <CheckCircleIcon size={13} />
                <span>Valid Gmail address</span>
              </div>
            )}
          </div>

          {/* Step 2: Password (Unlocked only after Email is valid) */}
          <div className={styles.fieldUnit}>
            <div className={styles.labelBar}>
              <label className={styles.fieldLabel} htmlFor="password">
                <span className={`${styles.stepBadge} ${isPasswordValid ? styles.stepBadgeCompleted : isEmailValid ? styles.stepBadgeActive : ''}`}>
                  {isPasswordValid ? '✓' : '2'}
                </span>
                Password
              </label>
              {isEmailValid && (
                <button
                  type="button"
                  className={styles.toggleTextBtn}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              )}
            </div>

            <div className={styles.inputShell}>
              <span className={styles.inputPrefix}><LockIcon size={16} /></span>
              <input
                id="password"
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                className={`${styles.textInput} ${styles.inputWithToggle} ${
                  !isEmailValid ? styles.inputDisabled : isPasswordValid ? styles.inputValid : passwordError ? styles.inputInvalid : ''
                }`}
                placeholder={isEmailValid ? 'Enter your password' : 'Enter valid email first'}
                value={password}
                onChange={handlePasswordChange}
                onKeyDown={checkCapsLock}
                onKeyUp={checkCapsLock}
                autoComplete="current-password"
                disabled={!isEmailValid}
                required
              />
              {isEmailValid && (
                <button
                  type="button"
                  className={styles.eyeToggleBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              )}
            </div>

            {/* Password Real-time Feedback */}
            {!isEmailValid && (
              <div className={styles.fieldLockedNotice}>
                <LockIcon size={12} />
                <span>Fill out a valid email to unlock password field</span>
              </div>
            )}
            {isEmailValid && passwordError && (
              <div className={styles.fieldError}>
                <AlertCircleIcon size={13} />
                <span>{passwordError}</span>
              </div>
            )}
            {isPasswordValid && (
              <div className={styles.fieldSuccess}>
                <CheckCircleIcon size={13} />
                <span>Password verified</span>
              </div>
            )}
          </div>

          {/* Step 3: Security Challenge (CAPTCHA) (Unlocked only after Password is verified) */}
          <div className={`${styles.captchaPanel} ${!isPasswordValid ? styles.panelDisabled : ''}`}>
            <div className={styles.labelBar}>
              <label className={styles.fieldLabel} htmlFor="captcha">
                <span className={`${styles.stepBadge} ${captchaAnswer.trim() ? styles.stepBadgeCompleted : isPasswordValid ? styles.stepBadgeActive : ''}`}>
                  {captchaAnswer.trim() ? '✓' : '3'}
                </span>
                Security Verification
              </label>
              {isPasswordValid && (
                <span className={styles.captchaMeta}>Click image to refresh</span>
              )}
            </div>

            <div className={styles.captchaRow}>
              <img
                src={`/api/auth/captcha?format=image&v=${captchaNonce}`}
                alt="Security verification challenge"
                className={styles.captchaImage}
                width={160}
                height={44}
                onClick={isPasswordValid ? refreshCaptcha : undefined}
                title="Click image to generate new verification challenge"
              />

              <button
                type="button"
                className={styles.refreshBtn}
                onClick={refreshCaptcha}
                disabled={!isPasswordValid}
                title="Generate new verification code"
              >
                <RefreshCwIcon size={13} />
                <span>Refresh</span>
              </button>
            </div>

            <div className={styles.inputShell} style={{ marginTop: '4px' }}>
              <span className={styles.inputPrefix}><ShieldCheckIcon size={16} /></span>
              <input
                id="captcha"
                ref={captchaInputRef}
                type="text"
                className={`${styles.textInput} ${!isPasswordValid ? styles.inputDisabled : ''}`}
                placeholder={isPasswordValid ? 'Enter characters from image' : 'Verify password first'}
                value={captchaAnswer}
                onChange={(e) => {
                  setCaptchaAnswer(e.target.value);
                  if (generalError) setGeneralError(null);
                }}
                maxLength={8}
                autoComplete="off"
                disabled={!isPasswordValid}
                required
              />
            </div>

            {!isPasswordValid && (
              <div className={styles.fieldLockedNotice}>
                <LockIcon size={12} />
                <span>Enter correct password to unlock verification</span>
              </div>
            )}
          </div>

          {/* Step 4: Submit Button */}
          <button
            type="submit"
            className={styles.submitAction}
            disabled={!isEmailValid || !isPasswordValid || !captchaAnswer.trim() || loading}
          >
            {loading ? (
              <>
                <RefreshCwIcon size={16} className={styles.iconSpinner} />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRightIcon size={15} />
              </>
            )}
          </button>
        </form>

        {/* Security Footnote */}
        <div className={styles.cardFooter}>
          <ShieldCheckIcon size={14} className={styles.noteIcon} />
          <span>Encrypted session with real-time credential verification</span>
        </div>
      </div>
    </div>
  );
}
