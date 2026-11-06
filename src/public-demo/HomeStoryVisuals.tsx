import { Fragment, useEffect, useRef, useState } from "react";
import { Heart, PenTool, Users } from "lucide-react";
import { demoAsset } from "../runtime";

const missionNodes = [
  {
    key: "creators",
    label: "Creators",
    Icon: PenTool,
    file: "why-creators.jpg",
    alt: "An artist at work in a sunlit painting studio.",
  },
  {
    key: "causes",
    label: "Causes",
    Icon: Heart,
    file: "why-causes.jpg",
    alt: "A volunteer carrying a box of donations.",
  },
  {
    key: "community",
    label: "Community",
    Icon: Users,
    file: "why-community.jpg",
    alt: "Friends walking together through a park.",
  },
] as const;

// Steps alternate node, arrow, node, arrow, node; 0 is the empty card.
const missionSteps = missionNodes.length * 2 - 1;
const missionStartDelayMs = 250;
const missionStepMs = 650;

export function MissionVisual() {
  const scene = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(missionSteps);
      return;
    }
    let timers: number[] = [];
    const clear = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          // Fully off screen: reset so the next arrival populates again.
          clear();
          setStep(0);
        } else if (entry.intersectionRatio >= 0.99 && timers.length === 0) {
          for (let next = 1; next <= missionSteps; next++) {
            timers.push(
              window.setTimeout(
                () => setStep((current) => Math.max(current, next)),
                missionStartDelayMs + (next - 1) * missionStepMs,
              ),
            );
          }
        }
      },
      { threshold: [0, 0.99] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      clear();
    };
  }, []);

  return (
    <figure
      className="mission-visual"
      data-step={step}
      data-complete={step === missionSteps ? "" : undefined}
    >
      <div
        ref={scene}
        className="mission-scene"
        role="group"
        aria-label="One story creates a ripple of support: creators tell stories for causes, and community support helps them reach more people."
      >
        <img
          className="mission-backdrop"
          src={demoAsset("images/why-landscape.jpg")}
          alt=""
          width={1200}
          height={800}
          loading="lazy"
          decoding="async"
        />
        <span className="mission-rings" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="mission-flow">
          {missionNodes.map(({ key, label, Icon, file, alt }, index) => (
            <Fragment key={key}>
              {index > 0 && (
                <span
                  className={`mission-arrow${
                    step >= index * 2 ? " is-drawn" : ""
                  }`}
                  aria-hidden="true"
                >
                  <i />
                </span>
              )}
              <div
                className={`mission-node ${key}${
                  step >= index * 2 + 1 ? " is-shown" : ""
                }`}
              >
                <div className="mission-node-photo">
                  <img
                    src={demoAsset(`images/${file}`)}
                    alt={alt}
                    width={1200}
                    height={800}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <span className="mission-node-label">
                  <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </span>
              </div>
            </Fragment>
          ))}
        </div>
        <p className="mission-tagline">ONE STORY. GREATER REACH.</p>
      </div>
      <figcaption>
        Creativity connects us. Support carries it further.
      </figcaption>
    </figure>
  );
}

const stepPhotos = {
  discover: {
    file: "how-discover.jpg",
    alt: "Volunteers working together to clean their neighborhood.",
  },
  connect: {
    file: "how-connect.jpg",
    alt: "An independent filmmaker setting up a camera to tell a story.",
  },
  amplify: {
    file: "how-amplify.jpg",
    alt: "Community volunteers preparing food and supplies for people in need.",
  },
};

export function StepVisual({ step }: { step: keyof typeof stepPhotos }) {
  const photo = stepPhotos[step];
  return (
    <div className={`how-step-visual ${step}`}>
      <img
        src={demoAsset(`images/${photo.file}`)}
        alt={photo.alt}
        width={1200}
        height={800}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
