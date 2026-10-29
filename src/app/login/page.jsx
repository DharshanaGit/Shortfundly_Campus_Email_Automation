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
  UserIcon,
} from '@/components/Icons.jsx';

// Accepted admin passwords for instant real-time verification while typing
const ACCEPTED_PASSWORDS = [
  'Shortfundly@2026',
  'ShortfundlyAdmin#2026',
  'Shortfundly@Pass2026!',
  'admin123',
];

export default function LoginPage() {
  const router = useRouter();

  // Mode: 'login' | 'register'
  const [mode, setMode] = useState('login');

  // Field states
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isEmailValid, setIsEmailValid] = useState(false);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Registration Confirm Password
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [isConfirmPasswordValid, setIsConfirmPasswordValid] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaNonce, setCaptchaNonce] = useState(1);

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [capsLockActive, setCapsLockActive] = useState(false);

  // Field element refs for smooth auto-advancing focus
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);
  const captchaInputRef = useRef(null);
  const submitBtnRef = useRef(null);
  const passwordCheckTimerRef = useRef(null);
  const passwordAdvanceTimerRef = useRef(null);
  const passwordAbortControllerRef = useRef(null);
  const verifySeqRef = useRef(0);
  const currentPasswordValRef = useRef('');

  useEffect(() => {
    setCaptchaNonce(Date.now());
    // Invalidate any residual session so login is required every time
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});

    return () => {
      if (passwordCheckTimerRef.current) clearTimeout(passwordCheckTimerRef.current);
      if (passwordAdvanceTimerRef.current) clearTimeout(passwordAdvanceTimerRef.current);
      if (passwordAbortControllerRef.current) passwordAbortControllerRef.current.abort();
    };
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

  // Switch between Login and Register modes
  const handleSwitchMode = (newMode) => {
    setMode(newMode);
    setGeneralError(null);
    setSuccessMessage(null);
    setPassword('');
    setPasswordError('');
    setIsPasswordValid(false);
    setConfirmPassword('');
    setConfirmPasswordError('');
    setIsConfirmPasswordValid(false);
    setCaptchaAnswer('');
    refreshCaptcha();

    if (passwordCheckTimerRef.current) {
      clearTimeout(passwordCheckTimerRef.current);
    }
    if (passwordAdvanceTimerRef.current) {
      clearTimeout(passwordAdvanceTimerRef.current);
    }
    if (passwordAbortControllerRef.current) {
      passwordAbortControllerRef.current.abort();
      passwordAbortControllerRef.current = null;
    }
    verifySeqRef.current += 1;
    currentPasswordValRef.current = '';

    // Re-validate existing email if present
    if (email) {
      validateEmail(email);
    }
  };

  // Core email validation logic: Numbers ALLOWED, NO Capital letters allowed, ends with @gmail.com
  const validateEmail = (val) => {
    if (!val) {
      setEmailError('');
      setIsEmailValid(false);
      return false;
    }

    // 1. Error on Capital letters (strictly forbidden)
    if (/[A-Z]/.test(val)) {
      setEmailError('Capital letters are not allowed in email. Use only lowercase letters and numbers.');
      setIsEmailValid(false);
      return false;
    }

    // 2. Error on disallowed characters (spaces or special symbols other than @, ., _, -)
    if (/[^a-z0-9@._-]/.test(val)) {
      setEmailError('Special characters and spaces are not allowed in email.');
      setIsEmailValid(false);
      return false;
    }

    // 3. Must contain only a single @
    const atCount = (val.match(/@/g) || []).length;
    if (atCount > 1) {
      setEmailError('Email cannot contain multiple "@" symbols.');
      setIsEmailValid(false);
      return false;
    }

    // 4. Must end with @gmail.com
    if (!val.endsWith('@gmail.com')) {
      setEmailError('Email must end with @gmail.com');
      setIsEmailValid(false);
      return false;
    }

    // 5. Username prefix before @gmail.com (lowercase letters and numbers allowed)
    const prefix = val.slice(0, -10);
    if (!prefix || prefix.length === 0) {
      setEmailError('Please enter your email prefix before @gmail.com');
      setIsEmailValid(false);
      return false;
    }

    if (!/^[a-z0-9._-]+$/.test(prefix)) {
      setEmailError('Email prefix must contain only lowercase letters and numbers.');
      setIsEmailValid(false);
      return false;
    }

    // Valid email achieved!
    setEmailError('');
    setIsEmailValid(true);
    return true;
  };

  // Real-time email validation while typing
  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    setGeneralError(null);
    setSuccessMessage(null);

    if (passwordAdvanceTimerRef.current) {
      clearTimeout(passwordAdvanceTimerRef.current);
    }

    // If email changes, re-evaluate password validity in login mode
    if (isPasswordValid && mode === 'login') {
      setIsPasswordValid(false);
      setPassword('');
      setPasswordError('');
    }

    const isValid = validateEmail(val);

    if (isValid) {
      setTimeout(() => {
        if (passwordInputRef.current && !password) {
          passwordInputRef.current.focus();
        }
      }, 100);
    }
  };

  // Real-time password validation while typing:
  // Show error when typing wrong password, only when password MATCHES move to next (Captcha)
  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    setGeneralError(null);
    setSuccessMessage(null);

    if (passwordCheckTimerRef.current) {
      clearTimeout(passwordCheckTimerRef.current);
    }
    if (passwordAdvanceTimerRef.current) {
      clearTimeout(passwordAdvanceTimerRef.current);
    }
    if (passwordAbortControllerRef.current) {
      passwordAbortControllerRef.current.abort();
      passwordAbortControllerRef.current = null;
    }
    verifySeqRef.current += 1;
    currentPasswordValRef.current = '';

    if (!val) {
      setPasswordError('');
      setIsPasswordValid(false);
      return;
    }

    if (mode === 'login') {
      const normalizedEmail = email.trim().toLowerCase();
      const trimmed = val.trim();
      let localUserPwd = null;
      try {
        localUserPwd = localStorage.getItem(`sf_user_pwd_${normalizedEmail}`);
      } catch {}

      // Instant match against accepted system passwords or cached registered user password
      const isInstantMatch =
        ACCEPTED_PASSWORDS.includes(val) ||
        ACCEPTED_PASSWORDS.includes(trimmed) ||
        (localUserPwd && (val === localUserPwd || trimmed === localUserPwd));

      if (isInstantMatch) {
        setPasswordError('');
        setIsPasswordValid(true);

        // When correct password entered: show correct and then move next
        passwordAdvanceTimerRef.current = setTimeout(() => {
          if (captchaInputRef.current) {
            captchaInputRef.current.focus();
          }
        }, 250);
        return;
      }

      // If not instant match, show error when wrong password
      setPasswordError('Wrong password. Please enter the correct password.');
      setIsPasswordValid(false);

      // Check database credentials with backend API (for registered users)
      if (trimmed.length >= 4) {
        const queryPassword = val;
        passwordCheckTimerRef.current = setTimeout(async () => {
          if (thisSeq !== verifySeqRef.current || currentPasswordValRef.current !== queryPassword) {
            return;
          }

          const controller = new AbortController();
          passwordAbortControllerRef.current = controller;

          try {
            const res = await fetch('/api/auth/verify-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: normalizedEmail, password: queryPassword }),
              signal: controller.signal,
            });
            const data = await res.json();

            // Strictly ensure input has not changed before updating validation state
            if (thisSeq === verifySeqRef.current && currentPasswordValRef.current === queryPassword) {
              if (data && data.matched) {
                setPasswordError('');
                setIsPasswordValid(true);

                passwordAdvanceTimerRef.current = setTimeout(() => {
                  if (captchaInputRef.current) {
                    captchaInputRef.current.focus();
                  }
                }, 250);
              } else {
                setPasswordError('Wrong password. Please enter the correct password.');
                setIsPasswordValid(false);
              }
            }
          } catch (err) {
            if (err.name !== 'AbortError' && thisSeq === verifySeqRef.current && currentPasswordValRef.current === queryPassword) {
              setPasswordError('Wrong password. Please enter the correct password.');
              setIsPasswordValid(false);
            }
          }
        }, 120);
      }
    } else {
      // Mode === 'register': Enforce password strength (minimum 8 characters)
      if (val.length < 8) {
        setPasswordError('Password must be at least 8 characters long.');
        setIsPasswordValid(false);
      } else {
        setPasswordError('');
        setIsPasswordValid(true);
      }

      // If confirm password already has a value, re-check match against new password
      if (confirmPassword) {
        if (confirmPassword !== val) {
          setConfirmPasswordError('Passwords do not match. Please ensure both passwords are identical.');
          setIsConfirmPasswordValid(false);
        } else {
          setConfirmPasswordError('');
          setIsConfirmPasswordValid(true);
        }
      }

      // Auto-advance focus to Confirm Password if password requirement is met (after pause)
      if (val.length >= 8) {
        passwordAdvanceTimerRef.current = setTimeout(() => {
          if (confirmPasswordInputRef.current && !confirmPassword) {
            confirmPasswordInputRef.current.focus();
          }
        }, 900);
      }
    }
  };

  const handlePasswordBlur = () => {
    if (mode === 'login' && password && !isPasswordValid) {
      setPasswordError('Wrong password. Please enter the correct password.');
    }
  };

  // Real-time confirm password validation (Register mode)
  const handleConfirmPasswordChange = (e) => {
    const val = e.target.value;
    setConfirmPassword(val);
    setGeneralError(null);
    setSuccessMessage(null);

    if (passwordAdvanceTimerRef.current) {
      clearTimeout(passwordAdvanceTimerRef.current);
    }

    if (!val) {
      setConfirmPasswordError('');
      setIsConfirmPasswordValid(false);
      return;
    }

    if (val !== password) {
      setConfirmPasswordError('Passwords do not match. Please ensure both passwords are identical.');
      setIsConfirmPasswordValid(false);
      return;
    }

    // Passwords match!
    setConfirmPasswordError('');
    setIsConfirmPasswordValid(true);

    // Auto-advance focus to Security Verification (CAPTCHA) after gentle pause
    passwordAdvanceTimerRef.current = setTimeout(() => {
      if (captchaInputRef.current && !captchaAnswer) {
        captchaInputRef.current.focus();
      }
    }, 900);
  };

  // Captcha input handler: when fully entered (5 chars), go to next (Submit Action button)
  const handleCaptchaChange = (e) => {
    const val = e.target.value.trim().toUpperCase();
    setCaptchaAnswer(val);
    if (generalError) setGeneralError(null);

    // When fully entered (challenge length is 5 characters), move focus to submit button
    if (val.length === 5) {
      setTimeout(() => {
        if (submitBtnRef.current) {
          submitBtnRef.current.focus();
        }
      }, 60);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError(null);
    setSuccessMessage(null);

    if (!isEmailValid) {
      setGeneralError('Please enter a valid email address ending with @gmail.com (no capital letters).');
      return;
    }

    if (!isPasswordValid) {
      if (mode === 'login') {
        setGeneralError('Please enter the correct matching password.');
      } else {
        setGeneralError('Password must be at least 8 characters long.');
      }
      return;
    }

    if (mode === 'register' && !isConfirmPasswordValid) {
      setGeneralError('Passwords do not match. Please ensure both passwords are identical.');
      return;
    }

    if (!captchaAnswer.trim()) {
      setGeneralError('Please enter the security verification code displayed below.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
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
    } else {
      // mode === 'register'
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password: password.trim(),
            confirm_password: confirmPassword.trim(),
            captcha_answer: captchaAnswer.trim(),
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          // Cache password locally for convenient access
          try {
            localStorage.setItem(`sf_user_pwd_${email.trim().toLowerCase()}`, password.trim());
          } catch {}

          setSuccessMessage('Account created successfully! Logging you into dashboard...');
          setTimeout(() => {
            router.push('/dashboard');
            router.refresh();
          }, 800);
        } else {
          setGeneralError(data.error || 'Account registration failed. Please try again.');
          refreshCaptcha();
        }
      } catch {
        setGeneralError('Network communication failed. Please check server connectivity.');
        refreshCaptcha();
      } finally {
        setLoading(false);
      }
    }
  };

  const isFormSubmittable =
    mode === 'login'
      ? isEmailValid && isPasswordValid && captchaAnswer.trim().length === 5 && !loading
      : isEmailValid && isPasswordValid && isConfirmPasswordValid && captchaAnswer.trim().length === 5 && !loading;

  return (
    <div className={styles.authViewport}>
      <div className={styles.loginCard}>
        {/* Top Navigation */}
        <div className={styles.cardTopNav}>
          <Link href="/" className={styles.returnLink}>
            <span>&larr;</span> Back to Home
          </Link>
          <span className={styles.securityBadge}>
            <ShieldCheckIcon size={12} />
            <span>{mode === 'login' ? 'Verified Gateway' : 'New Registration'}</span>
          </span>
        </div>

        {/* Brand Area */}
        <div className={styles.brandArea}>
          <div className={styles.logoIcon}>
            <CampaignPulseLogoSymbol size={46} />
          </div>
          <div className={styles.titleArea}>
            <h1 className={styles.brandTitle}>
              Campus <span className={styles.brandTeal}>Automation</span>
            </h1>
            <p className={styles.brandSubtitle}>
              {mode === 'login'
                ? 'Sign in to access collegiate outreach intelligence'
                : 'Create an account to manage campus outreach campaigns'}
            </p>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className={styles.modeTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`${styles.tabBtn} ${mode === 'login' ? styles.tabBtnActive : ''}`}
            onClick={() => handleSwitchMode('login')}
          >
            <LockIcon size={14} />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`${styles.tabBtn} ${mode === 'register' ? styles.tabBtnActive : ''}`}
            onClick={() => handleSwitchMode('register')}
          >
            <UserIcon size={14} />
            <span>Create New Account</span>
          </button>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className={styles.successAlert} role="status">
            <CheckCircleIcon size={16} />
            <span>{successMessage}</span>
          </div>
        )}

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
              <span
                className={`${styles.stepBadge} ${
                  isEmailValid ? styles.stepBadgeCompleted : styles.stepBadgeActive
                }`}
              >
                {isEmailValid ? '✓' : '1'}
              </span>
              <span>Email Address</span>
              <span className={styles.fieldRuleHint}>Lowercase &amp; numbers allowed &bull; @gmail.com</span>
            </label>
            <div className={styles.inputShell}>
              <span className={styles.inputPrefix}>
                <MailIcon size={16} />
              </span>
              <input
                id="email"
                ref={emailInputRef}
                type="text"
                className={`${styles.textInput} ${
                  isEmailValid ? styles.inputValid : emailError ? styles.inputInvalid : ''
                }`}
                placeholder="e.g. dachudharshana17@gmail.com"
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
                <span
                  className={`${styles.stepBadge} ${
                    isPasswordValid
                      ? styles.stepBadgeCompleted
                      : isEmailValid
                      ? styles.stepBadgeActive
                      : ''
                  }`}
                >
                  {isPasswordValid ? '✓' : '2'}
                </span>
                <span>{mode === 'login' ? 'Password' : 'Create Password'}</span>
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
              <span className={styles.inputPrefix}>
                <LockIcon size={16} />
              </span>
              <input
                id="password"
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                className={`${styles.textInput} ${styles.inputWithToggle} ${
                  !isEmailValid
                    ? styles.inputDisabled
                    : isPasswordValid
                    ? styles.inputValid
                    : passwordError
                    ? styles.inputInvalid
                    : ''
                }`}
                placeholder={
                  isEmailValid
                    ? mode === 'login'
                      ? 'Enter your password'
                      : 'At least 8 characters'
                    : 'Enter valid email first'
                }
                value={password}
                onChange={handlePasswordChange}
                onBlur={handlePasswordBlur}
                onKeyDown={(e) => {
                  checkCapsLock(e);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (isPasswordValid) {
                      if (passwordAdvanceTimerRef.current) clearTimeout(passwordAdvanceTimerRef.current);
                      if (mode === 'login' && captchaInputRef.current) {
                        captchaInputRef.current.focus();
                      } else if (mode === 'register' && confirmPasswordInputRef.current) {
                        confirmPasswordInputRef.current.focus();
                      }
                    }
                  }
                }}
                onKeyUp={checkCapsLock}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
                <span>Fill out valid email to unlock password field</span>
              </div>
            )}
            {isEmailValid && passwordError && (
              <div className={styles.fieldError}>
                <AlertCircleIcon size={13} />
                <span>{passwordError}</span>
              </div>
            )}
            {isPasswordValid && (
              <div className={styles.passwordVerifiedRow}>
                <div className={styles.fieldSuccess}>
                  <CheckCircleIcon size={13} />
                  <span>
                    {mode === 'login'
                      ? 'Correct password ✓'
                      : 'Password meets requirement (8+ characters)'}
                  </span>
                </div>
                {mode === 'login' && (
                  <button
                    type="button"
                    className={styles.confirmNextBtn}
                    onClick={() => {
                      if (passwordAdvanceTimerRef.current) clearTimeout(passwordAdvanceTimerRef.current);
                      if (captchaInputRef.current) captchaInputRef.current.focus();
                    }}
                  >
                    <span>Proceed to Captcha</span>
                    <ArrowRightIcon size={12} />
                  </button>
                )}
                {mode === 'register' && (
                  <button
                    type="button"
                    className={styles.confirmNextBtn}
                    onClick={() => {
                      if (passwordAdvanceTimerRef.current) clearTimeout(passwordAdvanceTimerRef.current);
                      if (confirmPasswordInputRef.current) confirmPasswordInputRef.current.focus();
                    }}
                  >
                    <span>Confirm Password</span>
                    <ArrowRightIcon size={12} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Step 3 (Register Mode Only): Confirm Password */}
          {mode === 'register' && (
            <div className={styles.fieldUnit}>
              <div className={styles.labelBar}>
                <label className={styles.fieldLabel} htmlFor="confirmPassword">
                  <span
                    className={`${styles.stepBadge} ${
                      isConfirmPasswordValid
                        ? styles.stepBadgeCompleted
                        : isPasswordValid
                        ? styles.stepBadgeActive
                        : ''
                    }`}
                  >
                    {isConfirmPasswordValid ? '✓' : '3'}
                  </span>
                  <span>Confirm Password</span>
                </label>
                {isPasswordValid && (
                  <button
                    type="button"
                    className={styles.toggleTextBtn}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>

              <div className={styles.inputShell}>
                <span className={styles.inputPrefix}>
                  <LockIcon size={16} />
                </span>
                <input
                  id="confirmPassword"
                  ref={confirmPasswordInputRef}
                  type={showConfirmPassword ? 'text' : 'password'}
                  className={`${styles.textInput} ${styles.inputWithToggle} ${
                    !isPasswordValid
                      ? styles.inputDisabled
                      : isConfirmPasswordValid
                      ? styles.inputValid
                      : confirmPasswordError
                      ? styles.inputInvalid
                      : ''
                  }`}
                  placeholder={
                    isPasswordValid ? 'Re-enter identical password' : 'Enter valid password first'
                  }
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  onKeyDown={(e) => {
                    checkCapsLock(e);
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (isConfirmPasswordValid) {
                        if (passwordAdvanceTimerRef.current) clearTimeout(passwordAdvanceTimerRef.current);
                        if (captchaInputRef.current) captchaInputRef.current.focus();
                      }
                    }
                  }}
                  onKeyUp={checkCapsLock}
                  autoComplete="new-password"
                  disabled={!isPasswordValid}
                  required
                />
                {isPasswordValid && (
                  <button
                    type="button"
                    className={styles.eyeToggleBtn}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                )}
              </div>

              {/* Confirm Password Feedback */}
              {!isPasswordValid && (
                <div className={styles.fieldLockedNotice}>
                  <LockIcon size={12} />
                  <span>Enter password first to unlock confirmation</span>
                </div>
              )}
              {isPasswordValid && confirmPasswordError && (
                <div className={styles.fieldError}>
                  <AlertCircleIcon size={13} />
                  <span>{confirmPasswordError}</span>
                </div>
              )}
              {isConfirmPasswordValid && (
                <div className={styles.passwordVerifiedRow}>
                  <div className={styles.fieldSuccess}>
                    <CheckCircleIcon size={13} />
                    <span>Passwords match perfectly ✓</span>
                  </div>
                  <button
                    type="button"
                    className={styles.confirmNextBtn}
                    onClick={() => {
                      if (passwordAdvanceTimerRef.current) clearTimeout(passwordAdvanceTimerRef.current);
                      if (captchaInputRef.current) captchaInputRef.current.focus();
                    }}
                  >
                    <span>Proceed to Captcha</span>
                    <ArrowRightIcon size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Security Challenge (CAPTCHA) */}
          {/* In Login mode: Step 3. In Register mode: Step 4 */}
          {(() => {
            const isUnlocked = mode === 'login' ? isPasswordValid : (isPasswordValid && isConfirmPasswordValid);
            const stepNum = mode === 'login' ? '3' : '4';
            const isCompleted = captchaAnswer.trim().length === 5;

            return (
              <div
                className={`${styles.captchaPanel} ${!isUnlocked ? styles.panelDisabled : ''}`}
              >
                <div className={styles.labelBar}>
                  <label className={styles.fieldLabel} htmlFor="captcha">
                    <span
                      className={`${styles.stepBadge} ${
                        isCompleted
                          ? styles.stepBadgeCompleted
                          : isUnlocked
                          ? styles.stepBadgeActive
                          : ''
                      }`}
                    >
                      {isCompleted ? '✓' : stepNum}
                    </span>
                    <span>Security Verification</span>
                  </label>
                  {isUnlocked && (
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
                    onClick={isUnlocked ? refreshCaptcha : undefined}
                    title="Click image to generate new verification challenge"
                  />

                  <button
                    type="button"
                    className={styles.refreshBtn}
                    onClick={refreshCaptcha}
                    disabled={!isUnlocked}
                    title="Generate new verification code"
                  >
                    <RefreshCwIcon size={13} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className={styles.inputShell} style={{ marginTop: '4px' }}>
                  <span className={styles.inputPrefix}>
                    <ShieldCheckIcon size={16} />
                  </span>
                  <input
                    id="captcha"
                    ref={captchaInputRef}
                    type="text"
                    className={`${styles.textInput} ${!isUnlocked ? styles.inputDisabled : ''}`}
                    placeholder={
                      isUnlocked
                        ? 'Enter characters from image'
                        : mode === 'login'
                        ? 'Match password to unlock verification'
                        : 'Confirm password first'
                    }
                    value={captchaAnswer}
                    onChange={handleCaptchaChange}
                    maxLength={5}
                    autoComplete="off"
                    disabled={!isUnlocked}
                    required
                  />
                </div>

                {!isUnlocked && (
                  <div className={styles.fieldLockedNotice}>
                    <LockIcon size={12} />
                    <span>
                      {mode === 'login'
                        ? 'Enter correct password to unlock verification'
                        : 'Ensure passwords match to unlock verification'}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Submit Action Button */}
          <button
            ref={submitBtnRef}
            type="submit"
            className={styles.submitAction}
            disabled={!isFormSubmittable}
          >
            {loading ? (
              <>
                <RefreshCwIcon size={16} className={styles.iconSpinner} />
                <span>
                  {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
                </span>
              </>
            ) : (
              <>
                <span>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </span>
                <ArrowRightIcon size={15} />
              </>
            )}
          </button>
        </form>

        {/* Switch Mode Footer Link */}
        <div className={styles.switchModeBar}>
          <span>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button
            type="button"
            className={styles.switchModeLink}
            onClick={() => handleSwitchMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Create New Account' : 'Sign In'}
          </button>
        </div>

        {/* Security Footnote */}
        <div className={styles.cardFooter}>
          <ShieldCheckIcon size={14} className={styles.noteIcon} />
          <span>Encrypted cryptographic session with database credential verification</span>
        </div>
      </div>
    </div>
  );
}
