# Nayab Glow — Online Hosting Guide (Render.com)

Poora store (website + admin + API + chat) **aik hi free service** par host hoga.
Database pehle se MongoDB Atlas (cloud) par hai, images UploadThing par — sirf app host karni hai.

---

## Step 1 — MongoDB Atlas ko allow karein

1. [cloud.mongodb.com](https://cloud.mongodb.com) → apna cluster → **Network Access**
2. **Add IP Address** → **"Allow access from anywhere" (0.0.0.0/0)** → Confirm
   (Render ke servers ki IP change hoti rehti hai, is liye yeh zaroori hai)

## Step 2 — Code GitHub par push karein

1. [github.com/new](https://github.com/new) → repo name: `nayab-glow` → **Private** → Create
2. Phir is folder mein yeh commands (Git Bash / PowerShell):

```bash
cd "E:\Softwares\claude oil spray\nayab-glow"
git remote add origin https://github.com/AAPKA-USERNAME/nayab-glow.git
git push -u origin main
```

(Commit pehle se tayyar hai — `.env` secrets git mein NAHI hain, woh Step 3 mein dashboard se dalenge.)

## Step 3 — Render par deploy

1. [render.com](https://render.com) → **Sign up with GitHub** (free)
2. Dashboard → **New +** → **Blueprint** → apni `nayab-glow` repo select karein
   (repo mein `render.yaml` pehle se mojood hai — Render sab settings khud utha lega)
3. Env vars fill karein jab pooche:

| Variable | Value |
|---|---|
| `MONGO_URI` | Atlas wali URI — **`&tlsAllowInvalidCertificates=true` hata kar** (woh sirf aap ke PC ki clock ke liye tha):<br>`mongodb+srv://USER:PASS@cluster0.x6nrwka.mongodb.net/nayab-glow?retryWrites=true&w=majority&appName=Cluster0` |
| `UPLOADTHING_TOKEN` | wohi token jo `server/.env` mein hai |
| `ADMIN_PASSWORD` | admin panel ka naya strong password |
| `JWT_SECRET` | Render khud generate kar dega |

4. **Apply / Deploy** → 3-5 minute mein build complete
5. URL milega: `https://nayab-glow.onrender.com` — yehi client ko dein!
   - Store: `https://nayab-glow.onrender.com`
   - Admin: `https://nayab-glow.onrender.com/admin/login`

## Step 4 — Pehli dafa data seed karein

Render dashboard → apni service → **Shell** tab → yeh chalayein:

```bash
npm run seed
```

(Ya agar local database mein already sab kuch hai to yeh step skip — dono same Atlas DB use karte hain, data pehle se wahan mojood hai.)

---

## Zaroori baatein

- **Free plan**: 15 min koi visitor na aye to service so jati hai — agla visitor ~40-50 sec wait karta hai. Client demo ke liye theek hai; live business ke liye **Starter plan ($7/month)** lein, phir hamesha on rahegi.
- **Updates bhejne ke liye**: bas `git add -A && git commit -m "update" && git push` — Render khud naya version deploy kar dega.
- **Custom domain** (e.g. officialnayabglow.com): Render service → Settings → Custom Domains → domain add karein aur apne domain provider mein CNAME record lagayein. SSL free milta hai.

## Security (zaroor karein)

1. **Atlas password rotate karein** (Database Access → Edit → new password) aur nayi URI Render + local `.env` dono mein update karein — purana password chat mein share hua tha.
2. **UploadThing token bhi regenerate** kar lein (uploadthing.com dashboard) — same wajah.
3. **Admin password change karein** — `admin123` sirf development ke liye tha. Render env var + seed ke baad Admin panel → Staff se bhi manage kar sakte hain.
4. Local PC ki **clock sync karein** (Settings → Time & Language → Sync now) phir local `.env` se `&tlsAllowInvalidCertificates=true` hata dein.
