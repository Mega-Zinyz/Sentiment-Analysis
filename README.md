# Sentiment Analisis Full Stack

Aplikasi web full-stack untuk analisis sentimen teks berbahasa Indonesia. Dibangun sebagai project skripsi dengan fitur crawling data, pelabelan manual, pelatihan model, dan analisis sentimen berbasis Machine Learning.

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend** | Angular 20, Chart.js, Socket.io-client |
| **Backend** | Node.js 20, Express.js, Socket.io |
| **Database** | MySQL 8.0 (utama), SQLite (cache), Redis (job queue) |
| **ML / NLP** | Python 3, scikit-learn (Naïve Bayes), spaCy, Sastrawi |
| **Crawler** | Playwright (headless Chromium) |
| **DevOps** | Docker, Docker Compose, Nginx |

---

## Fitur Utama

- **Analisis Sentimen** — Naïve Bayes classifier, word library matching, dan ensemble method untuk teks bahasa Indonesia
- **Upload Data** — Upload CSV atau input teks langsung; validasi & deduplication otomatis
- **Pelabelan Manual** — Interface interaktif untuk melabeli data tweet per item atau secara batch
- **Manajemen Training Data** — Upload dataset training custom, statistik distribusi kelas, preprocessing pipeline
- **Web Crawler** — Scraping data berbasis Playwright dengan rate limiting dan manajemen cookie
- **Riwayat & Insights** — Grafik distribusi sentimen, kata kunci teratas, dan time-series analysis
- **Perpustakaan Kata** — Buat dan kelola kamus sentimen custom per pengguna
- **Admin Dashboard** — Manajemen user, audit log, statistik sistem, dan manajemen sesi
- **Real-time Progress** — Update status analisis secara live via Socket.io
- **Keamanan** — JWT authentication, RBAC (User/Admin), enkripsi kredensial, rate limiting

---

## Prasyarat

- [Docker](https://www.docker.com/) & Docker Compose (cara yang direkomendasikan)
- **atau** Node.js 20+, MySQL 8.0, Python 3.9+, Redis (setup manual)

---

## Cara Menjalankan

### Dengan Docker (Direkomendasikan)

```bash
# 1. Clone repository
git clone https://github.com/Mega-Zinyz/Sentiment-Analisis-Full-Stack.git
cd Sentiment-Analisis-Full-Stack

# 2. Salin file environment
cp .env.example .env
cp Backend/.env.example Backend/.env

# 3. Edit nilai secret di .env (JWT_SECRET, ENCRYPTION_KEY, DB_PASSWORD)

# 4. Jalankan semua service
docker-compose up -d
```

Setelah berhasil, akses:
- **Frontend:** http://localhost
- **Backend API:** http://localhost:5000
- **API Docs:** http://localhost:5000/

---

### Setup Manual (Development)

**Backend:**
```bash
cd Backend
npm install
cp .env.example .env
# Edit .env sesuai konfigurasi MySQL lokal Anda
npm run setup-db   # Inisialisasi database & schema
npm run dev        # Jalankan server (port 5000)
```

**Frontend:**
```bash
cd Frontend
npm install
npm start          # Jalankan dev server (port 4200)
```

**Python dependencies:**
```bash
cd Backend
pip install -r requirements.txt
python -m spacy download xx_ent_wiki_sm
```

---

## Environment Variables

Salin `.env.example` ke `.env` dan sesuaikan nilainya:

```env
# Database
DB_HOST=mysql
DB_PORT=3306
DB_USER=sentiment_user
DB_PASSWORD=ganti-dengan-password-aman
DB_NAME=sentiment_analysis

# Server
PORT=5000
NODE_ENV=production

# Security — WAJIB diganti sebelum deploy
JWT_SECRET=ganti-dengan-random-string-panjang
ENCRYPTION_KEY=ganti-dengan-hex-64-karakter

# CORS
ALLOWED_ORIGINS=http://localhost

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
```

---

## Struktur Project

```
sentimen_analisis/
├── Backend/
│   ├── index.js                  # Entry point server
│   ├── routes.js                 # Aggregator semua route
│   ├── routes/                   # Handler endpoint API
│   ├── middleware/               # JWT auth & RBAC
│   ├── utils/                    # Worker pool, job queue, logger, enkripsi
│   ├── python/                   # Script Python sentiment analysis
│   ├── crawlers/                 # Playwright crawler
│   ├── config/                   # Koneksi database
│   ├── docs/                     # SQL schema
│   └── scripts/                  # Setup & maintenance
├── Frontend/
│   └── src/app/
│       ├── raw-data-analysis/    # Halaman analisis utama
│       ├── train-data/           # Manajemen data training
│       ├── crawler/              # Interface crawler
│       ├── analysis-history/     # Riwayat analisis
│       ├── analysis-insights/    # Detail insights
│       ├── admin/                # Dashboard admin
│       ├── profile/              # Profil pengguna
│       └── guards/               # Auth & admin route guard
├── docker-compose.yml
└── .env.example
```

---

## Halaman Aplikasi

| Route | Halaman | Akses |
|-------|---------|-------|
| `/login` | Login | Publik |
| `/register` | Registrasi | Publik |
| `/analysis` | Analisis Sentimen | User |
| `/train-data` | Data Training | User |
| `/crawler` | Web Crawler | User |
| `/analysis-history` | Riwayat Analisis | User |
| `/analysis-insights/:id` | Detail Insights | User |
| `/profile` | Profil & Pengaturan | User |
| `/admin` | Dashboard Admin | Admin |
| `/debug/logs` | Log Debug | Admin |

---

## API Endpoints (Ringkasan)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/auth/register` | Registrasi user |
| `POST` | `/api/auth/login` | Login (return JWT) |
| `POST` | `/api/raw-data/upload` | Upload data teks |
| `POST` | `/api/raw-data/upload-csv` | Upload file CSV |
| `POST` | `/api/raw-data/analyze/:sessionId` | Jalankan analisis sentimen |
| `GET`  | `/api/raw-data/results/:sessionId` | Ambil hasil analisis |
| `GET`  | `/api/analysis-history` | Riwayat analisis user |
| `GET`  | `/api/admin/stats` | Statistik sistem (Admin) |
| `GET`  | `/health` | Health check |

---

## Workflow Analisis Sentimen

```
Upload Data (CSV / teks)
       ↓
Simpan ke database (raw_data_items)
       ↓
User memulai analisis → Bull Job Queue (Redis)
       ↓
Python Worker Pool:
  1. Preprocessing (tokenisasi, stemming Sastrawi)
  2. Prediksi (Naïve Bayes / word library / ensemble)
  3. Confidence scoring
       ↓
Hasil disimpan → update live via Socket.io
       ↓
Frontend menampilkan grafik & export CSV/JSON
```

---

## Lisensi

Project ini dibuat untuk keperluan skripsi. Silakan gunakan sebagai referensi dengan mencantumkan sumber.
