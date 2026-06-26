import { useState } from "react";
import "./App.css";

function App() {
  const [tab, setTab] = useState("summary");

  const [data, setData] = useState({
    score: 8,
    summary:
      "This website requests your location, may share data with third parties, and stores information for a long time.",
    risks: [
      "Location Tracking",
      "Third-Party Sharing",
      "Long-Term Data Storage",
    ],
  });

  const analyzePolicy = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Sample privacy policy text",
        }),
      });

      const result = await response.json();

      setData({
        score: result.score,
        summary: result.summary,
        risks: result.risks,
      });
    } catch (error) {
      console.log(error);
    }
  };

  const risk =
    data.score <= 3
      ? "SAFE"
      : data.score <= 6
      ? "CAUTION"
      : "HIGH RISK";

  const progress = `${data.score * 10}%`;

  return (
    <div className="popup">

      <div className="header">

  <div>

    <h1>CONSENTGUARD AI</h1>

    <p className="subtitle">
      Privacy Intelligence Engine
    </p>

  </div>

  <div className="status">

    <span className="dot"></span>

    <div>

      <span className="status-title">
        SECURE
      </span>

      <small>
        Scan Active
      </small>

    </div>

  </div>

</div>

      <hr />

      <div className="threat">

  <p className="section-title">THREAT LEVEL</p>

  <h2>{data.score}/10</h2>

  <div className="confidence">
    AI Confidence 96%
  </div>

  <div className="threat-bar">
    {[1,2,3,4,5,6,7,8,9,10].map((n) => (
      <div
        key={n}
        className={`segment ${
          n <= data.score
            ? data.score <= 3
              ? "green"
              : data.score <= 6
              ? "yellow"
              : "red"
            : ""
        }`}
      ></div>
    ))}
  </div>

  <div className="risk-text">{risk}</div>

  <div className="extra-info">
    <span>Privacy Score: {data.score}/10</span>
    <span>Tracking Level: {data.score >= 7 ? "Severe" : data.score >= 4 ? "Moderate" : "Low"}</span>
  </div>

</div>

      <div className="tabs">

        <button
          className={tab === "summary" ? "selected" : ""}
          onClick={() => setTab("summary")}
        >
          Summary
        </button>

        <button
          className={tab === "risk" ? "selected" : ""}
          onClick={() => setTab("risk")}
        >
          Risks
        </button>

      </div>

      <div className="card">

        {tab === "summary" ? (
          <>
            <h3>🧠 AI SUMMARY</h3>

<p>{data.summary}</p>

<hr className="mini"/>

<div className="meta">

<div>

<strong>Detected</strong>

<p>3 Privacy Issues</p>

</div>

<div>

<strong>Confidence</strong>

<p>96%</p>

</div>

</div>
          </>
        ) : (
          <>
            <h3>SECURITY FLAGS</h3>

            {data.risks.map((risk, index) => (
              <div className="risk-item" key={index}>
                ⚠ {risk}
              </div>
            ))}
          </>
        )}

      </div>

      <div className="recommendation">

        <h3>RECOMMENDED ACTION</h3>

        <div className="actions">

<p>✓ Reject optional cookies</p>

<p>✓ Disable location access</p>

<p>✓ Block third-party tracking</p>

<p>✓ Review permissions before accepting</p>

</div>

      </div>

      <button className="scan-btn" onClick={analyzePolicy}>
        Scan Policy →
      </button>

      <button className="report-btn">
        View Full Report →
      </button>

    </div>
  );
}

export default App;