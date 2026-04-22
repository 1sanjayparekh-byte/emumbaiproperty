import { useState, useRef, useEffect } from "react";

// ============ PERSISTENT STORAGE ============
async function dbGet(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function dbSet(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {}
}

// ============ HELPERS ============
function formatPrice(price, category) {
  if (!price) return "N/A";
  if (category === "Rent") return `₹${Math.round(price / 1000)}K/mo`;
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
  return `₹${(price / 100000).toFixed(0)} L`;
}
function formatRange(min, max, cat) {
  if (!min && !max) return "N/A";
  if (min === max || !max) return formatPrice(min || max, cat);
  return `${formatPrice(min, cat)} – ${formatPrice(max, cat)}`;
}

const SLOTS = [
  "Sat 10:00 AM","Sat 11:30 AM","Sat 2:00 PM","Sat 4:00 PM",
  "Sun 10:00 AM","Sun 11:30 AM","Sun 2:00 PM","Sun 4:00 PM"
];

const DEFAULT_PROPERTIES = [
  { id: 1, name: "Chandak 34 Park Estate", developer: "Chandak Group", location: "Goregaon West", area: "Mumbai", type: ["2 BHK","3 BHK"], propertyKind: "residential", category: "Sale", priceMin: 16000000, priceMax: 28000000, possession: "Dec 2025", amenities: ["Pool","Gym","Clubhouse","Security"], highlights: "5 min from Western Express Highway", contact: "9876543210", tenantType: "any", available: 12 },
  { id: 2, name: "Hiranandani Gardens", developer: "Hiranandani", location: "Powai", area: "Mumbai", type: ["1 BHK","2 BHK","3 BHK"], propertyKind: "residential", category: "Sale", priceMin: 9500000, priceMax: 35000000, possession: "Ready", amenities: ["Mall","School","Hospital","Lake View"], highlights: "Powai Lake view, self-contained township", contact: "9876543211", tenantType: "any", available: 8 },
  { id: 3, name: "Lokhandwala Heights", developer: "Piramal Realty", location: "Andheri West", area: "Mumbai", type: ["1 BHK","2 BHK"], propertyKind: "residential", category: "Rent", priceMin: 45000, priceMax: 95000, possession: "Immediate", amenities: ["Gym","Terrace","Co-working","CCTV"], highlights: "Walking distance Andheri Metro", contact: "9876543212", tenantType: "family", available: 5 },
  { id: 4, name: "Oberoi Sky Garden", developer: "Oberoi Realty", location: "Borivali East", area: "Mumbai", type: ["2 BHK","3 BHK","4 BHK"], propertyKind: "residential", category: "Sale", priceMin: 22000000, priceMax: 65000000, possession: "Mar 2026", amenities: ["Infinity Pool","Spa","Sky Deck","EV Charging"], highlights: "National Park panoramic views", contact: "9876543213", tenantType: "any", available: 6 },
  { id: 5, name: "Rustomjee Urbania", developer: "Rustomjee", location: "Thane West", area: "Thane", type: ["1 BHK","2 BHK","3 BHK"], propertyKind: "residential", category: "Sale", priceMin: 6500000, priceMax: 18000000, possession: "Jun 2026", amenities: ["Sports Court","Kids Area","Supermarket"], highlights: "Near Viviana Mall", contact: "9876543214", tenantType: "any", available: 20 },
  { id: 6, name: "BKC Commercial Hub", developer: "Godrej", location: "Bandra Kurla Complex", area: "Mumbai", type: ["Office"], propertyKind: "commercial", category: "Rent", priceMin: 200000, priceMax: 500000, sqft: 1000, possession: "Immediate", amenities: ["24/7 AC","Parking","Security","Cafeteria"], highlights: "Premium BKC office space", contact: "9876543215", available: 3 },
];

// ============ AI FUNCTIONS ============
async function callClaude(messages, systemPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: systemPrompt, messages })
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function aiChat(chatHistory, properties, bookings) {
  const propText = properties.map(p =>
    `[ID:${p.id}] ${p.name} | ${p.propertyKind} | ${p.type?.join("/")} | ${p.category} | ${p.location}${p.area?", "+p.area:""} | ${formatRange(p.priceMin,p.priceMax,p.category)} | ${p.possession} | ${p.sqft?p.sqft+"sqft":""} | Tenant:${p.tenantType||"any"} | Contact:${p.contact}`
  ).join("\n");

  const system = `Tu eMumbaiProperty ka AI sales assistant hai — Mumbai real estate broker ke liye.

STYLE: Hindi/English/Hinglish jo client likhe. Short WhatsApp messages. Ek baar mein 1-2 sawaal max.

RESIDENTIAL enquiry mein poochh:
1. BHK type (1/2/3 BHK)
2. Location (Andheri, Lokhandwala, Goregaon etc.)
3. Rent ya Sale?
4. Budget?
5. Possession kab chahiye?
6. Family ya Bachelor? (sirf Rent ke liye)

COMMERCIAL enquiry mein poochh:
1. Location
2. Rent ya Sale?
3. Square feet kitne chahiye?
4. Budget?
5. Kaam kisliye (office/shop/warehouse)?

PROPERTY DATABASE (${properties.length} listings):
${propText}

BOOKING SLOTS: ${SLOTS.join(" | ")}
BOOKINGS TODAY: ${bookings}

TAGS (exactly aise use karo):
- Property suggest: [P:1] [P:2] etc (ID number)
- Booking ke liye: [BOOK:1] (ID number)
- Search karo jab poori info ho: [SEARCH]

Jo pehle pata hai dobara mat poochh. Jo client bata de use yaad rakho.`;

  return await callClaude(chatHistory, system);
}

