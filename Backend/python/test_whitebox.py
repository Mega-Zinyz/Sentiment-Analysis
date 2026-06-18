#!/usr/bin/env python3
"""
White-Box Testing - Basis Path Testing
Sistem Analisis Sentimen Tweet Berbahasa Indonesia

Modul yang diuji : sentiment_nb_spacy.py
Kelas yang diuji : IndonesianTextProcessor
Metode pengujian : Basis Path Testing (McCabe Cyclomatic Complexity)
Framework        : unittest (Python standard library)
"""

import unittest
import sys
import os

# Pastikan direktori ini ada di path agar bisa import modul utama
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sentiment_nb_spacy import IndonesianTextProcessor


# ══════════════════════════════════════════════════════════════════════════════
# KELOMPOK 1 — clean_text()
# Cyclomatic Complexity (V(G)) = 2
# Path 1: input bukan string  → return ""
# Path 2: input string        → jalankan pipeline regex cleaning
# ══════════════════════════════════════════════════════════════════════════════
class TestCleanText(unittest.TestCase):

    def setUp(self):
        self.proc = IndonesianTextProcessor()

    # ── Path 1: bukan string ─────────────────────────────────────────────────
    def test_TC01_input_none(self):
        """TC-01 | Input None → return string kosong"""
        self.assertEqual(self.proc.clean_text(None), "")

    def test_TC02_input_integer(self):
        """TC-02 | Input integer → return string kosong"""
        self.assertEqual(self.proc.clean_text(123), "")

    def test_TC03_input_list(self):
        """TC-03 | Input list → return string kosong"""
        self.assertEqual(self.proc.clean_text(["teks"]), "")

    # ── Path 2: input string, setiap cabang regex ─────────────────────────────
    def test_TC04_hapus_url_http(self):
        """TC-04 | URL http:// dalam teks → dihapus"""
        hasil = self.proc.clean_text("cek http://example.com sekarang")
        self.assertNotIn("http", hasil)

    def test_TC05_hapus_url_https(self):
        """TC-05 | URL https:// dalam teks → dihapus"""
        hasil = self.proc.clean_text("kunjungi https://example.com")
        self.assertNotIn("https", hasil)

    def test_TC06_hapus_url_www(self):
        """TC-06 | URL www. dalam teks → dihapus"""
        hasil = self.proc.clean_text("buka www.example.com")
        self.assertNotIn("www", hasil)

    def test_TC07_hapus_mention(self):
        """TC-07 | @mention dalam teks → dihapus"""
        hasil = self.proc.clean_text("halo @username apa kabar")
        self.assertNotIn("@username", hasil)

    def test_TC08_hapus_hashtag(self):
        """TC-08 | #hashtag dalam teks → dihapus"""
        hasil = self.proc.clean_text("ikuti #trending sekarang")
        self.assertNotIn("#trending", hasil)

    def test_TC09_hapus_rt(self):
        """TC-09 | Kata 'RT' (retweet marker) → dihapus"""
        hasil = self.proc.clean_text("RT ini adalah retweet penting")
        self.assertNotIn("rt", hasil.split())   # 'rt' tidak boleh jadi kata mandiri

    def test_TC10_konversi_huruf_kecil(self):
        """TC-10 | Huruf kapital → dikonversi lowercase"""
        hasil = self.proc.clean_text("Produk Ini SANGAT Bagus")
        self.assertEqual(hasil, hasil.lower())

    def test_TC11_normalisasi_spasi(self):
        """TC-11 | Spasi ganda/lebih → dinormalisasi jadi satu spasi"""
        hasil = self.proc.clean_text("produk   ini   bagus")
        self.assertNotIn("  ", hasil)

    def test_TC12_string_kosong(self):
        """TC-12 | String kosong → return string kosong"""
        self.assertEqual(self.proc.clean_text(""), "")

    def test_TC13_teks_normal_utuh(self):
        """TC-13 | Teks bersih tanpa noise → teks dipertahankan (lowercase)"""
        hasil = self.proc.clean_text("produk bagus")
        self.assertEqual(hasil, "produk bagus")


