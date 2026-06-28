# consent-guard-ai
# 🛡️ ConsentGuard AI

> **Your privacy, decoded in seconds.**  
> A browser extension that intercepts privacy policies in real time, analyzes them using NLP, and delivers a plain-language risk summary — so you always know what you're agreeing to.

---

## 🚨 The Problem

Every time you sign up for a new service, you're handed a 10,000-word privacy policy written by lawyers, for lawyers. Nobody reads it. Companies know that.

Hidden inside those walls of text:
- Your data being sold to third parties
- Permanent retention of your personal information
- Waived rights you didn't know you had

**ConsentGuard AI fixes that.**

---

## ✨ What It Does

-  **Auto-detects** privacy policies on any website you visit
-  **Analyzes** the full text using NLP in real time
-  **Risk Score** — 0 to 100, color-coded (green / yellow / red)
-  **Plain-language summary** — what the policy actually says
-  **Flags dangerous clauses** — data selling, third-party sharing, no deletion rights, and more

---

## 🏗️ Project Structure

```
consentguard/
├── extension/          # Chrome browser extension (Frontend)
│   ├── manifest.json
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   └── background.js
│
├── backend/            # Flask + NLP Analysis Engine
│   ├── app.py
│   ├── analyzer.py
│   └── requirements.txt
│
└── README.md
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Browser Extension | JavaScript, Chrome Extension API (Manifest V3) |
| Backend | Python, Flask |
| NLP / AI Analysis | Claude API (Anthropic) |
| Risk Scoring | Custom clause detection logic |
| Version Control | Git + GitHub |

---

## 🚀 Getting Started

### Backend Setup
```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/consentguard.git
cd consentguard/backend

# Install dependencies
pip install -r requirements.txt

# Add your API key
export ANTHROPIC_API_KEY=your_key_here

# Run the server
python app.py
```

### Extension Setup
1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Pin ConsentGuard to your toolbar

---

## 👥 Team

| Member | Role |
|--------|------|
| Vaishnavi bhardwaj | Backend — NLP Analysis Engine & Flask API |
| Bhavika Bhati | Frontend — Browser Extension & UI |
| Shreya Singh | Integration, Testing & Demo |


---

## 📥 Installation (Developer Mode)

Since this extension isn't on the Chrome Web Store yet, follow these steps:

1. **Download the extension**
    -download the files name consentguard-ai and consentguard-backend 
   - Click the green **"Code"** button on this repo
   - Select **"Download ZIP"**
   - Extract the ZIP file on your computer

3. **Open Chrome Extensions**
   - Go to `chrome://extensions/` in your browser
   - Toggle ON **"Developer mode"** (top right corner)

4. **Load the extension**
   - Click **"Load unpacked"**
   - Select the extracted folder
   - ConsentGuard AI will appear in your extensions!

---

## 🚀 How to Use

1. Visit any website with a privacy policy
2. The extension **automatically detects** the policy
3. Click the ConsentGuard icon in your toolbar
4. View your **risk score (1–10)** and plain-English summary
5. Make an informed decision before accepting!

---

## 🔴 Risk Levels

| Score | Level | Meaning |
|-------|-------|---------|
| 1–3 | 🟢 Low | Safe to proceed |
| 4–5 | 🟡 Moderate | Read with caution |
| 6–8 | 🟠 High | Significant concerns |
| 9–10 | 🔴 Critical | Avoid if possible |

---

Built with ❤️ by Team Broken Trivia

## 🏆 Built For

**Confluence 2.0 Hackathon**

---

## 📄 License

MIT License — open for learning, not for misuse.
