import React, { useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import HeroScene from './HeroScene';

/* ── Yellow Ball Cursor ───────────────────────────────────────── */
const BallCursor = () => {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const springX = useSpring(cursorX, { damping: 25, stiffness: 500, mass: 0.3 });
  const springY = useSpring(cursorY, { damping: 25, stiffness: 500, mass: 0.3 });

  useEffect(() => {
    const move = (e) => {
      cursorX.set(e.clientX - 16);
      cursorY.set(e.clientY - 16);
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      style={{
        position: 'fixed',
        left: springX,
        top: springY,
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, #fff, #fbbf24 60%)',
        boxShadow: '0 0 20px rgba(251,191,36,0.6), 0 0 60px rgba(251,191,36,0.2)',
        pointerEvents: 'none',
        zIndex: 9999,
        mixBlendMode: 'screen',
      }}
    />
  );
};

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: 'easeOut' } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.15 } },
};

/* ── Glassmorphism Card ───────────────────────────────────────── */
const GlassCard = ({ children, style, ...props }) => (
  <motion.div
    whileHover={{ y: -6, scale: 1.01 }}
    transition={{ type: 'spring', stiffness: 40, damping: 20, mass: 2 }}
    style={{
      background: 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px) saturate(1.4)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '20px',
      padding: '40px 32px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
      ...style,
    }}
    {...props}
  >
    {children}
  </motion.div>
);

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div style={{ cursor: 'none' }}>
      <BallCursor />

      {/* Fixed 3D background */}
      <HeroScene />

      {/* Scrollable HTML content on top */}
      <div style={{
        position: 'relative', zIndex: 1,
        color: '#fff', fontFamily: "'Inter', system-ui, sans-serif",
        cursor: 'none',
      }}>

        {/* ── Fixed Header ─────────────────────────────── */}
        <header style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          padding: '16px 40px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          zIndex: 100,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L4.09 12.64a1 1 0 00.78 1.61H11v5.75a.5.5 0 00.9.3L20.91 9.35a1 1 0 00-.78-1.61H13V2.25a.5.5 0 00-.9-.3L13 2z" fill="url(#bolt-grad)" />
              <defs><linearGradient id="bolt-grad" x1="4" y1="2" x2="20" y2="22"><stop stopColor="#7bb6ff" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient></defs>
            </svg>
            <span style={{
              fontSize: '20px', fontWeight: 800,
              background: 'linear-gradient(120deg, #7bb6ff, #0ea5e9)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              CHASER
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '8px',
              background: 'rgba(123,182,255,0.2)', color: '#7bb6ff', letterSpacing: '0.5px',
              border: '1px solid rgba(123,182,255,0.3)',
            }}>
              AI AGENT
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => navigate('/login')} style={{
              background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
              padding: '10px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
              backdropFilter: 'blur(8px)',
            }}>
              Login
            </button>
            <button onClick={() => navigate('/register')} style={{
              background: 'linear-gradient(135deg, #3b82f6, #0ea5e9)', color: '#fff', border: 'none',
              padding: '10px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 8px 30px rgba(59,130,246,0.4)',
              transition: 'all 0.2s',
            }}>
              Get Started →
            </button>
          </div>
        </header>

        {/* ── Section 1: Hero ──────────────────────────── */}
        <section style={{
          height: '100vh',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          textAlign: 'center', padding: '0 24px',
        }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.div variants={fadeUp} style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '6px 16px', borderRadius: '999px', marginBottom: '28px',
              background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
              fontSize: '13px', fontWeight: 600, color: '#4ade80',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e',
                boxShadow: '0 0 12px rgba(34,197,94,0.6)',
                animation: 'pulse 2s ease-in-out infinite',
              }} />
              AI Agent Active
            </motion.div>

            <motion.h1 variants={fadeUp} style={{
              fontSize: 'clamp(48px, 9vw, 88px)', fontWeight: 800, lineHeight: 1.05,
              marginBottom: '24px', letterSpacing: '-3px',
              background: 'linear-gradient(180deg, #ffffff 20%, rgba(255,255,255,0.5) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Stop Chasing.<br />Start Doing.
            </motion.h1>

            <motion.p variants={fadeUp} style={{
              fontSize: '20px', color: 'rgba(255,255,255,0.6)', maxWidth: '540px', margin: '0 auto 40px',
              lineHeight: 1.6,
            }}>
              The AI agent that autonomously follows up on overdue tasks — so you never send a "just checking in" email again.
            </motion.p>

            <motion.div variants={fadeUp} style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/register')} style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #7b9fff 100%)',
                color: '#0a1022', border: 'none', padding: '18px 40px', borderRadius: '16px',
                fontSize: '18px', fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 16px 50px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}>
                Deploy Agent
              </button>
              <button onClick={() => {
                document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' });
              }} style={{
                background: 'rgba(255,255,255,0.08)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.15)', padding: '18px 40px', borderRadius: '16px',
                fontSize: '18px', fontWeight: 600, cursor: 'pointer',
                backdropFilter: 'blur(8px)', transition: 'all 0.2s',
              }}>
                How It Works ↓
              </button>
            </motion.div>
          </motion.div>
        </section>

        {/* ── Section 2: The 2 Rules ──────────────────── */}
        <section id="features-section" style={{
          minHeight: '100vh',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: '80px 24px',
        }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={stagger}
            style={{ maxWidth: '1100px', width: '100%' }}
          >
            <motion.div variants={fadeUp} style={{ textAlign: 'center', marginBottom: '60px' }}>
              <span style={{
                fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase',
                color: '#f59e0b', marginBottom: '12px', display: 'block',
              }}>
                THE ENGINE
              </span>
              <h2 style={{
                fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-1.5px',
                background: 'linear-gradient(180deg, #fff 30%, rgba(255,255,255,0.5))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                2 Rules. Zero Excuses.
              </h2>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '28px' }}>
              <motion.div variants={fadeUp}>
                <GlassCard>
                  <div style={{ marginBottom: '20px', filter: 'drop-shadow(0 0 24px rgba(245,158,11,0.5))' }}>
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="13" r="8" stroke="url(#timer-grad)" strokeWidth="1.5" fill="rgba(245,158,11,0.08)" />
                      <path d="M12 9v4l2.5 2.5" stroke="url(#timer-grad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M10 2h4" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
                      <defs><linearGradient id="timer-grad" x1="4" y1="4" x2="20" y2="22"><stop stopColor="#fbbf24" /><stop offset="1" stopColor="#f59e0b" /></linearGradient></defs>
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', color: '#fff' }}>
                    Rule #1: The Nudge
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                    Task incomplete and <strong style={{ color: '#f59e0b' }}>due within 24 hours</strong>?
                    The agent sends a polite reminder automatically. No manual follow-up needed.
                  </p>
                  <div style={{
                    marginTop: '20px', padding: '12px', borderRadius: '10px',
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                    fontSize: '13px', color: '#fbbf24', fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    → "Hey, this is due tomorrow. Need anything?"
                  </div>
                </GlassCard>
              </motion.div>

              <motion.div variants={fadeUp}>
                <GlassCard>
                  <div style={{ marginBottom: '20px', filter: 'drop-shadow(0 0 24px rgba(239,68,68,0.5))' }}>
                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="url(#alert-grad)" strokeWidth="1.5" fill="rgba(239,68,68,0.08)" />
                      <line x1="12" y1="9" x2="12" y2="13" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="12" cy="16" r="1" fill="#f87171" />
                      <defs><linearGradient id="alert-grad" x1="2" y1="3" x2="22" y2="21"><stop stopColor="#f87171" /><stop offset="1" stopColor="#ef4444" /></linearGradient></defs>
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', color: '#fff' }}>
                    Rule #2: The Escalation
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                    Task <strong style={{ color: '#ef4444' }}>overdue by 24+ hours</strong>?
                    The agent escalates directly to the manager. No more silent deadlines.
                  </p>
                  <div style={{
                    marginTop: '20px', padding: '12px', borderRadius: '10px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: '13px', color: '#f87171', fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    → "ESCALATION: Task overdue. Manager notified."
                  </div>
                </GlassCard>
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* ── Section 3: Manual Chase ─────────────────── */}
        <section style={{
          minHeight: '100vh',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          padding: '80px 24px',
        }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={stagger}
            style={{ maxWidth: '700px', width: '100%', textAlign: 'center' }}
          >
            <motion.div variants={fadeUp}>
              <span style={{
                fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase',
                color: '#8b5cf6', marginBottom: '12px', display: 'block',
              }}>
                MANUAL OVERRIDE
              </span>
              <h2 style={{
                fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-1px',
                marginBottom: '20px',
                background: 'linear-gradient(180deg, #fff 30%, rgba(255,255,255,0.5))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                Sometimes you need it <em>now</em>.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '18px', marginBottom: '40px', lineHeight: 1.6 }}>
                One click. Instant chase. The Manual Chase button lets you trigger a follow-up email on demand — no waiting for the schedule.
              </p>
            </motion.div>

            <motion.div variants={fadeUp}>
              <GlassCard style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
                border: '1px solid rgba(139,92,246,0.25)',
                textAlign: 'center',
              }}>
                <div style={{ marginBottom: '24px', filter: 'drop-shadow(0 0 30px rgba(139,92,246,0.5))' }}>
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L4.09 12.64a1 1 0 00.78 1.61H11v5.75a.5.5 0 00.9.3L20.91 9.35a1 1 0 00-.78-1.61H13V2.25a.5.5 0 00-.9-.3L13 2z" fill="url(#bolt-lg)" />
                    <defs><linearGradient id="bolt-lg" x1="4" y1="2" x2="20" y2="22"><stop stopColor="#c084fc" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
                  </svg>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '28px', fontSize: '16px' }}>
                  Click below to see what it feels like.
                </p>
                <button
                  onClick={() => {
                    const btn = document.getElementById('chase-demo-btn');
                    if (btn) {
                      btn.textContent = '✅ Chase Sent!';
                      btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
                      btn.style.boxShadow = '0 12px 40px rgba(34,197,94,0.4)';
                      setTimeout(() => {
                        btn.textContent = '▸ TRIGGER CHASE';
                        btn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                        btn.style.boxShadow = '0 12px 40px rgba(245,158,11,0.4)';
                      }, 2000);
                    }
                  }}
                  id="chase-demo-btn"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#0a1022', border: 'none', padding: '16px 40px', borderRadius: '14px',
                    fontSize: '16px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.5px',
                    boxShadow: '0 12px 40px rgba(245,158,11,0.4)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  ▸ TRIGGER CHASE
                </button>
              </GlassCard>
            </motion.div>
          </motion.div>
        </section>

        {/* ── Section 4: Final CTA ────────────────────── */}
        <section style={{
          minHeight: '100vh',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          textAlign: 'center', padding: '80px 24px',
        }}>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} style={{
              fontSize: 'clamp(36px, 7vw, 64px)', fontWeight: 800, letterSpacing: '-2px',
              marginBottom: '20px',
              background: 'linear-gradient(135deg, #3b82f6, #22c55e)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Ready to deploy?
            </motion.h2>
            <motion.p variants={fadeUp} style={{
              color: 'rgba(255,255,255,0.5)', fontSize: '20px', maxWidth: '500px',
              margin: '0 auto 40px', lineHeight: 1.6,
            }}>
              Set it up in 2 minutes. Watch tasks get chased automatically.
            </motion.p>
            <motion.div variants={fadeUp}>
              <button onClick={() => navigate('/register')} style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#fff', border: 'none', padding: '20px 48px', borderRadius: '16px',
                fontSize: '20px', fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 20px 60px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                transition: 'transform 0.2s',
              }}>
                Create Free Account →
              </button>
            </motion.div>
          </motion.div>

          {/* Footer */}
          <div style={{
            position: 'absolute', bottom: '30px', left: 0, right: 0,
            textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '13px',
          }}>
            © 2026 Chaser Agent — Built for Speed.
          </div>
        </section>
      </div>
    </div>
  );
};

export default LandingPage;