# ══════════════════════════════════════════════════════════════════════════════
# KELOMPOK 2 — spacy_process()
# Cyclomatic Complexity (V(G)) = 5
# Path 1: input kosong/None        → return langsung tanpa proses
# Path 2: token tanda baca/spasi   → dilewati (continue)
# Path 3: token adalah angka       → dilewati (continue)
# Path 4: kata adalah stopword     → dilewati (continue)
# Path 5: panjang kata ≤ 2 huruf   → tidak dimasukkan
# (Path gabungan): kata valid (> 2 huruf, bukan stopword) → dimasukkan
# ══════════════════════════════════════════════════════════════════════════════
class TestSpacyProcess(unittest.TestCase):

    def setUp(self):
        self.proc = IndonesianTextProcessor()

    # ── Path 1: input kosong ──────────────────────────────────────────────────
    def test_TC14_input_string_kosong(self):
        """TC-14 | Input string kosong → return nilai falsy"""
        self.assertFalse(self.proc.spacy_process(""))

    def test_TC15_input_none(self):
        """TC-15 | Input None → return None (bukan error)"""
        self.assertIsNone(self.proc.spacy_process(None))

    # ── Path 2-3: tanda baca & angka dilewati ────────────────────────────────
    def test_TC16_angka_dihapus(self):
        """TC-16 | Token angka → tidak masuk output"""
        hasil = self.proc.spacy_process("harga 1000 rupiah")
        self.assertNotIn("1000", hasil.split() if hasil else [])

    # ── Path 4: stopword dilewati ────────────────────────────────────────────
    def test_TC17_stopword_dihapus(self):
        """TC-17 | Kata stopword ('yang', 'dan') → tidak masuk output"""
        hasil = self.proc.spacy_process("produk yang bagus dan murah")
        kata = hasil.split() if hasil else []
        self.assertNotIn("yang", kata)
        self.assertNotIn("dan", kata)

    # ── Path 5: kata pendek (≤ 2 huruf) tidak dimasukkan ─────────────────────
    def test_TC18_kata_pendek_dihapus(self):
        """TC-18 | Kata ≤ 2 karakter → tidak masuk output"""
        hasil = self.proc.spacy_process("pergi ke pasar beli baju")
        for kata in (hasil.split() if hasil else []):
            self.assertGreater(len(kata), 2, f"Kata pendek '{kata}' lolos filter")

    # ── Path gabungan: kata valid dimasukkan ──────────────────────────────────
    def test_TC19_kata_valid_dipertahankan(self):
        """TC-19 | Kata bermakna (> 2 huruf, bukan stopword) → masuk output"""
        hasil = self.proc.spacy_process("produk berkualitas tinggi")
        self.assertTrue(len(hasil) > 0 if hasil else False)


# ══════════════════════════════════════════════════════════════════════════════
# KELOMPOK 3 — stem_text()
# Cyclomatic Complexity (V(G)) = 2
# Path 1: input kosong/None → return langsung
# Path 2: input valid       → proses Sastrawi stemming
# ══════════════════════════════════════════════════════════════════════════════
class TestStemText(unittest.TestCase):

    def setUp(self):
        self.proc = IndonesianTextProcessor()

    # ── Path 1: input kosong ──────────────────────────────────────────────────
    def test_TC20_input_kosong(self):
        """TC-20 | Input string kosong → return falsy (tidak diproses)"""
        self.assertFalse(self.proc.stem_text(""))

    def test_TC21_input_none(self):
        """TC-21 | Input None → return None tanpa error"""
        self.assertIsNone(self.proc.stem_text(None))

    # ── Path 2: stemming berhasil ─────────────────────────────────────────────
    def test_TC22_stem_berlari(self):
        """TC-22 | 'berlari' → bentuk dasar 'lari'"""
        self.assertEqual(self.proc.stem_text("berlari"), "lari")

    def test_TC23_stem_membantu(self):
        """TC-23 | 'membantu' → bentuk dasar 'bantu'"""
        self.assertEqual(self.proc.stem_text("membantu"), "bantu")

    def test_TC24_stem_pembelajaran(self):
        """TC-24 | 'pembelajaran' → bentuk dasar 'ajar'"""
        self.assertEqual(self.proc.stem_text("pembelajaran"), "ajar")

    def test_TC25_stem_hasil_string(self):
        """TC-25 | Hasil stemming selalu bertipe string"""
        hasil = self.proc.stem_text("ketidakhadiran")
        self.assertIsInstance(hasil, str)


