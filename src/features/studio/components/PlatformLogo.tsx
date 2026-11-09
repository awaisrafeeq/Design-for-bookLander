type Props = { platform: string; className?: string };

export function PlatformLogo({ platform, className = '' }: Props) {
  const key = platform.toLowerCase().replace(/[^a-z]/g, '');
  const icon = (() => {
    switch (key) {
      case 'facebook': case 'facebookmessenger': return <path d="M14.2 21v-8.1h2.7l.4-3.2h-3.1V7.6c0-.9.3-1.6 1.6-1.6h1.7V3.1a23 23 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3v2.4H8v3.2h2.8V21z"/>;
      case 'instagram': return <><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2.2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2.2"/><circle cx="17.4" cy="6.8" r="1.2"/></>;
      case 'tiktok': return <path d="M15.3 2.5c.2 2.3 1.5 3.7 3.8 3.9v3.3a8.5 8.5 0 0 1-3.8-1.1v5.6a5.6 5.6 0 1 1-5.5-5.6v3.4a2.2 2.2 0 1 0 2.2 2.2V2.5z"/>;
      case 'youtube': return <><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 8 6 4-6 4z" fill="#ff0033"/></>;
      case 'linkedin': return <><circle cx="5.4" cy="6" r="1.7"/><path d="M4 9h3v11H4zm6 0h3v1.5c.7-1 1.7-1.7 3.3-1.7 2.8 0 4 1.7 4 4.6V20h-3v-5.9c0-1.5-.5-2.4-1.8-2.4-1.6 0-2.5 1.2-2.5 2.8V20h-3z"/></>;
      case 'twitter': case 'x': return <path d="M4 3h3.8l12.3 18h-3.8zM20 3 4 21" fill="none" stroke="currentColor" strokeWidth="2.2"/>;
      case 'pinterest': return <path d="M12 2a10 10 0 0 0-3.6 19.3l1.2-5.1c-.3-.6-.5-1.3-.5-2.1 0-2 1.1-3.5 2.5-3.5 1.2 0 1.7.9 1.7 1.9 0 1.1-.7 2.7-1 4.2-.3 1.3.6 2.4 1.8 2.4 2.2 0 3.7-2.8 3.7-6.2 0-2.6-1.8-4.3-4.7-4.3-3.4 0-5.6 2.4-5.6 5.2 0 1 .3 1.9 1 2.5l-.6 2.5c-1.4-.7-2.2-2.5-2.2-4.5C5 6.3 8 3.5 12.5 3.5c4.3 0 7 2.9 7 6.4 0 4.6-2.5 8.1-6.2 8.1-1.2 0-2.4-.7-2.8-1.5l-.7 2.7A10 10 0 1 0 12 2z"/>;
      case 'whatsapp': return <><path d="M4.1 19.8 5 16.6A8.6 8.6 0 1 1 8 19.3z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M9 8c-.4-.8-1.1-.8-1.5-.3-1.3 1.7 1.2 3.9 3 5.8 2 2 4.2 2.9 5.8 1.8.5-.3.5-1.1-.2-1.5l-1.7-.9c-.4-.2-.7.2-1.1.7-.8-.2-2-1.3-2.4-2.1.4-.4.8-.7.6-1.1z"/></>;
      case 'telegram': return <path d="M21.4 3.4 2.8 10.6c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.9 5.8c.3.9.7 1.2 1.4.5l2.7-2.6 4.9 3.6c.9.5 1.5.2 1.7-.9l3.2-15.2c.3-1.3-.5-1.9-1.8-1.4ZM9 13.1l9.8-6.2-7.7 7.4-.4 3.4z"/>;
      case 'threads': return <><path d="M17.8 9.8C17.3 5.9 15 4 11.7 4 7.4 4 5 7.1 5 12s2.2 8 6.8 8c4.2 0 7.2-2.4 7.2-5.8 0-2.5-1.6-4.1-4.4-4.6-3.3-.6-5.6.5-5.6 2.7 0 1.5 1 2.4 2.6 2.4 2.3 0 3.7-1.7 3.6-4.3" fill="none" stroke="currentColor" strokeWidth="2.2"/></>;
      case 'slack': return <><rect x="9" y="2" width="3" height="9" rx="1.5"/><rect x="13" y="2" width="3" height="9" rx="1.5" transform="rotate(90 14.5 6.5)"/><rect x="12" y="13" width="3" height="9" rx="1.5"/><rect x="7" y="13" width="3" height="9" rx="1.5" transform="rotate(90 8.5 17.5)"/></>;
      case 'reddit': return <><circle cx="12" cy="13" r="7"/><circle cx="9" cy="12" r="1" fill="#ff4500"/><circle cx="15" cy="12" r="1" fill="#ff4500"/><path d="M9 16c2 1.5 4 1.5 6 0M12 6l1-3 3 1" fill="none" stroke="#ff4500" strokeWidth="1.5"/></>;
      case 'googleads': return <><path d="M8 19 15 5" fill="none" stroke="#4285f4" strokeWidth="5" strokeLinecap="round"/><path d="m15 5 6 12" fill="none" stroke="#fbbc04" strokeWidth="5" strokeLinecap="round"/><circle cx="5.6" cy="17" r="3" fill="#34a853"/></>;
      case 'googleanalytics': return <><rect x="3" y="14" width="4" height="7" rx="2" fill="#f9ab00"/><rect x="10" y="9" width="4" height="12" rx="2" fill="#f9ab00"/><rect x="17" y="3" width="4" height="18" rx="2" fill="#e37400"/></>;
      default: return <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2"/>;
    }
  })();
  return <span className={`platform-logo ${key} ${className}`.trim()} title={platform} role="img" aria-label={platform}><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">{icon}</svg></span>;
}
