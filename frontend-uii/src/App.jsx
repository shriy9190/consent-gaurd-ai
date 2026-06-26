import { useState } from "react";
import "./App.css";

function App() {

  const [tab, setTab] = useState("summary");

  const riskScore = 8;


  const risk =
    riskScore <= 3
      ? "SAFE"
      : riskScore <= 6
      ? "CAUTION"
      : "HIGH RISK";


  return (

    <div className="popup">


      <div className="header">

        <h2>
          🛡️ ConsentGuard AI
        </h2>

        <span className="active">
          <span>●</span> Active Scan
        </span>

      </div>



      <div className={`risk-section ${risk}`}>

        <p>Privacy Risk Score</p>


        <div className="risk-circle">

          <strong>{riskScore}</strong>
          <small>/10</small>

        </div>


        <h3>{risk}</h3>

      </div>




      <div className="tabs">

        <button
        className={tab==="summary"?"selected":""}
        onClick={()=>setTab("summary")}
        >
          Smart Summary
        </button>


        <button
        className={tab==="risk"?"selected":""}
        onClick={()=>setTab("risk")}
        >
          Flagged Risks
        </button>

      </div>





      <div className="card">


      {
        tab==="summary" ? (

          <>
          <h4>🧠 AI Summary</h4>

          <p>
          This website requests your location,
          may share data with third parties,
          and stores information for a long time.
          </p>
          </>


        ) : (

          <>
          <h4>⚠ Detected Issues</h4>

          <p>⚠ Location Tracking</p>
          <p>⚠ Third-Party Sharing</p>
          <p>⚠ Long-Term Data Storage</p>

          </>

        )
      }


      </div>




      <div className="recommendation">

        💡 <b>Recommendation</b>

        <p>
        Reject optional cookies and
        disable unnecessary permissions.
        </p>

      </div>




      <button className="main-btn">
        View Full Report
      </button>



    </div>

  );
}


export default App;