async function aiScanScreenshot(base64) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: `WhatsApp property listing screenshot hai. Sirf JSON return karo, koi extra text nahi:
{"name":"project name ya 'Property'","developer":"builder ya ''","location":"area jaise Andheri","area":"Mumbai ya Thane","type":["2 BHK"],"propertyKind":"residential or commercial","category":"Rent or Sale","priceMin":number,"priceMax":number,"possession":"Ready or date","sqft":number or null,"amenities":["a1"],"highlights":"short note","contact":"10 digits or ''","tenantType":"family or bachelor or any","available":1}
Numbers sirf digits, koi symbol nahi. Type array mein rakho.` }
        ]
      }]
    })
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ============ SEARCH ============
function searchProps(enquiry, properties) {
  let r = [...properties];
  if (enquiry.kind) r = r.filter(p => p.propertyKind === enquiry.kind);
  if (enquiry.category) r = r.filter(p => p.category?.toLowerCase() === enquiry.category.toLowerCase());
  if (enquiry.bhk) r = r.filter(p => p.type?.some(t => t.toLowerCase().includes(enquiry.bhk.replace(" ","").toLowerCase())));
  if (enquiry.location) {
    const loc = enquiry.location.toLowerCase();
    r = r.filter(p => p.location?.toLowerCase().includes(loc) || p.area?.toLowerCase().includes(loc) || p.name?.toLowerCase().includes(loc));
  }
  if (enquiry.budget) r = r.filter(p => !p.priceMax || p.priceMax <= enquiry.budget * 1.25);
  if (enquiry.tenant && enquiry.category?.toLowerCase() === "rent") r = r.filter(p => !p.tenantType || p.tenantType === "any" || p.tenantType === enquiry.tenant);
  return r;
}

// ============ COMPONENTS ============
function Tag({ children, color = "#c9a96e" }) {
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: color + "20", color, border: `1px solid ${color}40`, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
}

