// Meet the team: faculty and student cards over a night-platform photograph.
// Motion: faculty slide in, dock under the top bar on scroll, students sharpen into view together,
// the background follows the pointer, and profiles open with a genie effect.
import { h, s, $, $$ } from "./ui.js?v=202611091943";

const IMG = "img/team/";
const REDUCED = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE = () => window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

// Names as they appear on LinkedIn (Anittya Rahul Lele and Hritankar Das have no LinkedIn profile).
const FACULTY = [
  {
    id: "patra", name: "Dr. Pradipta Patra", tag: "Approving faculty",
    role: "Associate Professor, Decision Sciences", org: "Indian Institute of Management Sirmaur",
    line: "Associate Professor in the Decision Sciences area at IIM Sirmaur.",
    bio: [
      "Dr. Pradipta Patra is an Associate Professor in the Decision Sciences area at IIM Sirmaur, where he teaches Quantitative Methods, Business Forecasting and Analytics, Advanced Analytics and Multivariate Statistics for Managerial Decision Making.",
      "His research covers quantitative modelling of supply chains and supply chain contracts, service operations, reliability, maintenance, risk analysis and applications of machine learning, published in journals such as Annals of Operations Research and IEEE Transactions on Engineering Management. He has served as Chairperson, Programmes and Research at IIM Sirmaur, and earlier taught at Narsee Monjee (Hyderabad), Woxsen School of Business, IMI Bhubaneswar and IIM Sambalpur.",
    ],
    linkedin: "https://www.linkedin.com/in/dr-pradipta-patra-974128338/",
  },
  {
    id: "gautam", name: "Dr. Vibhu Gautam", tag: "Course faculty",
    role: "Professor of Practice, Computer Science", org: "UPES, Dehradun",
    line: "Professor of Practice in Computer Science at UPES, Dehradun.",
    bio: [
      "Dr. Vibhu Gautam is a Professor of Practice in Computer Science at UPES, Dehradun. He brings more than ten years of experience in data science, business analytics and DevOps, designing and deploying scalable solutions in complex environments.",
      "His expertise spans MLOps, cloud model deployment and containerisation with Docker and Kubernetes. He is a recipient of the Marie Skłodowska-Curie Actions (MSCA) Early-Stage Researcher fellowship (2019).",
    ],
    linkedin: "https://www.linkedin.com/in/vibhugautam7/",
  },
];

