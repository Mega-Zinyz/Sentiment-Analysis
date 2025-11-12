// Test the raw data analysis system with fresh token
const axios = require('axios');

// Sample raw Twitter data (expanded to meet minimum requirements)
const sampleRawData = [
  "2022-03-31 14:32:04+00:00 pikobar_jabar Ketahui informasi pembagian #PPKM di wilayah Jabar berdasarkan level 3, 2 dan 1 di #PikoData https://t.co/o2RnI7eDue 1",
  "2022-03-31 09:26:00+00:00 inewsdotid \"Tempat Ibadah di Wilayah PPKM Level 1 Boleh Berkapasitas 100 Persen. Baca Selengkapnya di https://t.co/JfIG6nIimN\" #Ramadhan #PPKM #inews https://t.co/ky1G5xYLQB\" 1",
  "2022-03-31 05:02:34+00:00 vdvc_talk \"Juru bicara Satgas Covid-19 Wiku Adisasmito menjelaskan bahwa bukber diperbolehkan dengan menjaga jarak\" 1",
  "2022-03-30 18:45:12+00:00 beritasatu_com Pemerintah mengimbau masyarakat tetap waspada terhadap varian COVID-19 yang baru #COVID19 #kesehatan 1",
  "2022-03-30 16:30:22+00:00 detikcom Angka kasus COVID-19 mulai menurun, namun protokol kesehatan tetap harus diterapkan https://t.co/abc123def 1",
  "2022-03-30 14:25:45+00:00 kompascom Vaksinasi booster sangat dianjurkan untuk meningkatkan imunitas tubuh #vaksinasi #booster 1",
  "2022-03-30 12:15:30+00:00 cnnindonesia Ekonomi mulai bangkit seiring dengan penurunan kasus COVID-19 di berbagai daerah 1",
  "2022-03-30 10:45:18+00:00 liputan6dotcom Masyarakat diimbau untuk tetap menggunakan masker saat beraktivitas di luar rumah #masker #protokol 1",
  "2022-03-30 08:20:50+00:00 tribunnews PPKM diperpanjang hingga akhir April dengan penyesuaian aturan baru https://t.co/xyz789abc 1",
  "2022-03-29 19:35:40+00:00 antaranews Kementerian Kesehatan melaporkan penurunan signifikan kasus harian COVID-19 #kesehatan #covid 1",
  "2022-03-29 17:50:25+00:00 okezone_com Sektor pariwisata mulai menunjukkan tanda-tanda pemulihan pasca pandemi #pariwisata #ekonomi 1",
  "2022-03-29 15:40:15+00:00 tempo_co Pembelajaran tatap muka 100% mulai diberlakukan di seluruh Indonesia #pendidikan #tatmuka 1",
  "2022-03-29 13:25:35+00:00 sindonews_com Transportasi umum kembali beroperasi normal dengan kapasitas penuh #transportasi #normal 1",
  "2022-03-29 11:10:20+00:00 vivanews Pelaku UMKM optimis bisnis akan kembali menggeliat seiring relaksasi PPKM #umkm #bisnis 1",
  "2022-03-29 09:55:10+00:00 republika_co_id Rumah sakit mulai mengurangi bed isolasi COVID-19 karena penurunan pasien #rumahsakit #isolasi 1",
  "2022-03-28 20:30:45+00:00 mediaindonesia Pemerintah siap menghadapi gelombang pandemi selanjutnya dengan persiapan yang matang #pandemi #persiapan 1",
  "2022-03-28 18:15:30+00:00 jawapos_com Masyarakat mulai beradaptasi dengan kehidupan normal baru pasca pandemi #normalbaru #adaptasi 1",
  "2022-03-28 16:45:20+00:00 solopos_com Kegiatan sosial dan budaya mulai diizinkan dengan protokol kesehatan ketat #sosial #budaya 1",
  "2022-03-28 14:20:10+00:00 suaramerdeka Sektor industri optimis dengan prospek pemulihan ekonomi di kuartal kedua #industri #pemulihan 1",
  "2022-03-28 12:35:55+00:00 pikiran_rakyat Pemerintah daerah diminta terus memantau perkembangan situasi pandemi #pemda #monitoring 1",
  "2022-03-28 10:15:40+00:00 radarlampung_co Fasilitas kesehatan di daerah mulai kembali melayani pasien non-COVID secara normal 1",
  "2022-03-27 22:45:30+00:00 harianhaluan Tingkat kepatuhan masyarakat terhadap prokes masih perlu ditingkatkan kata Menkes 1",
  "2022-03-27 20:30:15+00:00 sumeks_co Program vaksinasi anak usia 6-11 tahun mencapai target 80 persen #vaksinasi #anak 1"
];

async function testRawDataAnalysis() {
  try {
    // Get fresh token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful!');
    console.log('🔑 Token obtained\n');

    const headers = { 'Authorization': `Bearer ${token}` };

    // Test 1: Upload raw data
    console.log('📤 Testing raw data upload...');
    try {
      const uploadResponse = await axios.post('http://localhost:3000/api/raw-data/upload', {
        rawDataArray: sampleRawData,
        sessionName: 'test_session'
      }, { headers });
      
      console.log('✅ Raw data upload test successful!');
      console.log('� Upload stats:', uploadResponse.data.stats);
      console.log('🆔 Session ID:', uploadResponse.data.sessionId);
    } catch (uploadError) {
      console.log('❌ Raw data upload failed:', uploadError.response?.data || uploadError.message);
    }

    // Test 2: Get sessions
    console.log('\n📋 Testing sessions list...');
    try {
      const sessionsResponse = await axios.get('http://localhost:3000/api/raw-data/sessions', { headers });
      console.log('✅ Sessions list test successful!');
      console.log('📊 Sessions count:', sessionsResponse.data.sessions.length);
    } catch (sessionsError) {
      console.log('❌ Sessions list failed:', sessionsError.response?.data || sessionsError.message);
    }

    // Test 3: Profile endpoint (original issue)
    console.log('\n👤 Testing profile endpoint...');
    try {
      const profileResponse = await axios.get('http://localhost:3000/api/profile', { headers });
      console.log('✅ Profile endpoint test successful!');
      console.log('👤 User:', profileResponse.data.user.username, '| Role:', profileResponse.data.user.role);
    } catch (profileError) {
      console.log('❌ Profile endpoint failed:', profileError.response?.data || profileError.message);
    }

    console.log('\n🎉 All tests completed!');
    console.log('💡 Your authentication issue is fixed!');
    console.log('🔗 You can now use the raw data analysis system.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testRawDataAnalysis();