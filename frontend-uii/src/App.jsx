import { useState } from "react";
import "./App.css";

function App() {
  const [tab, setTab] = useState("summary");

  const [data, setData] = useState({
    score: 8,
    summary:
      "This website requests your location, may share data with third parties, and stores information for a long time.",
    risks: [
      "Privacy Risk Flag",
      "Data Collection",
      "Data Sharing",
      "User Rights",
    ],
  });

  const analyzePolicy = async () => {
    try {
      const response = await fetch(
        "http://localhost:5000/api/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: "Sample privacy policy text",
          }),
        }
      );

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
      ? "MEDIUM"
      : "HIGH DANGER";

  const ringColor =
    data.score <= 3
      ? "#22c55e"
      : data.score <= 6
      ? "#facc15"
      : "#ff3b6b";

  return (
    <div className="popup">

  {/* HEADER */}

  <div className="header">

    <div>

      <h1>
        <span className="logo">🛡</span>
        ConsentGuard-<span className="blue">AI</span>
      </h1>

    </div>

    <button className="setting-btn">
      ⚙
    </button>

  </div>

  {/* WEBSITE */}

  <div className="website">

    <span className="website-dot"></span>

    <span>
      www.cookieserve.com
    </span>

  </div>

  {/* RISK METER */}

  <div className="meter-section">

    <div className={`meter ${
      data.score <= 3
        ? "green"
        : data.score <= 6
        ? "yellow"
        : "red"
    }`}>

      <div className="meter-inner">

        <h2>
          {data.score}
          <small>/10</small>
        </h2>

      </div>

    </div>

    <div className="danger-pill">
  {data.score <= 3
    ? "SAFE"
    : data.score <= 6
    ? "MEDIUM"
    : "HIGH DANGER"}
</div>

</div>

{/* TABS */}

<div className="tabs">

  <button
    className={tab === "summary" ? "selected" : ""}
    onClick={() => setTab("summary")}
  >
    Smart Summary
  </button>

  <button
    className={tab === "risk" ? "selected" : ""}
    onClick={() => setTab("risk")}
  >
    Critical Flags
  </button>

</div>

{tab === "summary" ? (

<div className="card">

<h3>SMART SUMMARY</h3>

<p>{data.summary}</p>

</div>

) : (

<div className="card">

<h3>CRITICAL FLAGS</h3>

{data.risks.map((item,index)=>(

<div className="flag" key={index}>

<span>{item}</span>

<span className="badge">

HIGH

</span>

</div>

))}

</div>

)}

<div className="card">

<h3>PERMISSION INSIGHTS</h3>

<div className="permission">

<div>

<strong>Essential Cookies</strong>

<p>
Required to manage secure browser state.
</p>

</div>

<span className="required">
REQUIRED
</span>

</div>

</div>

<div className="card">

<h3>ACTIONABLE SAFEGUARDS</h3>

<div className="actions">

<p>✓ Reject optional cookies</p>

<p>✓ Disable location access</p>

<p>✓ Block third-party tracking</p>

<p>✓ Review permissions</p>

</div>

</div>

<div className="classification">

<strong>Classification: CRITICAL</strong>

<p>

Potential GDPR concerns detected due to excessive data collection.

</p>

</div>

</div>
);
}

export default App;