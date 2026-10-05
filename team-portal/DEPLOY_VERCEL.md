# 🚀 How to Deploy Bazario Team & Operations Portal on Vercel

Yeh guide aapko step-by-step batati hai ke is naye module (`team-portal`) ko alag se **Vercel** par kaise deploy karna hai.

---

## 🛠 Option 1: Existing Repo Se Vercel Pe Deploy Karna (Sab Se Asaan)

Agar aap isi existing repository (`Abd Call Center` / `Bazariostore`) ko Vercel se connect kar rahe hain:

1. **Vercel Dashboard** ([vercel.com](https://vercel.com)) par jayein aur **Add New > Project** par click karein.
2. Apni GitHub repository select karein.
3. **Configure Project** screen par:
   - **Root Directory**: `Edit` par click karein aur `team-portal` select karein!
   - **Framework Preset**: Automatically `Next.js` detect ho jayega.
4. **Environment Variables**:
   Neeche diye gaye variables add karein:
   - `MONGO_URI`: `mongodb+srv://<user>:<password>@<cluster>/<database>`
   - `JWT_SECRET`: `bazario_ultra_secure_jwt_2026_production_key_x9q2m`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: `BOjYR8QcpgCsb9JXFy8Co-6xLbOJrKmZ51sf-E4F2NlnbCZkg6KkperwMeIMAklYdgxrR4E_gFLcY-00sNemDMw`
   - `VAPID_PRIVATE_KEY`: `Qir4j4jTDxap1IxONnfExW3_KqERktpnQFj3KMjLb1Q`
   - `VAPID_SUBJECT`: `mailto:support@bazariostore.com`
5. **Deploy** button dabayein!
   1-2 minute mein aapki live Vercel URL taiyar ho jayegi.

---

## 📦 Option 2: Standalone Repository Bana Kar Deploy Karna

Agar aap is `team-portal` folder ko bilkul alag se new GitHub repo banana chahte hain:
1. `team-portal` folder ke andar git init karein.
2. Apne naye GitHub repository se link kar ke push karein.
3. Vercel par import karein aur upar diye gaye Environment Variables add kar ke Deploy kar dein.

---

## 🔑 Default Login Credentials

System pehle login par automatically Super Admin create kar deta hai agar DB mein admin na ho:

| Role | Username | Password |
| :--- | :--- | :--- |
| **Super Admin** | `admin` | `admin123` |
| **Member 1 (Agent)** | `member1` | `member123` |

> *Tip: Login screen par quick one-click demo login buttons bhi available hain!*

---

## 💎 Implemented Core Modules:

1. **1:1 INR se PKR Financial Rule**:
   - Seller INR deposit $\rightarrow$ Member PKR wallet credit (+).
   - Seller INR withdraw $\rightarrow$ Member PKR wallet deduction (-).
   - Live Wallet Balance = Deposits - Withdrawals + Approved Bonuses.
2. **Pre-set Rewards & Approval Queue**:
   - 1 Lakh deposit $\rightarrow$ 1,000 PKR
   - 2 Lakh deposit $\rightarrow$ 2,000 PKR
   - 3 Lakh deposit $\rightarrow$ 3,000 PKR
   - 5 Lakh Weekly Sprint $\rightarrow$ 5,000 PKR
   - First seller 5 completed orders $\rightarrow$ 5,000 PKR
   - Direct Admin custom bonus with reason.
   - **Approval Rule**: Admin ke approve karne par hi wallet mein add hota hai aur automatically Group Chat mein confetti announcement hoti hai!
3. **WhatsApp-Style Chat Room**:
   - Group Chat (Sab admins aur members)
   - Personal 1-on-1 Chat (Admin $\leftrightarrow$ Member)
   - Real-time Voice note recording & audio player
   - Image attachment & sharing
4. **Models & Unlimited Assets Gallery**:
   - Bio, Age, DOB, Location, Family, Occupation, Details
   - Unlimited photos gallery with instant **One-Click Download** button.
5. **Private CRM Memory Notes**:
   - Member apne har assigned seller ke liye custom nickname, age, occupation, marital status, location, picture, aur private reminders save kar sakta hai.
6. **Mobile-First Responsive UX**:
   - Sleek bottom navigation bar on mobile screen just like WhatsApp / native iOS/Android apps.
