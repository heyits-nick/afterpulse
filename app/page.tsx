'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  Clock3,
  Download,
  HeartPulse,
  Phone,
  RefreshCw,
  ShieldCheck,
  Watch,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const API_BASE = 'http://localhost:8788';

const REPLAY = [
  { hr: 72, hrv: 54, stage: 'baseline' },
  { hr: 73, hrv: 52, stage: 'baseline' },
  { hr: 75, hrv: 51, stage: 'baseline' },
  { hr: 84, hrv: 45, stage: 'rising' },
  { hr: 101, hrv: 34, stage: 'elevated' },
  { hr: 116, hrv: 25, stage: 'elevated' },
  { hr: 124, hrv: 19, stage: 'elevated' },
  { hr: 121, hrv: 21, stage: 'elevated' },
  { hr: 109, hrv: 28, stage: 'recovering' },
  { hr: 98, hrv: 34, stage: 'recovering' },
  { hr: 90, hrv: 39, stage: 'recovering' },
  { hr: 84, hrv: 44, stage: 'recovering' },
  { hr: 79, hrv: 48, stage: 'recovered' },
  { hr: 76, hrv: 51, stage: 'recovered' },
  { hr: 74, hrv: 53, stage: 'recovered' },
] as const;

type DemoPhase =
  | 'idle'
  | 'replaying'
  | 'ready'
  | 'calling'
  | 'in_call'
  | 'processing'
  | 'completed'
  | 'error';

type EventRecord = {
  id: string;
  recorded_at: string;
  termination_reason: string;
  biometrics: {
    source: string;
    baseline_hr: number;
    max_hr: number;
    baseline_hrv: number;
    min_hrv: number;
    motion: string;
    recovery_seconds: number;
  };
  answers: {
    trigger_context: string | null;
    symptoms: string | null;
    peak_intensity: number | null;
    current_intensity: number | null;
    what_helped: string | null;
    follow_up_requested: string | null;
  };
  completeness: { answered: number; total: number };
  review_status: string;
};

type BridgeState = {
  status: string;
  message: string;
  latest_event: EventRecord | null;
};

const SAMPLE_EVENT: EventRecord = {
  id: 'sample-event',
  recorded_at: new Date().toISOString(),
  termination_reason: 'demo-preview',
  biometrics: {
    source: 'Galaxy Watch4 synthetic replay',
    baseline_hr: 72,
    max_hr: 124,
    baseline_hrv: 54,
    min_hrv: 19,
    motion: 'low',
    recovery_seconds: 252,
  },
  answers: {
    trigger_context: 'Crowded BART train',
    symptoms: 'Racing heart, chest tightness, and dizziness',
    peak_intensity: 8,
    current_intensity: 3,
    what_helped: 'Stepped outside and slowed breathing',
    follow_up_requested: 'yes',
  },
  completeness: { answered: 6, total: 6 },
  review_status: 'clinician_review_required',
};