const STUDENTS = [
  {
    id: "aakarsh", name: "Aakarsh Kapoor", roll: "BMS25001", designer: true,
    line: "BMS student at IIM Sirmaur and member of its Admissions Committee.",
    bio: ["Aakarsh Kapoor is a BMS student (2025–2029) at IIM Sirmaur and a member of the institute’s Admissions Committee and of Finserve, its Finance and Economics Club. He secured AIR-1 in IIM Rohtak’s “Marketing Ace” and explores aerospace propulsion systems (GE, P&W, CFM)."],
    linkedin: "https://www.linkedin.com/in/aakarsh-kapoor/",
  },
  {
    id: "bonisha", name: "Bonisha Makwana", roll: "BMS25032",
    line: "Marketing and HR enthusiast, BMS’29 at IIM Sirmaur.",
    bio: ["Bonisha Makwana is a BMS’29 student at IIM Sirmaur and a marketing and HR enthusiast. She is a former HR intern at Pixirain and an aspiring entrepreneur."],
    linkedin: "https://www.linkedin.com/in/bonisha-makwana-883a8b389",
  },
  {
    id: "anittya", name: "Anittya Rahul Lele", roll: "BMS25015",
    line: "Second-year BMS student at IIM Sirmaur, from Nagpur.",
    bio: ["Anittya Rahul Lele is a 20-year-old undergraduate from Nagpur, Maharashtra, in the second year of the Bachelor of Management Studies (BMS) programme at the Indian Institute of Management (IIM) Sirmaur."],
  },
  {
    id: "ashish", name: "Ashish Ranjan", roll: "BMS25024",
    line: "Second-year BMS student at IIM Sirmaur, eager to learn and improve.",
    bio: ["Ashish Ranjan is a second-year Bachelor of Management Studies (BMS) student at IIM Sirmaur, eager to learn and improve. He interned as a Financial Analyst at Edify Equity (July–August 2026), working on how the stock market works, F&O, patterns and indicators, and fundamental and technical analysis."],
    linkedin: "https://www.linkedin.com/in/ashish-ranjan-b8528b388",
  },
  {
    id: "hritankar", name: "Hritankar Das", roll: "BMS25058",
    line: "Entrepreneur and BMS student; runs a digital marketing agency.",
    bio: ["Hritankar Das is an entrepreneur and BMS student at IIM Sirmaur. He runs a digital marketing agency that helps businesses scale, specialising in Meta Ads, sales funnels and client acquisition, with the goal of helping businesses generate more leads, acquire customers and increase revenue. He is passionate about entrepreneurship, marketing and building scalable businesses."],
  },
  {
    id: "jai", name: "Jai Surya", roll: "BMS25060",
    line: "BMS student at IIM Sirmaur, curious about technology and marketing.",
    bio: ["Jai Surya is a BMS student at IIM Sirmaur with summer internship experience at Air India. He is curious about technology and marketing."],
    linkedin: "https://www.linkedin.com/in/jai-surya-99b8a5263/",
  },
  {
    id: "praneeth", name: "Praneeth Gottemukkula", roll: "BMS25048",
    line: "BMS student at IIM Sirmaur and a professional guitarist.",
    bio: ["Praneeth Gottemukkula is a BMS student at IIM Sirmaur and a professional guitarist."],
    linkedin: "https://www.linkedin.com/in/praneeth-gottemukkula-7103b33b8",
  },
  {
    id: "adya", name: "Adya Jain", roll: "BMS25009",
    line: "Student at IIM Sirmaur in the BMS programme.",
    bio: ["Adya Jain is a student at IIM Sirmaur in the Bachelor of Management Studies programme. She attended BE 10x’s workshop on AI for daily use, and her skills include Microsoft Office, presentation, event planning and artificial intelligence."],
    linkedin: "https://www.linkedin.com/in/adya-jain-9635083a0/",
  },
];
const PEOPLE = [...FACULTY.map(p => ({ ...p, faculty: true })), ...STUDENTS];
const byId = Object.fromEntries(PEOPLE.map(p => [p.id, p]));

let app, root, built = false, active = false, intro = null, triggers = [], reveal = null;
const ptr = { tx: 0, ty: 0, x: 0, y: 0 };
let raf = 0, bgEls = null;

// ---------- Build ----------
const photo = (p, cls = "tm-ph", eager = false) =>
  h("div", { class: cls }, h("img", { src: `${IMG}${p.id}.jpg`, alt: `Photo of ${p.name}`, loading: eager ? "eager" : "lazy", decoding: "async", width: 720, height: 900 }));

const openable = (el, id) => {
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", `Open profile: ${byId[id].name}`);
  el.dataset.id = id;
  el.addEventListener("click", () => open(id, el));
  el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(id, el); } });
  return el;
};

function facultyCard(p) {
  return openable(h("div", { class: "tm-pcard" },
    h("div", { class: "tm-in" },
      photo(p, "tm-ph", true),
      h("div", { class: "tm-pc" },
        h("span", { class: "tm-tag y" }, p.tag),
        h("h3", { class: "tm-name" }, p.name),
        h("p", { class: "tm-role" }, p.role),
        h("p", { class: "tm-org" }, p.org),
        h("p", { class: "tm-line" }, p.line),
        h("span", { class: "tm-open" }, "Tap to open profile →")))), p.id);
}

function dockCard(p) {
  return openable(h("div", { class: "tm-dcard" },
    photo(p, "tm-dph", true),
    h("div", {},
      h("span", { class: "tm-tag y" }, p.tag),
      h("b", { class: "tm-name" }, p.name),
      h("span", { class: "tm-drole" }, `${p.role} · ${p.org}`))), p.id);
}

function studentCard(p, i) {
  if (p.designer) {
    return openable(h("div", { class: "tm-card tm-hero" },
      h("div", { class: "tm-in" },
        h("span", { class: "tm-tag y tm-over" }, "Designer"),
        photo(p),
        h("div", { class: "tm-cc" },
          h("h3", { class: "tm-name" }, p.name),
          h("span", { class: "tm-sub" }, `Designed by · ${p.roll}`),
          h("p", { class: "tm-line" }, p.line)))), p.id);
  }
  return openable(h("div", { class: `tm-card${i % 2 ? " low" : ""}` },
    h("div", { class: "tm-in" },
      photo(p),
      h("h3", { class: "tm-name" }, p.name),
      h("span", { class: "tm-tag r" }, "Teammate"),
      h("p", { class: "tm-line" }, p.line))), p.id);
}

