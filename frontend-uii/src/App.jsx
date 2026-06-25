import "./App.css";

function App() {
  const riskScore = 8;

  return (
    <div className="popup">
      <div className="header">
        <h2>🛡️ ConsentGuard AI</h2>
        <span className="active">● Active Scan</span>
      </div>

      <div className="risk-section">
        <p>Risk Score</p>
        <div className="risk-circle">
          {riskScore}/10
        </div>
        <h3>HIGH RISK</h3>
      </div>

      <div className="risks">
        <h4>Flagged Risks</h4>

        <p>⚠ Location Tracking</p>
        <p>⚠ Third-Party Sharing</p>
        <p>⚠ Long-Term Data Storage</p>
      </div>

      <div className="recommendation">
        <h4>Recommendation</h4>

        <p>
          Reject optional cookies and
          disable unnecessary permissions.
        </p>
      </div>

      <button>
        View Full Report
      </button>
    </div>
  );
}

export default App;