import { FormEvent, useEffect, useMemo, useState } from "react"

const REVEALS = {
  theme: new Date("2026-10-25T19:00:00+05:30"),
  date: new Date("2026-10-27T19:00:00+05:30"),
}

const TEAMS = ["Sonic", "Mario", "Rockstar", "Tetris", "Gameboy"]
const SHEETS_ENDPOINT = import.meta.env
  .VITE_GOOGLE_SHEETS_WEB_APP_URL as string | undefined

type CountdownValue = {
  days: number
  hours: number
  minutes: number
  seconds: number
  complete: boolean
}

type FormState = {
  name: string
  phone: string
  attending: string
}

function getCountdown(target: Date): CountdownValue {
  const difference = Math.max(0, target.getTime() - Date.now())

  return {
    days: Math.floor(difference / 86_400_000),
    hours: Math.floor((difference / 3_600_000) % 24),
    minutes: Math.floor((difference / 60_000) % 60),
    seconds: Math.floor((difference / 1_000) % 60),
    complete: difference === 0,
  }
}

function Countdown({ target }: { target: Date }) {
  const [time, setTime] = useState(() => getCountdown(target))

  useEffect(() => {
    const interval = window.setInterval(
      () => setTime(getCountdown(target)),
      1000,
    )
    return () => window.clearInterval(interval)
  }, [target])

  if (time.complete) {
    return <p className="reveal-live">Transmission unlocked</p>
  }

  const units = [
    ["Days", time.days],
    ["Hours", time.hours],
    ["Minutes", time.minutes],
    ["Seconds", time.seconds],
  ] as const

  return (
    <div className="countdown" aria-label="Countdown">
      {units.map(([label, value], index) => (
        <div className="time-wrap" key={label}>
          <div className="time-unit">
            <span>{String(value).padStart(2, "0")}</span>
            <small>{label}</small>
          </div>
          {index < units.length - 1 && <b aria-hidden="true">:</b>}
        </div>
      ))}
    </div>
  )
}

function assignTeam(name: string, phone: string) {
  const seed = `${name.trim().toLowerCase()}${phone.replace(/\D/g, "")}`
  const hash = [...seed].reduce((total, character) => {
    return (total * 31 + character.charCodeAt(0)) >>> 0
  }, 0)
  return TEAMS[hash % TEAMS.length]
}

function PixelMark({
  variant = "plus",
}: {
  variant?: "plus" | "ship" | "dots"
}) {
  if (variant === "ship") {
    return (
      <svg className="pixel-mark ship" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M20 8h8v8h8v8h4v12h-8v-8H16v8H8V24h4v-8h8V8Z" />
        <path className="pixel-cut" d="M16 18h6v6h-6zm10 0h6v6h-6z" />
      </svg>
    )
  }

  if (variant === "dots") {
    return (
      <svg className="pixel-mark dots" viewBox="0 0 56 56" aria-hidden="true">
        <rect x="8" y="8" width="8" height="8" />
        <rect x="24" y="8" width="8" height="8" />
        <rect x="40" y="8" width="8" height="8" />
        <rect x="8" y="24" width="8" height="8" />
        <rect x="40" y="24" width="8" height="8" />
        <rect x="8" y="40" width="8" height="8" />
        <rect x="24" y="40" width="8" height="8" />
        <rect x="40" y="40" width="8" height="8" />
      </svg>
    )
  }

  return (
    <svg className="pixel-mark plus" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M16 4h8v12h12v8H24v12h-8V24H4v-8h12V4Z" />
    </svg>
  )
}