function PropertyCard({ p, onBook, onDelete, compact }) {
  const [exp, setExp] = useState(false);
  const isCommercial = p.propertyKind === "commercial";
  return (
    <div style={{ background: "linear-gradient(135deg,#0d1b2a,#162436)", border: "1px solid #c9a96e35", borderRadius: 16, marginBottom: 10, overflow: "hidden", boxShadow: "0 4px 24px #00000050" }}>
      <div style={{ padding: "13px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            <div style={{ fontWeight: 800, color: "#f0e6d0", fontSize: 13, lineHeight: 1.3 }}>{p.name}</div>
            {p.developer && <div style={{ fontSize: 11, color: "#c9a96e", marginTop: 1 }}>{p.developer}</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: "#c9a96e", fontWeight: 800 }}>{formatRange(p.priceMin, p.priceMax, p.category)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2, color: p.category === "Rent" ? "#4ade80" : "#60a5fa" }}>{p.category}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#8ab0cc", marginBottom: 8 }}>
          📍 {p.location}{p.area ? `, ${p.area}` : ""} &nbsp;·&nbsp; 🏗 {p.possession}
          {p.sqft && <span> &nbsp;·&nbsp; 📐 {p.sqft} sqft</span>}
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {isCommercial
            ? <Tag color="#a78bfa">Commercial</Tag>
            : p.type?.map(t => <Tag key={t}>{t}</Tag>)
          }
          {p.tenantType && p.tenantType !== "any" && <Tag color="#f472b6">{p.tenantType}</Tag>}
          <Tag color="#6b7280">{p.available} left</Tag>
        </div>

        {!compact && p.highlights && <div style={{ fontSize: 11, color: "#7ba0b8", fontStyle: "italic", marginBottom: 8 }}>✨ {p.highlights}</div>}

        {exp && p.amenities?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: "#c9a96e", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>AMENITIES</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {p.amenities.map(a => <span key={a} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#ffffff08", color: "#aaa", border: "1px solid #ffffff15" }}>{a}</span>)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {p.amenities?.length > 0 && (
            <button onClick={() => setExp(!exp)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c9a96e30", background: "transparent", color: "#c9a96e", fontSize: 11, cursor: "pointer" }}>
              {exp ? "▲" : "▼ More"}
            </button>
          )}
          <button onClick={() => onBook(p)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#c9a96e,#9a7040)", color: "#0d1b2a", fontSize: 11, cursor: "pointer", fontWeight: 800 }}>
            📅 Site Visit
          </button>
          {onDelete && (
            <button onClick={() => onDelete(p.id)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #ef444430", background: "transparent", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>🗑</button>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotPicker({ project, onSelect }) {
  return (
    <div style={{ background: "#0d1b2a", border: "1px solid #c9a96e30", borderRadius: 14, padding: 14, marginTop: 10 }}>
      <div style={{ fontSize: 12, color: "#c9a96e", fontWeight: 700, marginBottom: 10 }}>📅 {project.name} — Slot Choose Karein</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {SLOTS.map(s => (
          <button key={s} onClick={() => onSelect(s)} style={{ padding: "8px 6px", borderRadius: 10, border: "1px solid #c9a96e35", background: "#c9a96e0a", color: "#e0c88a", fontSize: 11, cursor: "pointer", fontWeight: 600, textAlign: "center" }}>{s}</button>
        ))}
      </div>
    </div>
  );
}

// ============ SCREENSHOT UPLOAD ============
function UploadTab({ onSaved }) {
  const [state, setState] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setState("scanning"); setErr("");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target.result.split(",")[1];
      setPreview(e.target.result);
      try {
        const prop = await aiScanScreenshot(b64);
        prop.id = Date.now();
        if (!prop.available) prop.available = 1;
        setExtracted(prop);
        setState("done");
      } catch { setState("error"); setErr("Screenshot clearly nahi dikh raha. Dobara try karein."); }
    };
    reader.readAsDataURL(file);
  }

  function save() {
    if (extracted) { onSaved(extracted); setState("idle"); setPreview(null); setExtracted(null); }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <div style={{ fontSize: 13, color: "#c9a96e", fontWeight: 800, marginBottom: 4, letterSpacing: 0.5 }}>📸 SCREENSHOT SE ADD KARO</div>
      <div style={{ fontSize: 11, color: "#556", marginBottom: 16 }}>WhatsApp group se screenshot → Upload → AI khud save kar lega</div>

      {state === "idle" && (
        <>
          <div onClick={() => fileRef.current.click()} style={{ border: "2px dashed #c9a96e35", borderRadius: 18, padding: "36px 20px", textAlign: "center", cursor: "pointer", background: "#c9a96e05", marginBottom: 16 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>📱</div>
            <div style={{ color: "#c9a96e", fontWeight: 700, fontSize: 15 }}>Screenshot Upload Karo</div>
            <div style={{ color: "#445", fontSize: 11, marginTop: 5 }}>Tap karke gallery se choose karo</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          </div>
          <div style={{ background: "#0d1b2a", border: "1px solid #c9a96e20", borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, color: "#c9a96e", fontWeight: 700, marginBottom: 8 }}>💡 TIPS FOR BEST RESULTS</div>
            {["Screenshot clear aur readable ho","Poori property detail visible ho","Ek screenshot = ek property","Blurry ya cut screenshot kaam nahi karega"].map(t => (
              <div key={t} style={{ fontSize: 11, color: "#445", marginBottom: 5, display: "flex", gap: 6 }}><span style={{ color: "#c9a96e" }}>•</span>{t}</div>
            ))}
          </div>
        </>
      )}

      {state === "scanning" && (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
          {preview && <img src={preview} alt="" style={{ width: "100%", borderRadius: 14, marginBottom: 20, opacity: 0.4, maxHeight: 220, objectFit: "cover" }} />}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#c9a96e", animation: "pulse 1s infinite", animationDelay: `${i*0.22}s` }} />)}
            <style>{`@keyframes pulse{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
          </div>
          <div style={{ color: "#c9a96e", fontWeight: 700, fontSize: 14 }}>AI Screenshot Padh Raha Hai...</div>
          <div style={{ color: "#445", fontSize: 11, marginTop: 5 }}>5-10 seconds</div>
        </div>
      )}

      {state === "done" && extracted && (
        <div>
          {preview && <img src={preview} alt="" style={{ width: "100%", borderRadius: 14, marginBottom: 14, maxHeight: 180, objectFit: "cover" }} />}
          <div style={{ background: "#0a2010", border: "1px solid #4ade8040", borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#4ade80", fontWeight: 800, marginBottom: 12 }}>✅ AI Ne Yeh Details Nikali:</div>
            {[
              ["🏠 Type", `${extracted.type?.join("/")} (${extracted.propertyKind})`],
              ["🏷 Category", extracted.category],
              ["📍 Location", `${extracted.location}${extracted.area?", "+extracted.area:""}`],
              ["💰 Price", formatRange(extracted.priceMin, extracted.priceMax, extracted.category)],
              ["🏗 Possession", extracted.possession],
              ["📞 Contact", extracted.contact || "N/A"],
              ["🏢 Project", extracted.name],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
                <span style={{ color: "#556" }}>{k}</span>
                <span style={{ color: "#e0d0b0", fontWeight: 600, textAlign: "right", maxWidth: "58%" }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setState("idle"); setPreview(null); setExtracted(null); }} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid #c9a96e35", background: "transparent", color: "#c9a96e", fontSize: 12, cursor: "pointer" }}>❌ Dobara</button>
            <button onClick={save} style={{ flex: 2, padding: "11px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#c9a96e,#9a7040)", color: "#0d1b2a", fontSize: 12, cursor: "pointer", fontWeight: 800 }}>✅ Save Karo</button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>😔</div>
          <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 18 }}>{err}</div>
          <button onClick={() => { setState("idle"); setPreview(null); }} style={{ padding: "10px 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#c9a96e,#9a7040)", color: "#0d1b2a", cursor: "pointer", fontWeight: 700 }}>Dobara Try Karo</button>
        </div>
      )}
    </div>
  );
}

// ============ MAIN APP ============
export default function App() {
  const [tab, setTab] = useState("chat");
  const [properties, setProperties] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");

  // Chat state
  const [msgs, setMsgs] = useState([{
    from: "bot",
    text: "🙏 *Namaste! eMumbaiProperty mein swagat hai!*\n\nMain aapki perfect property dhundhne mein madad karunga.\n\nBatao — Residential chahiye ya Commercial? 😊",
    cards: [], slot: null, confirmed: false
  }]);
  const [chatHistory, setChatHistory] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [typing, setTyping] = useState(false);
  const [bookTarget, setBookTarget] = useState(null);
  const [clientName, setClientName] = useState("");
  const [askName, setAskName] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    (async () => {
      const saved = await dbGet("emp_properties");
      setProperties(saved || DEFAULT_PROPERTIES);
      const savedBookings = await dbGet("emp_bookings");
      setBookings(savedBookings || []);
      setReady(true);
    })();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function addProperty(prop) {
    const updated = [...properties, prop];
    setProperties(updated);
    await dbSet("emp_properties", updated);
    showToast(`✅ "${prop.name}" saved!`);
    setTab("properties");
  }

  async function deleteProperty(id) {
    const updated = properties.filter(p => p.id !== id);
    setProperties(updated);
    await dbSet("emp_properties", updated);
    showToast("🗑 Property deleted");
  }

  function startBooking(proj) {
    setBookTarget(proj);
    setAskName(true);
    setTab("chat");
    addBot(`*${proj.name}* ke liye site visit book karte hain! 🎉\n\nPehle aapka naam batao:`, [], null);
  }

  async function confirmBooking(slot) {
    const b = { id: Date.now(), project: bookTarget, slot, name: clientName };
    const updated = [...bookings, b];
    setBookings(updated);
    await dbSet("emp_bookings", updated);
    setMsgs(prev => [...prev,
      { from: "user", text: slot, cards: [], slot: null },
      { from: "bot", text: `✅ *Site Visit Confirmed!*\n\n🏠 ${bookTarget.name}\n📅 ${slot}\n👤 ${clientName}\n\nHamara team jald call karega!\n📞 ${bookTarget.contact}`, cards: [], slot: null, confirmed: true }
    ]);
    setChatHistory(h => [...h,
      { role: "user", content: `Slot: ${slot}` },
      { role: "assistant", content: `Confirmed: ${bookTarget.name}, ${slot}, ${clientName}` }
    ]);
    setBookTarget(null); setAskName(false); setClientName("");
  }

  function addBot(text, cards, slot, confirmed = false) {
    setMsgs(prev => [...prev, { from: "bot", text, cards: cards || [], slot, confirmed }]);
  }

  async function sendMsg(quick) {
    const msg = (quick || inputVal).trim();
    if (!msg || typing) return;
    setInputVal("");

    if (askName && bookTarget) {
      setClientName(msg);
      setAskName(false);
      setMsgs(prev => [...prev, { from: "user", text: msg, cards: [], slot: null }]);
      addBot(`Shukriya ${msg}! 😊\nKaunsa slot prefer karoge?`, [], bookTarget);
      return;
    }

    setMsgs(prev => [...prev, { from: "user", text: msg, cards: [], slot: null }]);
    setTyping(true);

    const newHistory = [...chatHistory, { role: "user", content: msg }];
    try {
      const reply = await aiChat(newHistory, properties, bookings.length);

      // Parse tags
      const cardIds = [...reply.matchAll(/\[P:(\d+)\]/g)].map(m => parseInt(m[1]));
      const bookId = reply.match(/\[BOOK:(\d+)\]/)?.[1];
      const doSearch = reply.includes("[SEARCH]");

      let cards = cardIds.map(id => properties.find(p => p.id === id)).filter(Boolean);

      // If search tag, do smart search
      if (doSearch && cards.length === 0) {
        const lower = msg.toLowerCase();
        const enquiry = {};
        if (lower.includes("commercial")) enquiry.kind = "commercial";
        else if (lower.includes("residential") || lower.match(/\d\s*bhk/)) enquiry.kind = "residential";
        const bhk = msg.match(/(\d)\s*bhk/i);
        if (bhk) enquiry.bhk = bhk[1] + " BHK";
        if (lower.includes("rent")) enquiry.category = "Rent";
        if (lower.includes("sale") || lower.includes("buy")) enquiry.category = "Sale";
        const areas = ["andheri","goregaon","bandra","borivali","malad","powai","thane","lokhandwala","kandivali","juhu","worli","dadar"];
        areas.forEach(a => { if (lower.includes(a)) enquiry.location = a; });
        cards = searchProps(enquiry, properties);
      }

      const clean = reply.replace(/\[P:\d+\]/g,"").replace(/\[BOOK:\d+\]/g,"").replace(/\[SEARCH\]/g,"").trim();
      const bookProj = bookId ? properties.find(p => p.id === parseInt(bookId)) : null;

      addBot(clean, cards, null);
      setChatHistory([...newHistory, { role: "assistant", content: reply }]);

      if (bookProj) setTimeout(() => startBooking(bookProj), 300);
    } catch {
      addBot("Network error. Dobara try karein. 🙏", [], null);
    }
    setTyping(false);
  }

  function renderText(text) {
    if (!text) return null;
    return text.split("\n").map((line, i) => (
      <div key={i} style={{ minHeight: "1em" }}>
        {line.split(/(\*[^*]+\*)/g).map((seg, j) =>
          seg.startsWith("*") && seg.endsWith("*")
            ? <strong key={j} style={{ color: "#e0c88a" }}>{seg.slice(1,-1)}</strong>
            : seg
        )}
      </div>
    ));
  }

  const quickChips = ["Residential property chahiye","2 BHK Sale dhundh raha hoon","1 BHK Rent 50K budget","Commercial office space","Ready possession property"];

  if (!ready) return (
    <div style={{ background: "#080f1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#c9a96e", fontSize: 16, fontFamily: "Georgia,serif" }}>eMumbaiProperty Loading... 🏙</div>
    </div>
  );

  const tabs = [
    { id: "chat", label: "💬 Chat" },
    { id: "upload", label: "📸 Add" },
    { id: "properties", label: `🏠 (${properties.length})` },
    { id: "bookings", label: `📅 (${bookings.length})` },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: "#060d18", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
      <div style={{ width: "100%", maxWidth: 440, height: "95vh", display: "flex", flexDirection: "column", background: "#0a1525", borderRadius: 24, overflow: "hidden", boxShadow: "0 0 0 1px #c9a96e18, 0 30px 80px #00000080" }}>

        {/* HEADER */}
        <div style={{ background: "linear-gradient(180deg,#0f2035,#0a1828)", padding: "13px 16px 12px", borderBottom: "1px solid #c9a96e18", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 11 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#c9a96e,#8a5c20)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, boxShadow: "0 4px 12px #c9a96e30" }}>🏙</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: "#f0e6d0", fontSize: 16, fontFamily: "Georgia,serif", letterSpacing: 0.3 }}>eMumbaiProperty</div>
              <div style={{ fontSize: 10, color: "#c9a96e", marginTop: 1 }}>● AI Powered CRM &nbsp;·&nbsp; {properties.length} Properties &nbsp;·&nbsp; {bookings.length} Bookings</div>
            </div>
          </div>

          {toast && (
            <div style={{ background: "#0a2010", border: "1px solid #4ade8035", borderRadius: 10, padding: "7px 12px", marginBottom: 10, fontSize: 12, color: "#4ade80", fontWeight: 700 }}>{toast}</div>
          )}

          <div style={{ display: "flex", gap: 5 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "6px 3px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all 0.2s", background: tab === t.id ? "linear-gradient(135deg,#c9a96e,#9a7040)" : "#ffffff0a", color: tab === t.id ? "#0a1525" : "#667" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* CHAT TAB */}
        {tab === "chat" && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "90%", padding: "10px 14px",
                    borderRadius: m.from === "user" ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
                    background: m.from === "user" ? "linear-gradient(135deg,#c9a96e,#9a7040)" : "#0f2035",
                    color: m.from === "user" ? "#0a1525" : "#d0c8b8",
                    fontSize: 13, lineHeight: 1.65,
                    border: m.from === "bot" ? "1px solid #c9a96e18" : "none",
                    boxShadow: "0 2px 12px #00000040"
                  }}>
                    <div style={{ fontWeight: m.from === "user" ? 700 : 400 }}>{renderText(m.text)}</div>

                    {m.cards?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        {m.cards.map(p => <PropertyCard key={p.id} p={p} onBook={startBooking} compact />)}
                      </div>
                    )}

                    {m.slot && <SlotPicker project={m.slot} onSelect={confirmBooking} />}

                    {m.confirmed && (
                      <div style={{ background: "#0a2010", border: "1px solid #4ade8030", borderRadius: 10, padding: "7px 10px", marginTop: 10, fontSize: 11, color: "#4ade80", fontWeight: 700 }}>✅ BOOKING CONFIRMED</div>
                    )}

                    <div style={{ fontSize: 9, color: m.from === "user" ? "#0a152560" : "#ffffff25", marginTop: 5, textAlign: "right" }}>
                      {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}

              {typing && (
                <div style={{ display: "flex" }}>
                  <div style={{ padding: "12px 16px", borderRadius: "4px 18px 18px 18px", background: "#0f2035", border: "1px solid #c9a96e18" }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#c9a96e", animation: "pulse 1s infinite", animationDelay: `${i*0.22}s` }} />)}
                      <style>{`@keyframes pulse{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: "6px 12px 4px", display: "flex", gap: 5, overflowX: "auto", flexShrink: 0 }}>
              {quickChips.map(c => (
                <button key={c} onClick={() => sendMsg(c)} style={{ whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 20, border: "1px solid #c9a96e30", background: "transparent", color: "#c9a96e", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>{c}</button>
              ))}
            </div>

            <div style={{ padding: "8px 12px 14px", display: "flex", gap: 8, borderTop: "1px solid #c9a96e12", flexShrink: 0 }}>
              <input
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMsg()}
                placeholder={askName ? "Apna naam likhein..." : "Kuch bhi poochho — Hindi ya English..."}
                style={{ flex: 1, padding: "11px 16px", borderRadius: 26, border: "1px solid #c9a96e25", background: "#0f2035", color: "#e0d0b0", fontSize: 13, outline: "none" }}
              />
              <button onClick={() => sendMsg()} disabled={typing} style={{ width: 46, height: 46, borderRadius: "50%", border: "none", cursor: typing ? "not-allowed" : "pointer", background: typing ? "#1a2a3a" : "linear-gradient(135deg,#c9a96e,#9a7040)", fontSize: 18, opacity: typing ? 0.5 : 1, flexShrink: 0 }}>➤</button>
            </div>
          </>
        )}

        {/* UPLOAD TAB */}
        {tab === "upload" && <UploadTab onSaved={addProperty} />}

        {/* PROPERTIES TAB */}
        {tab === "properties" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#c9a96e", fontWeight: 800, letterSpacing: 0.8 }}>ALL PROPERTIES ({properties.length})</div>
              <button onClick={() => setTab("upload")} style={{ padding: "6px 14px", borderRadius: 20, border: "none", background: "linear-gradient(135deg,#c9a96e,#9a7040)", color: "#0a1525", fontSize: 11, cursor: "pointer", fontWeight: 800 }}>+ Add New</button>
            </div>

            {properties.length === 0 ? (
              <div style={{ textAlign: "center", color: "#334", fontSize: 14, marginTop: 60 }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🏠</div>
                Koi property nahi.<br />
                <span style={{ fontSize: 12 }}>📸 Add tab se screenshot upload karo!</span>
              </div>
            ) : (
              <>
                {/* Residential */}
                {properties.filter(p => p.propertyKind !== "commercial").length > 0 && (
                  <div style={{ fontSize: 10, color: "#c9a96e", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>RESIDENTIAL</div>
                )}
                {properties.filter(p => p.propertyKind !== "commercial").map(p => (
                  <PropertyCard key={p.id} p={p} onBook={p => { setTab("chat"); startBooking(p); }} onDelete={deleteProperty} />
                ))}

                {/* Commercial */}
                {properties.filter(p => p.propertyKind === "commercial").length > 0 && (
                  <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, letterSpacing: 1, margin: "14px 0 8px" }}>COMMERCIAL</div>
                )}
                {properties.filter(p => p.propertyKind === "commercial").map(p => (
                  <PropertyCard key={p.id} p={p} onBook={p => { setTab("chat"); startBooking(p); }} onDelete={deleteProperty} />
                ))}
              </>
            )}
          </div>
        )}

        {/* BOOKINGS TAB */}
        {tab === "bookings" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            <div style={{ fontSize: 12, color: "#c9a96e", fontWeight: 800, marginBottom: 14, letterSpacing: 0.8 }}>SITE VISIT BOOKINGS ({bookings.length})</div>
            {bookings.length === 0 ? (
              <div style={{ textAlign: "center", color: "#334", fontSize: 14, marginTop: 60 }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📅</div>
                Abhi koi booking nahi.<br />
                <span style={{ fontSize: 12 }}>Chat mein client se baat karo!</span>
              </div>
            ) : (
              [...bookings].reverse().map(b => (
                <div key={b.id} style={{ background: "linear-gradient(135deg,#0d1b2a,#0f2035)", border: "1px solid #c9a96e25", borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, color: "#f0e6d0", fontSize: 15 }}>{b.name}</div>
                    <div style={{ fontSize: 10, background: "#0a201040", color: "#4ade80", padding: "3px 10px", borderRadius: 20, fontWeight: 700, border: "1px solid #4ade8030" }}>CONFIRMED</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#c9a96e", marginBottom: 4 }}>🏠 {b.project?.name}</div>
                  <div style={{ fontSize: 12, color: "#8ab0cc", marginBottom: 4 }}>📅 {b.slot}</div>
                  <div style={{ fontSize: 11, color: "#445" }}>📞 {b.project?.contact}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
