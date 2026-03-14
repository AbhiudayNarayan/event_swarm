import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEventConfig } from "../EventContext";

const steps = [
  {
    title: "Welcome to EL Swarm 👋",
    description: "An autonomous AI platform that manages your entire event — schedules, emails, content, budget, and logistics — from a single chat interface.",
    icon: "⚡",
    action: null
  },
  {
    title: "7 Specialized Agents",
    description: "Each agent handles one domain: Scheduler detects conflicts, Email drafts personalized messages, Content generates social posts, Budget tracks spend, Logistics monitors equipment and vendors.",
    icon: "🤖",
    action: null
  },
  {
    title: "One Orchestrator Controls All",
    description: "The Swarm Orchestrator understands natural language. Type one sentence — it decides which agents to fire, in what order, and resolves conflicts automatically.",
    icon: "🧠",
    action: null
  },
  {
    title: "Start Here — Load Your Event",
    description: "Go to Events, load your event data or use our sample Neurathon '26 dataset. Once loaded, all agents have full context of your schedule, participants, and sponsors.",
    icon: "📅",
    action: { label: "Go to Events", path: "/events" }
  },
  {
    title: "Then Try the Swarm",
    description: "Once your event is loaded, go to Swarm and type: \"The opening keynote is delayed 30 minutes, notify all participants.\" Watch three agents fire automatically.",
    icon: "💬",
    action: { label: "Go to Swarm", path: "/swarm" }
  }
];

export default function OnboardingTour() {
  const [step, setStep] = useState(0);
  const { setHasSeenOnboarding } = useEventConfig();
  const navigate = useNavigate();

  const finish = (path) => {
    localStorage.setItem('el_swarm_onboarded', 'true');
    setHasSeenOnboarding(true);
    if (path) navigate(path);
  };

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">

        {/* Progress dots */}
        <div className="onboarding-dots">
          {steps.map((_, i) => (
            <span key={i}
              className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        {/* Content */}
        <div className="onboarding-icon">{current.icon}</div>
        <h2 className="onboarding-title">{current.title}</h2>
        <p className="onboarding-desc">{current.description}</p>

        {/* Actions */}
        <div className="onboarding-actions">
          {step > 0 && (
            <button className="btn" onClick={() => setStep(s => s - 1)}>
              Back
            </button>
          )}
          {!isLast && (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
              Next
            </button>
          )}
          {isLast && current.action && (
            <button className="btn btn-primary"
              onClick={() => finish(current.action.path)}>
              {current.action.label}
            </button>
          )}
          <button className="btn"
            style={{marginLeft:'auto', opacity:0.5, fontSize:'12px'}}
            onClick={() => finish(null)}>
            Skip tour
          </button>
        </div>

      </div>
    </div>
  );
}