export default function App() {
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    attending: "",
  })
  const [status, setStatus] =
    useState<"idle" | "sending" | "success" | "error">("idle")
  const [assignedTeam, setAssignedTeam] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const teamPreview = useMemo(
    () => (form.name && form.phone ? assignTeam(form.name, form.phone) : ""),
    [form.name, form.phone],
  )

  useEffect(() => {
    const revealElements =
      document.querySelectorAll<HTMLElement>("[data-reveal]")
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.16 },
    )

    revealElements.forEach((element) => observer.observe(element))

    const updateScrollProgress = () => {
      const available =
        document.documentElement.scrollHeight - window.innerHeight
      const progress = available > 0 ? window.scrollY / available : 0
      document.documentElement.style.setProperty(
        "--scroll-progress",
        String(progress),
      )
    }

    updateScrollProgress()
    window.addEventListener("scroll", updateScrollProgress, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", updateScrollProgress)
    }
  }, [])

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setStatus("idle")
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const digits = form.phone.replace(/\D/g, "")

    if (!form.name.trim() || digits.length < 8 || !form.attending) {
      setErrorMessage("Complete all fields and enter a valid phone number.")
      setStatus("error")
      return
    }

    setStatus("sending")
    setErrorMessage("")
    const team = assignTeam(form.name, form.phone)
    const response = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      attending: form.attending,
      team: `Team ${team}`,
      submittedAt: new Date().toISOString(),
    }

    try {
      if (SHEETS_ENDPOINT) {
        await fetch(SHEETS_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(response),
        })
      } else {
        const saved = JSON.parse(
          window.localStorage.getItem("freshers-registrations") || "[]",
        )
        window.localStorage.setItem(
          "freshers-registrations",
          JSON.stringify([...saved, response]),
        )
      }

      setAssignedTeam(team)
      setStatus("success")
    } catch {
      setErrorMessage("We couldn't save your response. Please try again.")
      setStatus("error")
    }
  }

  return (
    <main>
      <div className="noise" aria-hidden="true" />
      <div className="scroll-progress" aria-hidden="true" />
      <div className="grid-floor" aria-hidden="true" />
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />
      <PixelMark variant="plus" />
      <PixelMark variant="ship" />
      <PixelMark variant="dots" />
      <div className="ambient-arcade" aria-hidden="true">
        <span className="ghost ghost-one">
          <i />
          <i />
        </span>
        <span className="ghost ghost-two">
          <i />
          <i />
        </span>
        <span className="pixel-coin coin-one" />
        <span className="pixel-coin coin-two" />
        <span className="pixel-coin coin-three" />
        <span className="maze-fragment" />
        <span className="power-bar">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>

      <nav className="nav shell" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Freshers home">
          <span className="brand-icon">
            <i />
            <i />
            <i />
          </span>
          <span>Freshers</span>
          <sup>26</sup>
        </a>
        <a className="nav-link" href="#register">
          Join the list
          <span aria-hidden="true">↘</span>
        </a>
      </nav>

      <section className="hero shell" id="top">
        <div className="eyebrow hero-reveal" data-reveal>
          <span />
          Incoming transmission
        </div>
        <h1 className="hero-reveal delay-one" data-reveal>
          Something is
          <br />
          <em>loading...</em>
        </h1>
        <p className="hero-copy hero-reveal delay-two" data-reveal>
          The first chapter of your campus story is almost here. One secret. One
          unforgettable night. Stay tuned.
        </p>
        <a
          className="scroll-cue hero-reveal delay-three"
          data-reveal
          href="#countdowns"
          aria-label="Scroll to countdowns"
        >
          <span>Scroll to decode</span>
          <i>↓</i>
        </a>
      </section>

      <section className="countdown-section shell" id="countdowns">
        <div className="section-heading scroll-reveal" data-reveal>
          <span>01 / Classified signals</span>
          <p>Awaiting decryption</p>
        </div>

        <article
          className="countdown-card card-green scroll-reveal"
          data-reveal
        >
          <div className="card-copy">
            <div className="card-index">Signal 001</div>
            <h2>Theme reveal</h2>
            <p>What world are we stepping into?</p>
          </div>
          <Countdown target={REVEALS.theme} />
          <div className="status-chip">
            <span />
            Encrypted
          </div>
        </article>

        <article
          className="countdown-card card-violet scroll-reveal reveal-from-right"
          data-reveal
        >
          <div className="card-copy">
            <div className="card-index">Signal 002</div>
            <h2>Event countdown</h2>
            <p>The night begins when this signal reaches zero.</p>
          </div>
          <Countdown target={REVEALS.date} />
          <div className="status-chip">
            <span />
            Awaiting start
          </div>
        </article>
      </section>

      <section className="registration shell" id="register">
        <div className="registration-intro scroll-reveal" data-reveal>
          <div className="eyebrow">
            <span />
            Player registration
          </div>
          <h2>
            Ready when
            <br />
            you are.
          </h2>
          <p>
            Lock in your place now. Once you register, the system will assign
            you to one of five crews for the night.
          </p>
          <div className="team-stack" aria-label="Five possible teams">
            {TEAMS.map((team, index) => (
              <span
                key={team}
                style={{ "--index": index } as React.CSSProperties}
              >
                {team.slice(0, 1)}
              </span>
            ))}
            <small>5 crews awaiting</small>
          </div>
        </div>

        <div className="form-panel scroll-reveal reveal-from-right" data-reveal>
          {status === "success" ? (
            <div className="success-state">
              <div className="success-glyph">
                <span />
              </div>
              <div className="eyebrow">Registration complete</div>
              <h3>You’re in, {form.name.split(" ")[0]}.</h3>
              <p>Your crew for the night is</p>
              <strong>Team {assignedTeam}</strong>
              {!SHEETS_ENDPOINT && (
                <small>
                  Saved on this device. Connect the Sheets endpoint to sync
                  registrations.
                </small>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setForm({ name: "", phone: "", attending: "" })
                  setStatus("idle")
                }}
              >
                Register another player
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="form-topline">
                <span>Entry form</span>
                <span>All fields required</span>
              </div>
              <label>
                <span>Full name</span>
                <input
                  autoComplete="name"
                  type="text"
                  placeholder="Enter your name"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
              </label>
              <label>
                <span>Phone number</span>
                <input
                  autoComplete="tel"
                  inputMode="tel"
                  type="tel"
                  placeholder="+91 00000 00000"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </label>
              <fieldset>
                <legend>Will you be attending?</legend>
                <div className="attendance-options">
                  {[
                    ["Yes, count me in", "Yes"],
                    ["No, not this time", "No"],
                  ].map(([label, value]) => (
                    <label className="radio-card" key={value}>
                      <input
                        type="radio"
                        name="attending"
                        value={value}
                        checked={form.attending === value}
                        onChange={() => updateField("attending", value)}
                      />
                      <span className="custom-radio" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {teamPreview && (
                <p className="team-preview">
                  Crew match ready — revealed after entry
                </p>
              )}
              {status === "error" && (
                <p className="form-error">{errorMessage}</p>
              )}
              <button className="submit-button" disabled={status === "sending"}>
                <span>
                  {status === "sending"
                    ? "Transmitting..."
                    : "Register & reveal my crew"}
                </span>
                <b aria-hidden="true">↗</b>
              </button>
              <p className="privacy-note">
                Your details are only used for event coordination.
              </p>
            </form>
          )}
        </div>
      </section>

      <footer className="shell">
        <div className="brand">
          <span className="brand-icon">
            <i />
            <i />
            <i />
          </span>
          <span>Freshers</span>
          <sup>26</sup>
        </div>
        <p>New beginnings. Unknown worlds.</p>
        <span>Transmission ends here / 2026</span>
      </footer>
    </main>
  )
}
