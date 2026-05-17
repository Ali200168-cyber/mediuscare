import { useMemo, useRef, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import {
  FiActivity,
  FiAlertCircle,
  FiArrowRight,
  FiBarChart2,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiHeart,
  FiLock,
  FiMail,
  FiPhone,
  FiShield,
  FiTarget,
  FiTrendingUp,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { API_URL } from "../config/api";
import { MEDIA, MEDIA_ALT } from "../config/mediaAssets";
import MediascapeImage from "../components/MediascapeImage";
import "../styles/AuthLanding.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLATFORM_FEATURES = [
  {
    Icon: FiActivity,
    title: "AI Health Predictions",
    desc: "Detect risk patterns early with explainable predictions.",
    img: MEDIA.featureAi,
    alt: MEDIA_ALT.featureAi,
  },
  {
    Icon: FiHeart,
    title: "Real-time Monitoring",
    desc: "Track glucose, blood pressure, and vitals continuously.",
    img: MEDIA.featureVitals,
    alt: MEDIA_ALT.featureVitals,
  },
  {
    Icon: FiUsers,
    title: "Doctor Consultations",
    desc: "Coordinate virtual and scheduled care touchpoints.",
    img: MEDIA.featureConsult,
    alt: MEDIA_ALT.featureConsult,
  },
  {
    Icon: FiAlertCircle,
    title: "Alerts & Notifications",
    desc: "Receive instant alerts for critical health signals.",
    img: MEDIA.featureAlerts,
    alt: MEDIA_ALT.featureAlerts,
  },
  {
    Icon: FiBarChart2,
    title: "Reports & Analytics",
    desc: "Visual summaries for outcomes and trend review.",
    img: MEDIA.featureReports,
    alt: MEDIA_ALT.featureReports,
  },
];

const getPasswordStrength = (password) => {
  if (!password) return { label: "", score: 0 };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { label: "Weak", score };
  if (score <= 3) return { label: "Medium", score };
  return { label: "Strong", score };
};

const AuthLanding = ({ initialMode = "login", authOnly = false, marketingOnly = false }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode === "signup" ? "signup" : "login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });

  const [signupData, setSignupData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "patient",
    specialization: "",
  });
  const [doctorProofFile, setDoctorProofFile] = useState(null);

  const loginValidation = useMemo(() => {
    const errors = {};
    const value = loginData.email.trim();

    if (!value) errors.email = "Email is required";
    if (value && !EMAIL_REGEX.test(value)) errors.email = "Invalid email format";
    // Login must not block short legacy passwords (backend decides).
    if (!loginData.password) errors.password = "Password is required";
    return errors;
  }, [loginData]);

  const signupValidation = useMemo(() => {
    const errors = {};
    if (!signupData.fullName.trim()) errors.fullName = "Full name is required";
    if (!EMAIL_REGEX.test(signupData.email)) errors.email = "Invalid email";
    if (!signupData.password || signupData.password.length < 8) errors.password = "Password too short";
    if (signupData.password !== signupData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    if (signupData.role === "doctor" && !signupData.specialization.trim()) {
      errors.specialization = "Specialization is required for doctor signup";
    }
    if (signupData.role === "doctor" && !doctorProofFile) {
      errors.doctorProof = "Proof document is required for doctor signup";
    }
    return errors;
  }, [signupData, doctorProofFile]);

  const passwordStrength = useMemo(() => getPasswordStrength(signupData.password), [signupData.password]);
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(loginValidation).length) {
      setMessage({ type: "error", text: "Please fix login errors before continuing." });
      return;
    }
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, {
        email: loginData.email.trim(),
        password: loginData.password,
      });
      const { token, refreshToken, user } = res.data;
      localStorage.setItem("token", token);
      if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("role", user.role);
      if (loginData.rememberMe) {
        localStorage.setItem("rememberedLogin", loginData.email.trim());
      } else {
        localStorage.removeItem("rememberedLogin");
      }
      if (user.role === "patient") navigate("/patient/dashboard");
      else if (user.role === "doctor") navigate("/doctor/dashboard");
      else if (user.role === "caregiver") navigate("/caregiver/dashboard");
      else if (user.role === "admin") navigate("/admin/dashboard");
      else setMessage({ type: "success", text: "Login successful." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Login failed. Please check your credentials.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(signupValidation).length) {
      setMessage({ type: "error", text: "Please fix sign up errors before continuing." });
      return;
    }
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      let signupRes;
      if (signupData.role === "doctor") {
        const form = new FormData();
        form.append("name", signupData.fullName.trim());
        form.append("email", signupData.email.trim());
        form.append("password", signupData.password);
        form.append("role", signupData.role);
        form.append("specialization", signupData.specialization.trim());
        if (doctorProofFile) form.append("doctorProof", doctorProofFile);
        signupRes = await axios.post(`${API_URL}/api/auth/signup`, form);
      } else {
        signupRes = await axios.post(`${API_URL}/api/auth/signup`, {
          name: signupData.fullName.trim(),
          email: signupData.email.trim(),
          password: signupData.password,
          role: signupData.role,
        });
      }
      if (signupRes.data?.refreshToken) localStorage.setItem("refreshToken", signupRes.data.refreshToken);
      setMessage({
        type: "success",
        text:
          signupData.role === "doctor"
            ? "Doctor signup submitted. Please wait for admin approval before login."
            : "Account created successfully.",
      });
      setMode("login");
      setLoginData((prev) => ({ ...prev, email: signupData.email.trim() }));
      setDoctorProofFile(null);
      setSignupData((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.message || "Unable to create account right now.",
      });
    } finally {
      setLoading(false);
    }
  };

  const homeRef = useRef(null);
  const featuresRef = useRef(null);
  const aboutRef = useRef(null);
  const whyRef = useRef(null);
  const contactRef = useRef(null);
  const authRef = useRef(null);

  const scrollTo = (section) => {
    const map = {
      Home: homeRef,
      Features: featuresRef,
      About: aboutRef,
      Why: whyRef,
      Contact: contactRef,
      Auth: authRef,
    };
    const ref = map[section];
    if (ref?.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const menuItems = ["Home", "Features", "About", "Contact"];

  return (
    <div
      className={[
        "auth-page",
        authOnly ? "auth-page--solo" : "",
        marketingOnly ? "auth-page--marketing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className={`auth-navbar${authOnly ? " auth-navbar--solo" : ""}`} ref={homeRef}>
        {authOnly ? (
          <>
            <Link to="/" className="brand">
              <div className="brand-icon"><FiHeart /></div>
              <span>MediusCare</span>
            </Link>
            <div className="nav-actions">
              <Link to="/" className="nav-ghost">Home</Link>
            </div>
          </>
        ) : (
          <>
        <button type="button" className="brand brand-btn" onClick={() => scrollTo("Home")}>
          <div className="brand-icon">
            <FiHeart />
          </div>
          <span>MediusCare</span>
        </button>
        <nav className="nav-links">
          {menuItems.map((item) => (
            <button key={item} type="button" onClick={() => scrollTo(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className="nav-actions">
          {marketingOnly ? (
            <>
              <Link to="/login" className="nav-ghost">Sign In</Link>
              <Link to="/signup" className="nav-cta">Sign Up</Link>
            </>
          ) : (
            <>
              <button type="button" className="nav-ghost" onClick={() => { setMode("login"); scrollTo("Auth"); }}>
                Sign In
              </button>
              <button type="button" className="nav-cta" onClick={() => { setMode("signup"); scrollTo("Auth"); }}>
                Sign Up
              </button>
            </>
          )}
        </div>
          </>
        )}
      </header>

      <main className={authOnly ? "auth-solo-main" : ""}>
        {!authOnly && (
        <>
        <section className="hero-shell">
          <div className="hero-panel">
            <div className="hero-content">
              <div className="hero-main">
                <div className="hero-badge">
                  <FiShield />
                  <span>Secure healthcare intelligence platform</span>
                </div>
                <h1>AI-Powered Healthcare Monitoring System</h1>
                <p>Track, predict, and manage patient health in real-time with collaborative care workflows.</p>
                <div className="hero-ctas">
                  {marketingOnly ? (
                    <>
                      <Link to="/signup" className="primary-btn">Get Started</Link>
                      <Link to="/login" className="secondary-btn">Sign In</Link>
                    </>
                  ) : (
                    <>
                      <button type="button" className="primary-btn" onClick={() => { setMode("signup"); scrollTo("Auth"); }}>
                        Get Started
                      </button>
                      <button type="button" className="secondary-btn" onClick={() => { setMode("login"); scrollTo("Auth"); }}>
                        Sign In
                      </button>
                    </>
                  )}
                </div>
                <div className="hero-highlights" aria-label="Platform highlights">
                  <span>AI-assisted risk insights</span>
                  <span>Role-based secure access</span>
                  <span>Connected patient-doctor-caregiver workflows</span>
                </div>
              </div>
              <figure className="hero-side-visual">
                <MediascapeImage
                  src={MEDIA.authHeroCare}
                  alt={MEDIA_ALT.authHeroCare}
                  className="hero-side-image"
                  priority
                  sizes="(max-width: 980px) 90vw, 360px"
                />
              </figure>
            </div>
          </div>
        </section>

        <section className="site-section" ref={featuresRef}>
          <div className="section-head">
            <h2>Platform Features</h2>
            <p>Everything care teams need in one connected medical workspace.</p>
          </div>
          <div className="feature-grid">
            {PLATFORM_FEATURES.map(({ Icon, title, desc, img, alt }) => (
              <article key={title} className="feature-card">
                <div className="feature-card-visual">
                  <MediascapeImage src={img} alt={alt} sizes="(max-width: 780px) 90vw, 240px" />
                </div>
                <Icon aria-hidden />
                <h3>{title}</h3>
                <p>{desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="site-section about-grid" ref={aboutRef}>
          <div className="about-copy">
            <h2>About MediusCare</h2>
            <p>
              MediusCare helps patients, doctors, and caregivers collaborate through a single secure platform focused
              on proactive care and timely interventions.
            </p>
            <ul>
              <li>Patients get guided monitoring and easier follow-up.</li>
              <li>Doctors gain AI-assisted decision support.</li>
              <li>Caregivers stay informed through actionable updates.</li>
            </ul>
          </div>
          <figure className="about-photo-frame">
            <MediascapeImage
              src={MEDIA.aboutCollaboration}
              alt={MEDIA_ALT.aboutCollaboration}
              sizes="(max-width: 1120px) 92vw, 360px"
            />
          </figure>
          <div className="about-panel">
            <FiTarget aria-hidden />
            <h3>Built for practical healthcare operations</h3>
            <p>Designed to improve response time, visibility, and care continuity across all stakeholders.</p>
          </div>
        </section>

        <section className="site-section why-grid" ref={whyRef}>
          <div className="section-head">
            <h2>Why Choose Us</h2>
          </div>
          <div className="why-cards">
            <div><FiCheckCircle /><h3>Accurate AI</h3><p>Model-backed insights for better clinical decisions.</p></div>
            <div><FiUsers /><h3>Easy to Use</h3><p>Simple workflows for both technical and non-technical users.</p></div>
            <div><FiShield /><h3>Secure System</h3><p>Role-based access and secure authentication controls.</p></div>
            <div><FiTrendingUp /><h3>Real-time Insights</h3><p>Always-updated status for timely interventions.</p></div>
          </div>
        </section>
        </>
        )}

        {!marketingOnly && (
        <section className={`site-section auth-section${authOnly ? " auth-section--solo" : ""}`} ref={authRef}>
          <div className="section-head">
            <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
            {!authOnly && <p>Secure access for patients, doctors, and caregivers.</p>}
          </div>
          <div className={`auth-grid${authOnly ? " auth-grid--solo" : ""}`}>
            <div className="auth-card">
              <div className="tab-header">
                <button
                  type="button"
                  className={mode === "login" ? "active" : ""}
                  onClick={() => setMode("login")}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={mode === "signup" ? "active" : ""}
                  onClick={() => setMode("signup")}
                >
                  Sign Up
                </button>
              </div>

              {message.text && (
                <div className={`form-message ${message.type === "error" ? "error" : "success"}`}>{message.text}</div>
              )}

              {mode === "login" ? (
                <form onSubmit={handleLoginSubmit} className="auth-form">
                  {!authOnly && (
                    <>
                      <h2>Welcome back</h2>
                      <p className="subtitle">Login to continue your MediusCare journey.</p>
                    </>
                  )}

                  <label className="field">
                    <span>Email</span>
                    <div className="input-wrap">
                      <FiMail />
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={loginData.email}
                        onChange={(e) => setLoginData((prev) => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>
                    {loginValidation.email && <small className="error-text">{loginValidation.email}</small>}
                  </label>

                  <label className="field">
                    <span>Password</span>
                    <div className="input-wrap">
                      <FiLock />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={loginData.password}
                        onChange={(e) => setLoginData((prev) => ({ ...prev, password: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                    {loginValidation.password && <small className="error-text">{loginValidation.password}</small>}
                  </label>

                  <div className="form-row">
                    <label className="remember-me">
                      <input
                        type="checkbox"
                        checked={loginData.rememberMe}
                        onChange={(e) => setLoginData((prev) => ({ ...prev, rememberMe: e.target.checked }))}
                      />
                      Remember me
                    </label>
                  </div>

                  <button className="primary-btn" type="submit" disabled={loading}>
                    {loading ? <span className="spinner" /> : "Sign In"}
                  </button>
                  <button className="secondary-btn" type="button" onClick={() => setMode("signup")}>
                    Create account <FiArrowRight />
                  </button>
                  <p className="switch-text">
                    Do not have an account?{" "}
                    <button type="button" onClick={() => setMode("signup")}>
                      Sign Up
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={handleSignupSubmit} className="auth-form">
                  {!authOnly && (
                    <>
                      <h2>Create account</h2>
                      <p className="subtitle">Start your secure and connected healthcare experience.</p>
                    </>
                  )}

                  <label className="field">
                    <span>Full Name</span>
                    <div className="input-wrap">
                      <FiUser />
                      <input
                        type="text"
                        placeholder="Enter full name"
                        value={signupData.fullName}
                        onChange={(e) => setSignupData((prev) => ({ ...prev, fullName: e.target.value }))}
                        required
                      />
                    </div>
                    {signupValidation.fullName && <small className="error-text">{signupValidation.fullName}</small>}
                  </label>

                  <label className="field">
                    <span>Email</span>
                    <div className="input-wrap">
                      <FiMail />
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={signupData.email}
                        onChange={(e) => setSignupData((prev) => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>
                    {signupValidation.email && <small className="error-text">{signupValidation.email}</small>}
                  </label>

                  <label className="field">
                    <span>Password</span>
                    <div className="input-wrap">
                      <FiLock />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Create password"
                        value={signupData.password}
                        onChange={(e) => setSignupData((prev) => ({ ...prev, password: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                    {signupValidation.password && <small className="error-text">{signupValidation.password}</small>}
                    {signupData.password && (
                      <small className={`strength ${passwordStrength.label.toLowerCase()}`}>
                        Password strength: {passwordStrength.label}
                      </small>
                    )}
                  </label>

                  <label className="field">
                    <span>Confirm Password</span>
                    <div className="input-wrap">
                      <FiLock />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm password"
                        value={signupData.confirmPassword}
                        onChange={(e) => setSignupData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label="Toggle confirm password visibility"
                      >
                        {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                      </button>
                    </div>
                    {signupValidation.confirmPassword && (
                      <small className="error-text">{signupValidation.confirmPassword}</small>
                    )}
                  </label>

                  <label className="field">
                    <span>Role Selection</span>
                    <div className="input-wrap">
                      <FiUsers />
                      <select
                        value={signupData.role}
                        onChange={(e) => setSignupData((prev) => ({ ...prev, role: e.target.value }))}
                      >
                        <option value="patient">Patient</option>
                        <option value="doctor">Doctor</option>
                        <option value="caregiver">Caregiver</option>
                      </select>
                    </div>
                  </label>

                  {signupData.role === "doctor" && (
                    <>
                      <label className="field">
                        <span>Specialization</span>
                        <div className="input-wrap">
                          <FiActivity />
                          <input
                            type="text"
                            placeholder="e.g. Endocrinology"
                            value={signupData.specialization}
                            onChange={(e) => setSignupData((prev) => ({ ...prev, specialization: e.target.value }))}
                            required
                          />
                        </div>
                        {signupValidation.specialization && (
                          <small className="error-text">{signupValidation.specialization}</small>
                        )}
                      </label>

                      <label className="field">
                        <span>Upload proof document (PDF/Image/Doc)</span>
                        <input
                          className="file-input"
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                          onChange={(e) => setDoctorProofFile(e.target.files?.[0] || null)}
                          required
                        />
                        {doctorProofFile && <small className="strength medium">Selected: {doctorProofFile.name}</small>}
                        {signupValidation.doctorProof && <small className="error-text">{signupValidation.doctorProof}</small>}
                      </label>
                    </>
                  )}

                  <button className="primary-btn" type="submit" disabled={loading}>
                    {loading ? <span className="spinner" /> : "Create Account"}
                  </button>
                  <div className="auth-note">
                    <FiCheckCircle />
                    <span>Secure signup using email and role-based access.</span>
                  </div>
                  <p className="switch-text">
                    Already have an account?{" "}
                    <button type="button" onClick={() => setMode("login")}>
                      Login
                    </button>
                  </p>
                </form>
              )}
            </div>
            {!authOnly && (
            <aside className="auth-side">
              <figure className="auth-side-photo">
                <MediascapeImage
                  src={MEDIA.featureConsult}
                  alt={MEDIA_ALT.featureConsult}
                  sizes="(max-width: 1120px) 92vw, 420px"
                />
              </figure>
              <h3>Why teams trust MediusCare</h3>
              <ul>
                <li>Role-based secure access for each user type</li>
                <li>Real-time monitoring with proactive risk alerts</li>
                <li>AI-assisted insights with clinician review workflows</li>
                <li>Centralized care experience for patient, doctor, and caregiver</li>
              </ul>
              <div className="auth-side-note">
                Need quick help? Call us at <strong>+92 3315344125</strong>
              </div>
            </aside>
            )}
          </div>
        </section>
        )}

        {marketingOnly && (
          <section className="site-section home-cta-band">
            <h2>Ready to get started?</h2>
            <p>Sign in or create an account to access your care workspace.</p>
            <div className="home-cta-actions">
              <Link to="/signup" className="primary-btn">Create account</Link>
              <Link to="/login" className="secondary-btn">Sign in</Link>
            </div>
          </section>
        )}

        {!authOnly && (
        <footer className="site-footer" ref={contactRef}>
          <div>
            <h3>MediusCare</h3>
            <p>Smarter healthcare monitoring with connected AI-powered workflows.</p>
          </div>
          <div>
            <h4>Contact</h4>
            <p><FiMail /> support@mediuscare.local</p>
            <p><FiPhone /> +92 3315344125</p>
          </div>
          <p className="copyright">© {new Date().getFullYear()} MediusCare. All rights reserved.</p>
        </footer>
        )}
      </main>
    </div>
  );
};

export default AuthLanding;
