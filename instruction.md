# Putting Green Physics Simulator — Build Instructions

## ภาพรวมโครงการ

สร้าง Single Page App (SPA) สำหรับจำลองเส้นทางการวิ่งของลูกกอล์ฟบนกรีนพัตต์ ด้วยหลัก physics จริง (rolling resistance + slope force บนพื้นเอียง) ให้ผู้ใช้ปรับตัวแปร 3 ตัว (ระยะ, ความลาดเอียง, ความเร็วกรีน) แล้วเห็นเส้นทางวิ่งและการเลี้ยวของลูกแบบ animate

**เป้าหมายการใช้งาน**: เครื่องมือช่วยอ่านกรีนหน้างานจริง ต้องการความแม่นยำสูงสุดที่ physics model รองรับได้

**กลุ่มผู้ใช้**: ตั้งแต่เด็ก 8 ขวบ ถึง Touring Pro — UI ต้องง่ายพอสำหรับมือใหม่ แต่มีความละเอียดพอสำหรับมือโปร

**ข้อจำกัดสำคัญที่ต้องเข้าใจก่อนเริ่ม**: โมเดลนี้แม่นยำ 100% ตามสมการ physics ที่ตั้งไว้ (deterministic, ไม่มี randomness) แต่ความแม่นยำเทียบกับกรีนจริงมีข้อจำกัด เพราะสมมติว่า slope สม่ำเสมอตลอดเส้นทาง ไม่รองรับ compound break/undulation/grain ของกรีนจริง — ต้องสื่อสารข้อจำกัดนี้ใน UI ด้วย (เป็น disclaimer เล็กๆ ไม่ต้องเด่น)

---

## 1. Physics Model (หัวใจของแอป)

### Coordinate system
ตั้ง origin ที่ตำแหน่งลูก ทิศ +y = ทิศทางไปหลุมตามแนวเส้นตรงเริ่มต้น (ก่อนคำนวณ break)

### Input parameters
- **Distance**: 1-30 ft (ระยะลูกถึงหลุม)
- **Slope magnitude**: 1-7% (ความลาดเอียง วัดจากจุดกึ่งกลางระหว่างลูกกับหลุม)
- **Slope direction**: 0-360° จาก compass dial
  - กำหนด convention ให้ชัดเจนและสม่ำเสมอตลอดแอป: 0° = uphill (ลูกขึ้นเขาตรงไปหลุม), 90° = ลาดไปทางขวา, 180° = downhill, 270° = ลาดไปทางซ้าย
- **Green speed**: Stimp 8-12 (ค่าความเร็วกรีนมาตรฐานกอล์ฟ)

### แปลง input → ตัวแปรภายในก่อนเข้าสมการ
แตก slope% ออกเป็น 2 component ตามมุม compass:
- `slopeParallel = slopeMagnitude * cos(angleRad)` → ผลต่อความเร็ว (เร่ง/หน่วงตามขึ้น-ลงเขา)
- `slopePerp = slopeMagnitude * sin(angleRad)` → ผลต่อทิศทาง (sideways break)

แสดงค่าที่แตกแล้วเป็นตัวเลขบน UI ข้าง compass dial ให้ผู้ใช้เห็น (เช่น "Uphill 3.2% / Right break 2.1%")

### Friction จาก Green Speed (Stimp)
ต้อง derive ค่า coefficient of friction (μ) จาก Stimp reading โดยใช้หลักการเดียวกับ USGA Stimpmeter calibration จริง (ระยะที่ลูกไหลจากความเร็วต้นคงที่บนพื้นราบจนหยุดสนิท ณ ระยะ Stimp ฟุต ใช้สมการ kinematics: v² = 2·a·d โดย a = μg)

**ห้ามใส่ค่า μ คงที่แบบเดาเอา** — ให้ derive จากสมการจริงโดยอ้างอิงค่าความเร็วต้นมาตรฐานของ Stimpmeter (USGA ใช้ initial velocity คงที่จาก ramp ที่กำหนดมุมและความสูงปล่อยมาตรฐาน) แล้วคำนวณ μ ย้อนกลับจากสมการนี้สำหรับ Stimp reading แต่ละค่าในช่วง 8-12

