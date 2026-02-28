export default function LandingPage({ onStart }) {
  return (
    <div>
    
      <nav>
        <div class="container nav-inner">
          <a href="#" class="nav-logo">
            STREET<span> HEAT</span>
          </a>

          <ul id="nav-menu">
            <li>
              <a href="#home">Home</a>
            </li> 
            <li>
              <a href="#play" class="btn-playnow-nav">
                Play Now
              </a>
            </li>
          </ul>

          <button
            class="menu-toggle"
            aria-label="Toggle menu"
            onclick="document.getElementById('nav-menu').classList.toggle('open')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="4" x2="20" y1="12" y2="12"></line>
              <line x1="4" x2="20" y1="6" y2="6"></line>
              <line x1="4" x2="20" y1="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </nav>
      <section id="home">
        <video autoPlay loop muted playsInline poster="/images/hero-video.png">
          <source src="/images/hero-video.mp4" type="video/mp4"></source>
        </video>
        <div class="hero-overlay"></div>

        <div class="hero-content container">
          <div class="hero-grid">
            <div>
              <span class="hero-badge">Season 1 Now Live</span>
              <h1 class="hero-title">
                <span class="text-primary text-glow">SUPER</span>
                <span class="text-fg"> BIKE</span>
                <br />
                <span class="text-fg">RACING </span>
                <span class="text-primary text-glow">3D</span>
              </h1>
              <p class="hero-desc">
                Dominate the asphalt on the world's fastest superbikes. Push 300
                km/h through hairpin turns, master MotoGP circuits, and climb the
                global rankings.
              </p>
              <div class="hero-actions">
                <a href="#play" class="btn-primary">
                  Play Now
                </a>
                <a href="#features" class="btn-secondary">
                  Learn More
                </a>
              </div>
            </div>
            <div class="hero-video-col">
              {/* <button className="landing-cta">
                ENTER GARAGE
              </button> */}

              <div class="video-btn-wrapper"  onClick={onStart}>
                <div class="video-main">
                  <div class="promo-video">
                    <div class="waves-block">
                      <div class="waves wave-1"></div>
                      <div class="waves wave-2"></div>
                      <div class="waves wave-3"></div>
                    </div>
                  </div>
                  <a href="#" class="video video-popup" data-lity>
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <polygon points="8,5 8,19 19,12" fill="#ffffff" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="features">
        <div class="container" >
          <div class="section-header">
            <h2>
              Game <span class="text-primary text-glow">Features</span>
            </h2>
            <p>
              Everything you need for the ultimate superbike racing experience.
            </p>
          </div>

          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M3.34 19a10 10 0 1 1 17.32 0"></path>
                </svg>
              </div>
              <h3>Extreme Circuits</h3>
              <p>
                Race across 20+ real-world MotoGP circuits with dynamic weather and
                day-night cycles.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
                </svg>
              </div>
              <h3>Nitro Boost</h3>
              <p>
                Build up your nitro meter with perfect cornering and draft
                slipstreams to unleash raw speed.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
              <h3>Multiplayer</h3>
              <p>
                Compete against riders worldwide in real-time 12-player
                championship races.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                  <path d="M4 22h16"></path>
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                </svg>
              </div>
              <h3>Ranked Seasons</h3>
              <p>
                Climb the global leaderboard and unlock exclusive bikes and liveries
                each season.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section class="garage-section">
        <div class="container"  >
          <div class="garage-grid">
            <div>
              <img src="/assets/bike-pic.jpg" alt="3D Superbike" class="garage-img" />
            </div>

            <div class="garage-text">
              <h2>
                Build Your <span class="text-primary text-glow">Machine</span>
              </h2>
              <p>
                Unlock and upgrade dozens of superbikes - from 600cc sport bikes to
                1000cc beasts. Tune engines, swap exhausts, and apply custom
                liveries.
              </p>
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-number">40+</div>
                  <div class="stat-label">Superbikes</div>
                </div>
                <div class="stat-card">
                  <div class="stat-number">200+</div>
                  <div class="stat-label">Upgrades</div>
                </div>
                <div class="stat-card">
                  <div class="stat-number">300+</div>
                  <div class="stat-label">Liveries</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="play">
        <div class="container" >
          <div class="cta-box">
            <h2>Ready to Ride?</h2>
            <p>
              Fire up the engine, hit the circuit, and prove you're the fastest
              rider on the planet.
            </p>
            <a href="#" class="btn-download">
              Download Free
            </a>
          </div>
        </div>
      </section>
      <footer>
        <div class="container footer-inner">
          <span class="footer-logo">
            SUPER<span>BIKES</span>
          </span>
          <p>
            © 2026 Street Heat. Powered by{" "}
            <a href="https://webandcrafts.com/" target="_blank">
              WAC
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
