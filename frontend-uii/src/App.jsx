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
    "Long-Term Data Storage"
  ]
});
const analyzePolicy = async () => {

  try {

    const response = await fetch(
      "http://localhost:5000/api/analyze",
      {
        method:"POST",

        headers:{
          "Content-Type":"application/json"
        },

        body: JSON.stringify({
          text:"Sample privacy policy text"
        })
      }
    );


    const result = await response.json();


    setData({
      score: result.score,
      summary: result.summary,
      risks: result.risks
    });


  } catch(error){

    console.log(error);

  }

};


  const risk =
    data.score <= 3
      ? "SAFE"
      : data.score <= 6
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

          <strong>{data.score}</strong>
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
          {data.summary}
          </p>
          </>


        ) : (

          <>
          <h4>⚠ Detected Issues</h4>

          {
data.risks.map((item,index)=>(
<p key={index}>
⚠ {item}
</p>
))
}
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




      <button onClick={analyzePolicy} className="main-btn">
  Scan Policy
</button>
      <button className="main-btn">
        View Full Report
      </button>



    </div>

  );
}


export default App;