### Equation of motion (numerical time-step integration)
**ห้ามใช้ closed-form/เส้นตรงโดยประมาณ** เพราะ break ต้องไม่สมมาตร (โค้งหนักขึ้นตอนท้ายเมื่อลูกช้าลง เป็นพฤติกรรมจริงของพัตต์ slope)

ใช้ time step เล็ก (dt = 0.001–0.005s) วน integration:
1. ที่แต่ละ step คำนวณแรง 2 ทิศ:
   - Deceleration จาก friction (ทิศตรงข้ามกับทิศการเคลื่อนที่ปัจจุบันของลูกเสมอ ขนาด = μg)
   - Slope force แยกเป็น parallel/perpendicular **ต่อทิศทางการเคลื่อนที่ปัจจุบันของลูก** (ไม่ใช่ต่อแนวเริ่มต้น เพราะลูกเปลี่ยนทิศเรื่อยๆตาม break ที่สะสม)
2. อัปเดต velocity vector และ position vector ทุก step (Euler integration ใช้ได้ หรือ RK4 ถ้าต้องการความแม่นยำสูงกว่า)
3. หยุดคำนวณเมื่อ:
   - Speed ≈ 0 (ลูกหยุดสนิท) → บันทึกตำแหน่งสุดท้าย คำนวณระยะห่างจากหลุม
   - หรือ position เข้าใกล้ hole ในระยะรวมของ hole radius (4.25 inch diameter → radius 2.125 inch) และ golf ball radius (0.84 inch) — ถ้า speed ตอนผ่านจุดนี้ไม่เกิน threshold ที่สมเหตุสมผล (ลูกเร็วเกินไปจะ "lip out" ไม่ลงหลุม) ให้ตัดสินว่าลงหลุม
4. เก็บ array ของ `{x, y, t, speed}` ทุก step ไว้สำหรับ render เส้นทางและขับ animation

### Initial speed (ความเร็วต้น)
ผู้ใช้ไม่ได้ระบุความเร็วตี ระบบต้อง **คำนวณย้อนกลับ (solve)** หาความเร็วต้นที่ทำให้ลูกวิ่งไปถึงตำแหน่งหลุมพอดี (พอดีจะหยุดที่ขอบหลุม/ตกหลุม ที่ความแรงมาตรฐาน) โดยใช้ initial speed นี้เป็น baseline/reference line — ไม่มี slider แยกสำหรับความเร็วตี เพราะเป้าหมายคือแสดง "เส้นที่ถูกต้องสำหรับให้ลูกลงหลุม" ตามตัวแปร 3 ตัวที่ตั้งไว้

แนะนำใช้วิธี iterative solve (เช่น binary search บนค่าความเร็วต้น แล้ว simulate ทั้ง path ดูว่าระยะสุดท้ายตรงเป้าหรือไม่ ปรับค่าจนลู่เข้า) เนื่องจาก break ที่ไม่เป็นเส้นตรงทำให้ไม่มีสมการ closed-form ตรงไปตรงมา

---

## 2. UI Components

### Input controls (ต้อง real-time reactive — ขยับแล้ว re-calculate และ re-render ทันที ไม่ต้องกด submit)
- **Distance slider**: 1-30 ft, step 1
- **Green speed slider**: Stimp 8-12, step 0.5
- **Slope compass dial**: ลากด้วยนิ้ว/เมาส์บนวงกลมเพื่อกำหนดทิศทาง 0-360° ของความลาด พร้อมแสดงค่า uphill/downhill % และ left/right % ที่แตกแล้วเป็นตัวเลขข้างๆ
- **Slope magnitude slider**: 1-7%, step 0.5 (ควบคุมขนาดรวม ใช้คู่กับ compass dial)