export default function Home() {
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [replayIndex, setReplayIndex] = useState(0);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState('Checking local agent bridge');
  const [eventRecord, setEventRecord] = useState<EventRecord | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef<number | null>(null);

  const reading = REPLAY[replayIndex];
  const visibleReplay = REPLAY.slice(0, replayIndex + 1);
  const signalStage = phase === 'idle' ? 'baseline' : reading.stage;
  const hrPath = linePath(visibleReplay.map((point) => point.hr), 65, 130);
  const hrvPath = linePath(visibleReplay.map((point) => point.hrv), 15, 60);

  useEffect(() => {
    let mounted = true;

    async function pollBridge() {
      try {
        const response = await fetch(`${API_BASE}/state`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Agent bridge unavailable');
        const bridge = (await response.json()) as BridgeState;
        if (!mounted) return;

        setBridgeOnline(true);
        setBridgeMessage(bridge.message);
        if (bridge.status === 'dialing') setPhase('calling');
        if (bridge.status === 'in_call') setPhase('in_call');
        if (bridge.status === 'processing') setPhase('processing');
        if (bridge.status === 'completed' && bridge.latest_event) {
          setEventRecord(bridge.latest_event);
          setPhase('completed');
        }
        if (bridge.status === 'failed') {
          setError(bridge.message);
          setPhase('error');
        }
      } catch {
        if (!mounted) return;
        setBridgeOnline(false);
        setBridgeMessage('Local agent bridge offline');
      }
    }

    void pollBridge();
    const poller = window.setInterval(pollBridge, 1000);
    return () => {
      mounted = false;
      window.clearInterval(poller);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  async function resetDemo() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    setPhase('idle');
    setReplayIndex(0);
    setEventRecord(null);
    setError('');
    try {
      await fetch(`${API_BASE}/reset`, { method: 'POST' });
    } catch {
      // Resetting the visual demo still works when the local bridge is offline.
    }
  }

  function startReplay() {
    void resetDemo();
    setPhase('replaying');
    let nextIndex = 0;
    timerRef.current = window.setInterval(() => {
      nextIndex += 1;
      setReplayIndex(nextIndex);
      if (nextIndex >= REPLAY.length - 1) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setPhase('ready');
      }
    }, 620);
  }

  async function startCall() {
    setError('');
    setPhase('calling');
    try {
      const response = await fetch(`${API_BASE}/call`, { method: 'POST' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to start call');
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : 'Unable to start call');
      setPhase('error');
    }
  }

  function previewRecord() {
    setEventRecord({ ...SAMPLE_EVENT, recorded_at: new Date().toISOString() });
    setPhase('completed');
  }

  function downloadRecord() {
    if (!eventRecord) return;
    const blob = new Blob([JSON.stringify(eventRecord, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `afterpulse-${eventRecord.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <HeartPulse className="size-5" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-[-0.03em]">AfterPulse</p>
              <p className="text-xs text-muted-foreground">Post-event care, while the memory is fresh</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-emerald-200 bg-emerald-50 text-emerald-800 sm:inline-flex">
              <ShieldCheck data-icon="inline-start" />
              Wellness demo · Not diagnostic
            </Badge>
            <Badge
              variant="outline"
              className={bridgeOnline
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'}
            >
              {bridgeOnline ? <Wifi data-icon="inline-start" /> : <WifiOff data-icon="inline-start" />}
              {bridgeOnline ? 'Guava bridge ready' : 'UI preview mode'}
            </Badge>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1480px] px-5 py-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Live care loop
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              From physiological signal to clinician context.
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <p aria-live="polite" className="max-w-sm text-right text-sm text-muted-foreground">
              {bridgeMessage}
            </p>
            {phase !== 'idle' && (
              <Button variant="outline" size="sm" onClick={() => void resetDemo()}>
                <RefreshCw data-icon="inline-start" /> Reset
              </Button>
            )}
          </div>
        </div>

        <StageRail phase={phase} />

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <Card className="border border-border/80 shadow-[0_18px_60px_-40px_rgba(11,67,54,0.5)] ring-0">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Watch className="size-5 text-emerald-700" />
                Patient wearable stream
              </CardTitle>
              <CardDescription>Galaxy Watch4 · Deterministic synthetic replay</CardDescription>
              <CardAction>
                <SignalBadge stage={signalStage} />
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Heart rate" value={String(reading.hr)} unit="BPM" icon={<HeartPulse />} emphasis={reading.hr >= 100} />
                <Metric label="HRV" value={String(reading.hrv)} unit="MS" icon={<Activity />} emphasis={reading.hrv <= 28} />
                <Metric label="Motion" value="Low" unit="NO WORKOUT" icon={<Watch />} />
              </div>

              <div className="rounded-2xl border border-border/70 bg-[#f7faf8] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Physiological trend</p>
                    <p className="text-xs text-muted-foreground">Compressed 12-minute episode replay</p>
                  </div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#e66a58]" /> Heart rate</span>
                    <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#14866d]" /> HRV</span>
                  </div>
                </div>
                <svg viewBox="0 0 720 220" role="img" aria-label="Simulated heart rate and heart rate variability chart" className="h-[220px] w-full overflow-visible">
                  <rect x="205" y="10" width="210" height="194" rx="14" fill="#e66a58" opacity="0.055" />
                  {[42, 84, 126, 168, 204].map((y) => (
                    <line key={y} x1="12" x2="708" y1={y} y2={y} stroke="#dce7e1" strokeDasharray="4 6" />
                  ))}
                  <path d={hrPath} fill="none" stroke="#e66a58" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500" />
                  <path d={hrvPath} fill="none" stroke="#14866d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500" />
                  <circle cx={lastX(visibleReplay.length)} cy={valueY(reading.hr, 65, 130)} r="5" fill="#e66a58" stroke="white" strokeWidth="3" />
                  <circle cx={lastX(visibleReplay.length)} cy={valueY(reading.hrv, 15, 60)} r="5" fill="#14866d" stroke="white" strokeWidth="3" />
                  <text x="220" y="30" fill="#a34b40" fontSize="11" fontWeight="600">ELEVATED SIGNAL</text>
                  <text x="12" y="218" fill="#73827c" fontSize="10">12 min ago</text>
                  <text x="670" y="218" fill="#73827c" fontSize="10">now</text>
                </svg>
              </div>

              <PatientAction
                phase={phase}
                error={error}
                bridgeOnline={bridgeOnline}
                onReplay={startReplay}
                onCall={() => void startCall()}
              />
            </CardContent>
          </Card>

          <ClinicianCard
            phase={phase}
            record={eventRecord}
            onPreview={previewRecord}
            onDownload={downloadRecord}
          />
        </div>
      </section>
    </main>
  );
}

function PatientAction({
  phase,
  error,
  bridgeOnline,
  onReplay,
  onCall,
}: {
  phase: DemoPhase;
  error: string;
  bridgeOnline: boolean;
  onReplay: () => void;
  onCall: () => void;
}) {
  if (phase === 'ready') {
    return (
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="flex items-center gap-2 font-medium text-emerald-950"><Check className="size-4" /> Recovery detected</p>
          <p className="mt-1 text-sm text-emerald-800/75">The patient has opted in to a one-minute post-event check-in.</p>
        </div>
        <Button size="lg" className="h-11 px-4" onClick={onCall} disabled={!bridgeOnline}>
          <Phone data-icon="inline-start" /> Call my iPhone
        </Button>
      </div>
    );
  }

  if (phase === 'calling' || phase === 'in_call' || phase === 'processing') {
    const copy = phase === 'calling'
      ? ['Calling the consented iPhone', 'The real Guava call should ring in a few seconds.']
      : phase === 'in_call'
        ? ['Check-in in progress', 'Maya is collecting the six clinician-review fields.']
        : ['Structuring clinician record', 'The call is complete; responses are being saved.'];
    return (
      <div className="flex items-center gap-4 rounded-2xl bg-[#112a24] p-5 text-white">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400/15">
          <Phone className="size-5 text-emerald-300" />
          <i className="absolute inset-0 animate-ping rounded-full border border-emerald-300/50" />
        </span>
        <div>
          <p className="font-medium">{copy[0]}</p>
          <p className="mt-1 text-sm text-emerald-100/70">{copy[1]}</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="flex items-center gap-2 font-medium text-red-900"><AlertCircle className="size-4" /> Check-in could not start</p>
          <p className="mt-1 max-w-xl text-sm text-red-800/75">{error || 'Check the local Guava bridge and try again.'}</p>
        </div>
        <Button variant="outline" onClick={onCall}>Retry call</Button>
      </div>
    );
  }

  if (phase === 'completed') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
        <span className="grid size-9 place-items-center rounded-full bg-emerald-700 text-white"><Check className="size-4" /></span>
        <div><p className="font-medium">Care loop complete</p><p className="text-sm text-emerald-800/70">The structured record is ready for clinician review.</p></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between gap-4 rounded-2xl bg-[#112a24] p-5 text-white sm:flex-row sm:items-center">
      <div>
        <p className="font-medium">{phase === 'replaying' ? 'Replaying physiological episode' : 'Ready to demonstrate the care loop'}</p>
        <p className="mt-1 text-sm text-emerald-100/75">{phase === 'replaying' ? 'Applying the recovery-state heuristic…' : 'Replay 12 minutes of wearable data in under 10 seconds.'}</p>
      </div>
      <Button size="lg" className="h-11 bg-white px-4 text-[#112a24] hover:bg-emerald-50" onClick={onReplay} disabled={phase === 'replaying'}>
        <Activity data-icon="inline-start" /> {phase === 'replaying' ? 'Replay running' : 'Replay wearable episode'}
      </Button>
    </div>
  );
}

function ClinicianCard({
  phase,
  record,
  onPreview,
  onDownload,
}: {
  phase: DemoPhase;
  record: EventRecord | null;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <Card className="border border-border/80 shadow-[0_18px_60px_-40px_rgba(11,67,54,0.5)] ring-0">
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5 text-emerald-700" /> Clinician review queue</CardTitle>
        <CardDescription>Structured patient-reported context · Draft for review</CardDescription>
        <CardAction>
          <Badge variant="outline" className={record ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : ''}>
            {record ? '1 new event' : phase === 'processing' ? 'Processing' : 'Waiting'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-[585px] flex-col">
        {!record ? (
          <div className="my-auto flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-5 grid size-16 place-items-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700"><Phone className="size-7" /></span>
            <h2 className="text-xl font-semibold tracking-[-0.03em]">Waiting for the next check-in</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">When the Guava call ends, structured answers appear here automatically. Missing values remain explicitly unknown.</p>
            <Button variant="link" size="sm" className="mt-4 text-muted-foreground" onClick={onPreview}>Preview a clearly labeled sample record</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-2xl bg-[#112a24] p-5 text-white">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-emerald-200">Post-event check-in</p>
                <p className="mt-2 text-xl font-semibold">Distress {shown(record.answers.peak_intensity)} <ArrowRight className="mx-1 inline size-4" /> {shown(record.answers.current_intensity)}</p>
                <p className="mt-1 text-sm text-emerald-100/70">Peak to current self-reported intensity</p>
              </div>
              <Badge className="bg-white text-[#112a24]">{record.completeness.answered}/{record.completeness.total} captured</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <RecordField label="Trigger context" value={record.answers.trigger_context} />
              <RecordField label="Reported symptoms" value={record.answers.symptoms} />
              <RecordField label="What helped" value={record.answers.what_helped} />
              <RecordField label="Clinician follow-up" value={record.answers.follow_up_requested === 'yes' ? 'Requested' : record.answers.follow_up_requested === 'no' ? 'Not requested' : null} highlight={record.answers.follow_up_requested === 'yes'} />
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/35 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Biometric context</p>
                <span className="text-[11px] text-muted-foreground">Synthetic replay</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-muted-foreground">Max HR</p><p className="mt-0.5 font-semibold">{record.biometrics.max_hr} BPM</p></div>
                <div><p className="text-muted-foreground">Min HRV</p><p className="mt-0.5 font-semibold">{record.biometrics.min_hrv} ms</p></div>
                <div><p className="text-muted-foreground">Recovery</p><p className="mt-0.5 font-semibold">4m 12s</p></div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Clinician review required · Not diagnostic</p>
              <Button variant="outline" size="sm" onClick={onDownload}><Download data-icon="inline-start" /> EHR-ready JSON</Button>
            </div>
          </div>
        )}

        <div className="mt-auto rounded-xl border border-dashed border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Clinical boundary</p>
          <p className="mt-1 text-sm text-foreground/75">Wellness signal only · Not a diagnosis · Human clinician remains in control</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StageRail({ phase }: { phase: DemoPhase }) {
  const active = phaseRank(phase);
  const stages = [
    ['Wearable signal', Activity],
    ['Recovery + consent', ShieldCheck],
    ['Guava check-in', Phone],
    ['Clinician context', Clock3],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-card p-2 sm:grid-cols-4">
      {stages.map(([label, Icon], index) => (
        <div key={label} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors ${index <= active ? 'bg-emerald-50 text-emerald-900' : 'text-muted-foreground'}`}>
          <span className={`grid size-6 place-items-center rounded-full ${index < active ? 'bg-emerald-700 text-white' : index === active ? 'border border-emerald-300 bg-white text-emerald-700' : 'bg-muted'}`}>
            {index < active ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
          </span>
          {label}
        </div>
      ))}
    </div>
  );
}

function SignalBadge({ stage }: { stage: string }) {
  const styles = stage === 'elevated' || stage === 'rising'
    ? 'border-red-200 bg-red-50 text-red-800'
    : stage === 'recovering'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : stage === 'recovered'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  const labels: Record<string, string> = { baseline: 'Baseline', rising: 'Signal rising', elevated: 'Elevated', recovering: 'Recovering', recovered: 'Recovered' };
  return <Badge variant="outline" className={styles}>{labels[stage] || stage}</Badge>;
}

function Metric({ label, value, unit, icon, emphasis = false }: { label: string; value: string; unit: string; icon: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 transition-colors ${emphasis ? 'border-red-200 bg-red-50/70' : 'border-border/70 bg-card'}`}>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="[&_svg]:size-3.5">{icon}</span>{label}</div>
      <p className="flex items-baseline gap-1.5 text-2xl font-semibold tracking-[-0.04em]">{value}<span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">{unit}</span></p>
    </div>
  );
}

function RecordField({ label, value, highlight = false }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-amber-200 bg-amber-50' : 'border-border/70 bg-card'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-sm font-medium leading-5 ${!value ? 'italic text-muted-foreground' : ''}`}>{value || 'Not provided'}</p>
    </div>
  );
}

function phaseRank(phase: DemoPhase) {
  if (phase === 'completed') return 3;
  if (phase === 'calling' || phase === 'in_call' || phase === 'processing' || phase === 'error') return 2;
  if (phase === 'ready') return 1;
  return 0;
}

function shown(value: string | number | null) {
  return value ?? '—';
}

function linePath(values: number[], min: number, max: number) {
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${lastX(index + 1).toFixed(1)} ${valueY(value, min, max).toFixed(1)}`).join(' ');
}

function lastX(pointCount: number) {
  if (REPLAY.length === 1) return 12;
  return 12 + ((pointCount - 1) / (REPLAY.length - 1)) * 696;
}

function valueY(value: number, min: number, max: number) {
  return 204 - ((value - min) / (max - min)) * 178;
}