function build() {
  root = $("#v-team");
  const [patra, gautam] = FACULTY;
  root.append(
    h("div", { class: "tm-bg", "aria-hidden": "true" },
      h("div", { class: "tm-photo" }), h("div", { class: "tm-mist m1" }), h("div", { class: "tm-mist m2" }), h("div", { class: "tm-shade" })),
    h("div", { class: "tm-dock", "aria-label": "Faculty" },
      h("div", { class: "tm-dock-in" }, dockCard(patra), dockCard(gautam), s("svg", { class: "tm-dwire", "aria-hidden": "true" }))),
    h("div", { class: "tm-page" },
      h("div", { class: "tm-top" },
        h("header", { class: "tm-head" },
          h("div", {},
            h("span", { class: "tm-chip" }, "The people behind Kalyon · ", h("span", { class: "hi" }, "काल + नियोजन")),
            h("h1", { class: "tm-h1" },
              h("span", { class: "ln" }, h("span", {}, "THE MINDS")),
              h("span", { class: "ln" }, h("span", {}, h("s", {}, "BEHIND THE "), h("em", {}, "FORECAST."))))),
          h("p", { class: "tm-lead" }, "Our two faculty members and the eight students of IIM Sirmaur who built Kalyon. ", h("b", {}, "Tap any card"), " to meet them.")),
        h("p", { class: "tm-thanks" }, h("span", { class: "tm-mark" }, "With thanks to our faculty, for giving us the opportunity to work on such a great project."))),
      h("div", { class: "tm-fac" }, facultyCard(patra), facultyCard(gautam)),
      h("div", { class: "tm-branch" },
        s("svg", { class: "tm-bsvg", "aria-hidden": "true" }),
        h("div", { class: "tm-cue", "aria-hidden": "true" }, h("span", {}, "Scroll"), h("i", {})),
        h("div", { class: "tm-label" }, "The student team")),
      h("div", { class: "tm-grid" },
        ...STUDENTS.map((p, i) => studentCard(p, i)),
        h("div", { class: "tm-card tm-hint" }, h("div", { class: "tm-in" }, h("b", {}, "Tap any card"), h("span", {}, "to read a short note about that person.")))),
      h("div", { class: "tm-bar" },
        h("div", {}, h("b", {}, "See what we built"), h("span", {}, "The forecast console, step by step, from the replay to the evidence.")),
        h("button", { class: "tm-go", onclick: () => app.route("control") }, "Open Control room →")),
      h("p", { class: "tm-credit" }, "Background photo: Aakarsh Kapoor")),
    buildModal());

  // pointer tilt on cards
  $$(".tm-in, .tm-dcard", root).forEach(el => {
    el.addEventListener("pointermove", e => {
      if (!FINE() || REDUCED()) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${(px * 7).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-py * 6).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
    });
    el.addEventListener("pointerleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
  });
  window.addEventListener("pointermove", e => {
    if (!active) return;
    ptr.tx = (e.clientX / innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  window.addEventListener("resize", () => { if (active) layout(); });
  built = true;
}

// ---------- Layout: header offset, branch and dock wire ----------
function layout() {
  const bar = $(".hud-top");
  document.documentElement.style.setProperty("--tm-top", `${bar ? bar.offsetHeight : 0}px`);
  // branch from the two faculty cards to the label
  const br = $(".tm-branch", root), svg = $(".tm-bsvg", root);
  const [a, b] = $$(".tm-pcard", root);
  const W = br.clientWidth, H = br.clientHeight;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const cx = W / 2, ly = H - 19, lw = 112;
  const grad = s("linearGradient", { id: "tm-bus", gradientUnits: "userSpaceOnUse", x1: 0, x2: W, y1: 0, y2: 0 },
    s("stop", { offset: 0, "stop-color": "#f3f1ea", "stop-opacity": 0 }),
    s("stop", { offset: 0.18, "stop-color": "#f3f1ea", "stop-opacity": 0.45 }),
    s("stop", { offset: 0.5, "stop-color": "#f3f1ea", "stop-opacity": 0.9 }),
    s("stop", { offset: 0.82, "stop-color": "#f3f1ea", "stop-opacity": 0.45 }),
    s("stop", { offset: 1, "stop-color": "#f3f1ea", "stop-opacity": 0 }));
  svg.append(s("defs", {}, grad));
  const stacked = Math.abs(a.offsetTop - b.offsetTop) > 20;
  if (!stacked) {
    const x1 = a.offsetLeft + a.offsetWidth / 2, x2 = b.offsetLeft + b.offsetWidth / 2;
    svg.append(
      s("path", { class: "tm-stem", pathLength: 1, d: `M${x1} 0 C${x1} ${H * 0.62} ${cx - lw * 1.6} ${ly} ${cx - lw} ${ly}` }),
      s("path", { class: "tm-stem", pathLength: 1, d: `M${x2} 0 C${x2} ${H * 0.62} ${cx + lw * 1.6} ${ly} ${cx + lw} ${ly}` }),
      s("circle", { class: "tm-node", cx: x1, cy: 3, r: 4.5 }), s("circle", { class: "tm-node", cx: x2, cy: 3, r: 4.5 }));
  } else {
    svg.append(s("path", { class: "tm-stem", pathLength: 1, d: `M${cx} 0 L${cx} ${ly - 18}` }), s("circle", { class: "tm-node", cx, cy: 3, r: 4.5 }));
  }
  svg.append(s("path", { class: "tm-bus", pathLength: 1, stroke: "url(#tm-bus)", d: `M0 ${ly} L${W} ${ly}` }));

  // little hanging wire under the docked faculty cards
  const dw = $(".tm-dwire", root), din = $(".tm-dock-in", root);
  const [da, db] = $$(".tm-dcard", root);
  const DW = din.clientWidth, DH = 34;
  dw.setAttribute("viewBox", `0 0 ${DW} ${DH}`); dw.setAttribute("width", DW); dw.setAttribute("height", DH);
  while (dw.firstChild) dw.removeChild(dw.firstChild);
  if (Math.abs(da.offsetTop - db.offsetTop) < 10) {
    const x1 = da.offsetLeft + da.offsetWidth / 2, x2 = db.offsetLeft + db.offsetWidth / 2, c = DW / 2;
    dw.append(
      s("path", { d: `M${x1} 0 C${x1} 14 ${c - 60} 16 ${c} 16 C${c + 60} 16 ${x2} 14 ${x2} 0` }),
      s("path", { class: "drop", d: `M${c} 16 L${c} ${DH}` }),
      s("circle", { cx: c, cy: 16, r: 3.5 }));
  }
}

// ---------- Scroll choreography ----------
function setupScroll() {
  const gsap = window.gsap, ST = window.ScrollTrigger;
  if (!gsap || !ST) { root.classList.add("tm-static"); return; }
  gsap.registerPlugin(ST);
  const top = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tm-top")) || 0);
  const cards = $$(".tm-grid .tm-card", root);

  // faculty: as the full cards reach the top bar they shrink away into the docked cards
  const dockTl = gsap.timeline({ scrollTrigger: {
    trigger: ".tm-fac", start: () => `top top+=${top() + 8}`, end: () => `bottom-=60 top+=${top()}`, scrub: 0.35,
    onUpdate: self => root.classList.toggle("docked", self.progress > 0.45),
  } });
  dockTl.to(".tm-fac", { opacity: 0, scale: 0.9, transformOrigin: "50% 0%", ease: "power1.in" }, 0)
    .fromTo(".tm-dock", { autoAlpha: 0, y: -18 }, { autoAlpha: 1, y: 0, ease: "power2.out" }, 0.15);
  triggers.push(dockTl.scrollTrigger);

  // header copy drifts away as you scroll
  const headTl = gsap.to(".tm-top", { opacity: 0, y: -50, ease: "none",
    scrollTrigger: { trigger: ".tm-top", start: () => `top top+=${top()}`, end: "bottom top", scrub: true } });
  triggers.push(headTl.scrollTrigger);
  const cueTl = gsap.to(".tm-cue", { opacity: 0, ease: "none", scrollTrigger: { trigger: ".tm-fac", start: "bottom 98%", end: "bottom 80%", scrub: true } });
  triggers.push(cueTl.scrollTrigger);

  // the branch draws itself down to the student team
  const bt = gsap.timeline({ scrollTrigger: { trigger: ".tm-branch", start: "top 88%", end: "bottom 62%", scrub: 0.5 } });
  bt.fromTo(".tm-stem", { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none", duration: 1 })
    .fromTo(".tm-node", { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0)
    .fromTo(".tm-bus", { strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: 1, ease: "none", duration: 0.6 }, 0.7)
    .fromTo(".tm-label", { opacity: 0, y: 10, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.4 }, 0.8);
  triggers.push(bt.scrollTrigger);

  // every student card at once: blurred to sharp
  if (REDUCED()) return;
  gsap.set(cards, { opacity: 0, filter: "blur(18px)", y: 46, scale: 0.97 });
  reveal = gsap.to(cards, { opacity: 1, filter: "blur(0px)", y: 0, scale: 1, duration: 1.05, ease: "power3.out", paused: true });
  triggers.push(ST.create({ trigger: ".tm-grid", start: "top 84%",
    onEnter: () => reveal.play(), onLeaveBack: () => reveal.reverse() }));
  const barTl = gsap.from(".tm-bar", { opacity: 0, y: 30, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: ".tm-bar", start: "top 92%", toggleActions: "play none none reverse" } });
  triggers.push(barTl.scrollTrigger);
}

function playIntro() {
  const gsap = window.gsap;
  if (intro) { intro.progress(1).kill(); intro = null; }
  if (!gsap || REDUCED()) return;
  const [a, b] = $$(".tm-pcard", root);
  const far = Math.max(innerWidth * 0.65, 500);
  intro = gsap.timeline({ defaults: { ease: "power3.out" } });
  intro.from(".tm-chip", { y: 16, opacity: 0, duration: 0.5 })
    .from(".tm-h1 .ln > span", { yPercent: 110, duration: 0.9, stagger: 0.1, ease: "power4.out" }, "<0.05")
    .from(".tm-lead", { y: 14, opacity: 0, duration: 0.6 }, "<0.3")
    .from(".tm-thanks", { y: 18, opacity: 0, duration: 0.6 }, "<0.1")
    .fromTo(".tm-mark", { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 1.1, ease: "power2.inOut" }, "<0.25")
    .from(a, { x: -far, opacity: 0, rotationY: 14, transformPerspective: 1400, duration: 1.15, ease: "power4.out", clearProps: "transform" }, "<-0.55")
    .from(b, { x: far, opacity: 0, rotationY: -14, transformPerspective: 1400, duration: 1.15, ease: "power4.out", clearProps: "transform" }, "<")
    .from(".tm-cue > *", { y: 10, opacity: 0, duration: 0.5, stagger: 0.08 }, "-=0.35");
}

// ---------- Background: follows the pointer and drifts with scroll ----------
function loop() {
  raf = 0;
  if (!active) return;
  const k = REDUCED() ? 1 : 0.06;
  if (!FINE() || REDUCED()) { ptr.tx = 0; ptr.ty = 0; }
  ptr.x += (ptr.tx - ptr.x) * k;
  ptr.y += (ptr.ty - ptr.y) * k;
  const max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
  const sp = Math.min(scrollY / max, 1);
  const { ph, m1, m2 } = bgEls || (bgEls = { ph: $(".tm-photo", root), m1: $(".tm-mist.m1", root), m2: $(".tm-mist.m2", root) });
  const sy = REDUCED() ? 0 : (0.5 - sp) * 70;
  ph.style.transform = `translate3d(${(-ptr.x * 26).toFixed(2)}px, ${(-ptr.y * 18 + sy).toFixed(2)}px, 0) scale(1.06)`;
  m1.style.transform = `translate3d(${(ptr.x * 44).toFixed(2)}px, ${(ptr.y * 26).toFixed(2)}px, 0)`;
  m2.style.transform = `translate3d(${(-ptr.x * 70).toFixed(2)}px, ${(-ptr.y * 36 + sy * 0.6).toFixed(2)}px, 0)`;
  raf = requestAnimationFrame(loop);
}

// ---------- Profile panel with genie open/close ----------
let modal, panel, genie, gpath, current = null, sourceEl = null, busy = false, lastFocus = null;

function buildModal() {
  modal = h("div", { class: "tm-modal", hidden: true },
    h("div", { class: "tm-scrim", onclick: () => close() }),
    genie = s("svg", { class: "tm-genie", "aria-hidden": "true" }, gpath = s("path", {})),
    panel = h("div", { class: "tm-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "tm-pname" },
      h("button", { class: "tm-x", "aria-label": "Close profile", onclick: () => close() }, "✕"),
      h("div", { class: "tm-pph" }, h("img", { alt: "" })),
      h("div", { class: "tm-pbody" },
        h("span", { class: "tm-tag y tm-ptag" }),
        h("h2", { class: "tm-pname", id: "tm-pname" }),
        h("p", { class: "tm-prole" }),
        h("div", { class: "tm-psec" }, "About"),
        h("div", { class: "tm-pbio" }),
        h("div", { class: "tm-pact" },
          h("a", { class: "tm-li", target: "_blank", rel: "noopener" }, "LinkedIn ↗"),
          h("button", { class: "tm-prev", onclick: () => step(-1) }, "← Previous"),
          h("button", { class: "tm-next", onclick: () => step(1) })))));
  modal.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Tab") {
      const f = $$("button, a[href]", panel).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // keep the page still behind the panel; the panel itself scrolls if its text is long
  const still = e => { if (!panel.contains(e.target)) e.preventDefault(); };
  modal.addEventListener("wheel", still, { passive: false });
  modal.addEventListener("touchmove", still, { passive: false });
  let sx = null;
  panel.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  panel.addEventListener("touchend", e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  });
  return modal;
}

function fill(p) {
  const i = PEOPLE.indexOf(p), next = PEOPLE[(i + 1) % PEOPLE.length];
  const img = $(".tm-pph img", panel);
  img.src = `${IMG}${p.id}.jpg`; img.alt = `Photo of ${p.name}`;
  const tag = $(".tm-ptag", panel);
  tag.textContent = p.faculty ? p.tag : p.designer ? "Designer" : "Teammate";
  tag.className = `tm-tag tm-ptag ${p.faculty || p.designer ? "y" : "r"}`;
  $(".tm-pname", panel).textContent = p.name;
  $(".tm-prole", panel).textContent = p.faculty ? `${p.role} · ${p.org}` : `${p.designer ? "Designed by" : "Teammate"} · ${p.roll} · IIM Sirmaur`;
  const bio = $(".tm-pbio", panel);
  while (bio.firstChild) bio.removeChild(bio.firstChild);
  p.bio.forEach(t => bio.append(h("p", {}, t)));
  const li = $(".tm-li", panel);
  if (p.linkedin) { li.href = p.linkedin; li.hidden = false; li.setAttribute("aria-label", `${p.name} on LinkedIn (opens in a new tab)`); }
  else { li.removeAttribute("href"); li.hidden = true; }
  $(".tm-next", panel).textContent = `Next: ${next.name} →`;
  panel.classList.toggle("is-fac", !!p.faculty);
}

// The element a person's panel should pour out of (docked card when the faculty are docked).
function sourceFor(id) {
  if (byId[id].faculty && root.classList.contains("docked")) return $(`.tm-dcard[data-id="${id}"]`, root);
  return $(`.tm-pcard[data-id="${id}"], .tm-card[data-id="${id}"]`, root);
}

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Funnel outline between the card (C) and the panel (P) at time t: the edge furthest from the card
// leads and the tail stays narrow near the card, like the macOS genie effect.
function genieShape(C, P, t) {
  const N = 32, L = [], R = [];
  const lead = (C.top + C.height / 2) > (P.top + P.height / 2) ? 1 : -1; // card below the panel: top edge leads
  for (let i = 0; i <= N; i++) {
    const v = i / N, d = lead > 0 ? v : 1 - v;
    const e = ease(clamp((t - d * 0.42) / 0.58));
    const ex = Math.pow(e, 1.7);
    const y = C.top + v * C.height + (P.top + v * P.height - (C.top + v * C.height)) * e;
    const xl = C.left + (P.left - C.left) * ex;
    const xr = C.right + (P.right - C.right) * ex;
    L.push(`${xl.toFixed(1)} ${y.toFixed(1)}`); R.push(`${xr.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M${L.join(" L")} L${R.reverse().join(" L")} Z`;
}

function runGenie(C, P, from, to, dur) {
  return new Promise(res => {
    const gsap = window.gsap, o = { t: from };
    genie.style.opacity = 1;
    gpath.setAttribute("d", genieShape(C, P, from));
    gsap.to(o, { t: to, duration: dur, ease: "none", onUpdate: () => gpath.setAttribute("d", genieShape(C, P, o.t)), onComplete: res });
  });
}

async function open(id, el) {
  if (busy || !byId[id]) return;
  busy = true;
  lastFocus = el || document.activeElement;
  current = byId[id];
  sourceEl = el || sourceFor(id);
  fill(current);
  modal.hidden = false;
    const gsap = window.gsap;
  if (!gsap || REDUCED()) {
    panel.style.visibility = "visible"; panel.style.opacity = 1;
    busy = false; $(".tm-x", panel).focus(); return;
  }
  panel.style.visibility = "hidden"; panel.style.opacity = 0;
  const content = $$(".tm-pph, .tm-pbody > *, .tm-x", panel);
  gsap.set(content, { opacity: 0 });
  const P = panel.getBoundingClientRect();
  const C = (sourceEl.querySelector(".tm-in") || sourceEl).getBoundingClientRect();
  gsap.fromTo(".tm-scrim", { opacity: 0 }, { opacity: 1, duration: 0.45 });
  sourceEl.classList.add("tm-pouring");
  await runGenie(C, P, 0, 1, 0.62);
  panel.style.visibility = "visible";
  gsap.to(panel, { opacity: 1, duration: 0.14 });
  gsap.to(genie, { opacity: 0, duration: 0.18, delay: 0.06 });
  gsap.fromTo(".tm-pph", { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" });
  gsap.fromTo($$(".tm-pbody > *, .tm-x", panel), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: "power3.out", delay: 0.05 });
  sourceEl.classList.remove("tm-pouring");
  busy = false;
  $(".tm-x", panel).focus({ preventScroll: true });
}

async function close() {
  if (busy || modal.hidden) return;
  busy = true;
  const gsap = window.gsap;
  const done = () => {
    modal.hidden = true; panel.style.opacity = 0; panel.style.visibility = "hidden";
        busy = false;
    const back = sourceFor(current.id) || lastFocus;
    back && back.focus && back.focus({ preventScroll: true });
  };
  if (!gsap || REDUCED()) { done(); return; }
  const P = panel.getBoundingClientRect();
  const src = sourceFor(current.id) || sourceEl;
  const C = (src.querySelector(".tm-in") || src).getBoundingClientRect();
  gsap.to($$(".tm-pph, .tm-pbody > *, .tm-x", panel), { opacity: 0, duration: 0.14 });
  await new Promise(r => setTimeout(r, 120));
  gpath.setAttribute("d", genieShape(C, P, 1));
  genie.style.opacity = 1;
  panel.style.opacity = 0;
  gsap.to(".tm-scrim", { opacity: 0, duration: 0.5, delay: 0.1 });
  await runGenie(C, P, 1, 0, 0.55);
  gsap.to(genie, { opacity: 0, duration: 0.12 });
  done();
}

function step(dir) {
  if (busy || !current) return;
  const i = PEOPLE.indexOf(current);
  current = PEOPLE[(i + dir + PEOPLE.length) % PEOPLE.length];
  const gsap = window.gsap;
  if (!gsap || REDUCED()) { fill(current); return; }
  busy = true;
  const parts = $$(".tm-pph, .tm-pbody > *", panel);
  gsap.to(parts, { opacity: 0, x: -24 * dir, duration: 0.18, ease: "power2.in", onComplete: () => {
    fill(current);
    gsap.fromTo(parts, { opacity: 0, x: 24 * dir }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.03, ease: "power3.out", onComplete: () => { busy = false; } });
  } });
}

// ---------- View lifecycle ----------
async function enter() {
  active = true;
  document.body.classList.add("team-mode");
  layout();
  if (!triggers.length) setupScroll();
  triggers.forEach(t => t.enable());
  if (reveal) reveal.progress(0).pause();
  if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  if (!raf) raf = requestAnimationFrame(loop);
  try { await Promise.race([document.fonts.load('700 1em "Kalam"'), new Promise(r => setTimeout(r, 700))]); } catch { /* fonts API missing */ }
  if (!active) return;
  layout();
  if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  playIntro();
}

function leave() {
  active = false;
  document.body.classList.remove("team-mode");
  root.classList.remove("docked");
  triggers.forEach(t => t.disable());
  if (!modal.hidden) { modal.hidden = true; busy = false; }
}

export function mount(a) {
  app = a;
  build();
  app.on("view", v => {
    if (v === "team") {
      if (!$("#loader").classList.contains("done")) { document.body.classList.add("team-mode"); return; }
      enter();
    } else if (active || document.body.classList.contains("team-mode")) leave();
  });
}