### Output/Visualization
- Canvas หรือ SVG แสดงพื้นกรีนเป็นพื้นหลัง (ไม่ต้องสมจริงมาก วงกลม/สี่เหลี่ยมพอ), ตำแหน่งลูกเริ่มต้น, ตำแหน่งหลุม
- วาดเส้น path การวิ่งตามผลคำนวณจริง (ใช้ array points ที่ simulate ได้ตรงๆ ไม่ approximate เป็นเส้นตรงหรือ bezier)
- Animate ลูกกอล์ฟ (จุด/วงกลมเล็ก) เคลื่อนที่ตามเส้นทางแบบ **time-accurate** — ใช้ timestamp จาก array points ขับ animation (ลูกต้องเคลื่อนที่เร็วตอนต้น ช้าตอนท้ายตามจริง ไม่ใช่ linear interpolation ที่ขับด้วยความเร็วคงที่)
- แสดงผลชัดเจนว่า "ลงหลุม ⛳" หรือ "พลาด" พร้อมระยะที่ลูกหยุดห่างจากหลุม (ft/inch) ถ้าพลาด
- ปุ่ม Replay/Reset animation

### Disclaimer
ข้อความเล็กๆในแอป (ไม่ต้องเด่น) ระบุว่าโมเดลสมมติ slope สม่ำเสมอตลอดเส้นทาง ไม่รองรับ compound break/undulation ของกรีนจริง ใช้เป็นเครื่องมือช่วยแนวทาง ไม่ใช่ค่าพยากรณ์แม่นยำ 100%

---

## 3. Tech Stack

ไม่ต้องพึ่ง physics engine library ภายนอก (Matter.js ฯลฯ) — 2D rolling-with-friction-and-slope เขียน integration loop เองได้ และคุมความแม่นยำของสมการได้ตรงกว่า

**แนะนำ**: Plain HTML + CSS + JS (ไม่ต้อง build step) เพราะ scope งานนี้ไม่จำเป็นต้องใช้ React component อื่นร่วมด้วย และ deploy ง่ายกว่ามากสำหรับ GitHub Pages

ถ้าเลือกใช้ Canvas API จะ render animation ลื่นกว่า SVG เมื่อต้อง redraw ทุก frame

---

## 4. GitHub Pages Deployment Requirements

**Static-only constraint**: ห้ามมี backend/API server/database ทั้งหมดรันบน client-side browser เท่านั้น

### ถ้าใช้ Plain HTML/JS/CSS (แนะนำสำหรับ scope นี้)
- ไม่ต้อง build เลย มีแค่ `index.html` ที่ import JS/CSS แบบ relative path (`./script.js`, `./style.css`)
- Push เข้า `main` branch แล้วเปิด GitHub Pages ให้ serve จาก root ของ `main` (หรือ `/docs` folder) ผ่าน Settings → Pages บน repo
- ทดสอบ local ด้วย simple HTTP server (`python -m http.server` หรือ VS Code Live Server) ก่อน push เพราะเปิดไฟล์ตรงด้วย `file://` อาจมีปัญหา CORS ถ้ามีการ fetch ไฟล์ย่อย

### ถ้าใช้ Vite/React (ทางเลือกเสริม ถ้าจำเป็นต้องใช้ component library)
- กำหนด `base: '/<repo-name>/'` ใน `vite.config.js` ให้ตรงกับชื่อ repository
- ใช้ relative path สำหรับ assets ทั้งหมด ห้าม hardcode absolute path
- Build output ไปที่ `dist/` deploy ผ่าน GitHub Actions (`actions/deploy-pages` official action) แทนการ push `dist/` มือ

### Repository structure
```
/ (root หรือ /docs ตามที่เลือก)
  index.html
  style.css
  script.js (หรือแยกเป็น physics.js, render.js, ui.js ถ้าโค้ดยาว)
  README.md (อธิบายวิธีใช้ + ลิงก์ live demo)
.github/workflows/deploy.yml (ถ้าเลือกใช้ Vite/build step)
```

### Verification ก่อนถือว่าจบงาน
- ทดสอบว่าแอปรันได้ถูกต้องเมื่อ deploy path ไม่ใช่ root (asset path ผิดเฉพาะตอน deploy เป็นปัญหาที่พบบ่อยสุดของ GitHub Pages)
- เช็ค canvas/SVG render ถูกต้องบน mobile viewport (target user รวมเด็ก 8 ขวบที่อาจเปิดจากมือถือหน้ากรีน)