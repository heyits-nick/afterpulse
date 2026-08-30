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

## Two-minute demo

1. Click **Replay wearable episode**.
2. Narrate the elevated signal and recovery heuristic.
3. When recovery is detected, click **Call my iPhone**.
4. Answer the real call and give the concise BART example.
5. End on the automatically populated clinician card and its completeness score.

The first qualifying live call has already completed successfully. Its structured result is retained locally in `guava-agent/data/events.json` as an honest fallback and is ignored by Git.

## Positioning

- Say **possible physiological stress signal**, never **panic attack diagnosis**.
- Say **EHR-ready JSON**, never **production EHR integration**.
- The wearable data is a labeled deterministic replay.
- Patient-reported details are a draft for human clinician review.