# ══════════════════════════════════════════════════════════════════════════════
# KELOMPOK 4 — preprocess() (pipeline lengkap)
# Menguji integrasi: clean_text → spacy_process → stem_text → normalisasi akhir
# ══════════════════════════════════════════════════════════════════════════════
class TestPreprocessPipeline(unittest.TestCase):

    def setUp(self):
        self.proc = IndonesianTextProcessor()

    def test_TC26_pipeline_teks_normal(self):
        """TC-26 | Teks normal → diproses penuh tanpa error, return string"""
        hasil = self.proc.preprocess("Produk ini sangat bagus dan berkualitas")
        self.assertIsInstance(hasil, str)

    def test_TC27_pipeline_hapus_url(self):
        """TC-27 | URL dalam input → hilang setelah pipeline"""
        hasil = self.proc.preprocess("cek https://example.com untuk info lebih lanjut")
        self.assertNotIn("http", hasil)

    def test_TC28_pipeline_hapus_mention_hashtag(self):
        """TC-28 | Mention dan hashtag → hilang setelah pipeline"""
        hasil = self.proc.preprocess("@user produk #bagus sekali berkualitas")
        self.assertNotIn("@", hasil)
        self.assertNotIn("#", hasil)

    def test_TC29_pipeline_output_lowercase(self):
        """TC-29 | Output pipeline → selalu huruf kecil"""
        hasil = self.proc.preprocess("PRODUK SANGAT BAGUS BERKUALITAS")
        self.assertEqual(hasil, hasil.lower())

    def test_TC30_pipeline_output_bersih(self):
        """TC-30 | Output pipeline → hanya huruf a-z dan spasi (tanpa karakter khusus)"""
        hasil = self.proc.preprocess("produk bagus! harga @murah #promo 100%")
        import re
        self.assertNotRegex(hasil, r'[^a-zA-Z\s]')

    def test_TC31_pipeline_input_none(self):
        """TC-31 | Input None ke pipeline → return string kosong"""
        hasil = self.proc.preprocess(None)
        self.assertEqual(hasil, "")

    def test_TC32_pipeline_input_kosong(self):
        """TC-32 | Input string kosong → hasil kosong"""
        hasil = self.proc.preprocess("")
        self.assertEqual(hasil.strip(), "")


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT — jalankan semua test dan cetak ringkasan
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    urutan_kelas = [
        TestCleanText,
        TestSpacyProcess,
        TestStemText,
        TestPreprocessPipeline,
    ]

    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()
    for kelas in urutan_kelas:
        suite.addTests(loader.loadTestsFromTestCase(kelas))

    runner = unittest.TextTestRunner(verbosity=2)
    hasil  = runner.run(suite)

    lulus = hasil.testsRun - len(hasil.failures) - len(hasil.errors)
    print("\n" + "=" * 62)
    print("  RINGKASAN HASIL WHITE-BOX TESTING")
    print("=" * 62)
    print(f"  Total Test Case  : {hasil.testsRun}")
    print(f"  Lulus  (PASS)    : {lulus}")
    print(f"  Gagal  (FAIL)    : {len(hasil.failures)}")
    print(f"  Error            : {len(hasil.errors)}")
    print(f"  Coverage Status  : {'SEMUA LULUS ✓' if not hasil.failures and not hasil.errors else 'ADA KEGAGALAN ✗'}")
    print("=" * 62)

    sys.exit(0 if hasil.wasSuccessful() else 1)
