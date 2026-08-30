# AfterPulse

AfterPulse replays a synthetic wearable stress/recovery episode, places a real consented Guava check-in call, and turns the answers into a structured clinician-review record.

## Run the demo

Open two PowerShell terminals from this folder.

### 1. Start the dashboard

```powershell
npm run dev
```

Open <http://localhost:3000>.

### 2. Start the Guava bridge

```powershell
cd guava-agent
$env:GUAVA_AGENT_NUMBER="+14843362216"
$env:DEMO_PHONE_NUMBER="+1XXXXXXXXXX"
.\.venv\Scripts\python.exe main.py
```

The destination number stays in the terminal environment and is not committed to source.
