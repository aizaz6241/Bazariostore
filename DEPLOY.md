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
| `MONGO_URI` | Atlas wali URI — **`&tlsAllowInvalidCertificates=true` hata kar** (woh sirf aap ke PC ki clock ke liye tha):<br>`mongodb+srv://<user>:<password>@<cluster>/<database>` |
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
3. **Admin password change karein** — seed ab koi fixed password nahi rakhta: naye admin ko `ADMIN_PASSWORD` (ya ek random password jo seed ek dafa print karta hai) milta hai. Purane seed wale admin / demo seller accounts ka password Admin panel → Staff / Sellers se zaroor badlein.
5. **Yeh env vars server par set rakhein:** `JWT_SECRET` (lamba random), `SELLER_PASSWORD_KEY` (16+ characters), `CORS_ORIGINS` (apne store / admin domains, comma se alag). Render ke ilawa kisi aur host par jo proxy visitor ka IP header likhta hai, uska naam `CLIENT_IP_HEADER` mein dein.
4. Local PC ki **clock sync karein** (Settings → Time & Language → Sync now) phir local `.env` se `&tlsAllowInvalidCertificates=true` hata dein.

## SEO (Google ranking)

`npm run build` ab khud SEO files banata hai (`client/scripts/seo-build.mjs`):
- `sitemap.xml` — home, shop, har category aur har active product (images ke saath)
- `product/<slug>/index.html` — har product page pehle se render: title, description, canonical, Open Graph, Product schema
- `robots.txt` (`client/public/`) — admin / seller portal / cart / checkout index nahi honge

Vercel env vars (optional):

| Variable | Kab |
|---|---|
| `SITE_URL` | Custom domain lagane par (e.g. `https://bazario.ae`) — default `https://bazariomarketplace.vercel.app` |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console ka "HTML tag" content code |
| `BING_SITE_VERIFICATION` | Bing Webmaster Tools ka `msvalidate.01` code |

Naye products sitemap mein agle deploy par aate hain — products add karne ke baad ek redeploy karein (ya Vercel Deploy Hook).
