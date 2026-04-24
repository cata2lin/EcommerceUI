/**
 * Coming Soon Page — Placeholder for features under development.
 */
import './ComingSoon.css';

interface ComingSoonProps {
  title: string;
  description?: string;
  features?: string[];
}

export default function ComingSoon({ 
  title, 
  description = "This feature is currently under development and will be available soon.",
  features = []
}: ComingSoonProps) {
  return (
    <div className="coming-soon-page">
      <div className="coming-soon-container">
        <div className="coming-soon-icon">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        
        <div className="coming-soon-content">
          <h1 className="coming-soon-title">{title}</h1>
          <p className="coming-soon-description">{description}</p>
          
          {features.length > 0 && (
            <div className="coming-soon-features">
              <h3>Planned Features:</h3>
              <ul className="features-list">
                {features.map((feature, index) => (
                  <li key={index} className="feature-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="coming-soon-actions">
            <button className="btn-primary" onClick={() => window.history.back()}>
              Go Back
            </button>
            <button className="btn-secondary" onClick={() => window.location.href = '/'}>
              Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}