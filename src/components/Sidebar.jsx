'use client';

import React from 'react';
import styles from './Sidebar.module.css';
import {
  DashboardIcon,
  SendIcon,
  TemplateIcon,
  SettingsIcon,
  LogOutIcon,
  UserIcon,
  CampaignPulseLogoSymbol,
  BarChartIcon,
  GlobeIcon,
} from './Icons';

export default function Sidebar({ activeTab, setActiveTab, session, onLogout }) {
  const role = 'admin'; // All users have full admin privileges
  const canSend = true;

  const getRoleClass = (r) => {
    if (r === 'admin') return styles.roleAdmin;
    if (r === 'team_lead') return styles.roleTeamLead;
    return styles.roleManager;
  };

  const getRoleLabel = (r) => {
    if (r === 'admin') return 'Admin';
    if (r === 'team_lead') return 'Team Lead';
    return 'Manager';
  };

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <DashboardIcon size={17} />,
    },
    {
      id: 'sender',
      label: 'Send Emails',
      icon: <SendIcon size={17} />,
    },
    {
      id: 'campaigns',
      label: 'Mails tracker',
      icon: <BarChartIcon size={17} />,
    },
    {
      id: 'monitoring',
      label: 'Monthly Automation',
      icon: <GlobeIcon size={17} />,
      badge: 'Celery',
    },
    {
      id: 'templates',
      label: 'Email Templates',
      icon: <TemplateIcon size={17} />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <SettingsIcon size={17} />,
      badge: role === 'admin' ? 'Admin' : null,
    },
  ];

  return (
    <aside className={styles.sidebar}>
      {/* Brand Header */}
      <div className={styles.brandArea}>
        <div className={styles.brandRow}>
          <div className={styles.logoCircle}>
            <CampaignPulseLogoSymbol size={34} />
          </div>
          <div className={styles.brandMeta}>
            <span className={styles.brandTitle}>Campus Outreach</span>
            <span className={styles.brandSubtitle}>Email Automation</span>
          </div>
        </div>
      </div>

      {/* User Mini Profile Inset */}
      <div className={styles.profileInset}>
        <div className={styles.avatarWrap}>
          <UserIcon size={16} />
        </div>
        <div className={styles.profileMeta}>
          <span className={styles.profileEmail} title={session?.email || 'User'}>
            {session?.email?.split('@')[0] || 'Outreach Member'}
          </span>
          <div className={styles.profileBadges}>
            <span className={`${styles.rolePill} ${getRoleClass(role)}`}>
              {getRoleLabel(role)}
            </span>
            <span className={`${styles.sendPill} ${canSend ? styles.sendActive : styles.sendDisabled}`}>
              {canSend ? 'Send Ready' : 'View Only'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className={styles.navSection}>
        <div className={styles.navLabel}>Workspace Menu</div>
        <nav className={styles.navList}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className={styles.itemIcon}>{item.icon}</span>
                <span className={styles.itemLabel}>{item.label}</span>
                {item.badge && <span className={styles.roleTag}>{item.badge}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sign Out Pill Footer */}
      <div className={styles.footerSection}>
        <button
          type="button"
          className={styles.logoutBtn}
          onClick={onLogout}
          title="Sign out of Campus Email Automation Platform"
        >
          <LogOutIcon size={14} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
