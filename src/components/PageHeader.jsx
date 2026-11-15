import React from 'react';
import { Link } from 'react-router-dom';
import AuthControl from './AuthControl.jsx';
import NotificationBell from './NotificationBell.jsx';
import PresenceIndicator from './PresenceIndicator.jsx';

export default function PageHeader() {
  return <header className="ao-header">
    <div className="ao-header-inner">
      <Link to="/" className="ao-brand" aria-label="AniOrbit home"><span className="ao-wordmark">Ani<span>Orbit</span></span></Link>
      <nav className="ao-nav" aria-label="Main navigation">
        <Link to="/">Discover</Link>
        <Link to="/community">Community</Link>
        <Link to="/schedule">Schedule</Link>
        <Link to="/lists">My Lists</Link>
      </nav>
      <div className="ao-page-header-account"><PresenceIndicator/><NotificationBell/><AuthControl/></div>
    </div>
  </header>;
}
