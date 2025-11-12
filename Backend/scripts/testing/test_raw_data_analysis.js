#!/usr/bin/env node

// Test script for raw data sentiment analysis
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Sample raw Twitter data
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
  "2022-03-28 12:35:55+00:00 pikiran_rakyat Pemerintah daerah diminta terus memantau perkembangan situasi pandemi #pemda #monitoring 1"
];

class RawDataAnalysisTest {
  constructor() {
    this.token = null;
    this.sessionId = null;
  }

  async login() {
    try {
      console.log('🔐 Logging in...');
      const response = await axios.post(`${BASE_URL}/auth/login`, {
        username: 'admin',
        password: 'admin123'
      });
      
      this.token = response.data.token;
      console.log('✅ Login successful');
      return true;
    } catch (error) {
      console.error('❌ Login failed:', error.response?.data || error.message);
      return false;
    }
  }

  async uploadRawData() {
    try {
      console.log('📤 Uploading raw data...');
      const response = await axios.post(`${BASE_URL}/raw-data/upload`, {
        rawDataArray: sampleRawData,
        sessionName: 'test_ppkm_analysis'
      }, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      this.sessionId = response.data.sessionId;
      console.log('✅ Upload successful');
      console.log('📊 Stats:', response.data.stats);
      console.log('🆔 Session ID:', this.sessionId);
      return true;
    } catch (error) {
      console.error('❌ Upload failed:', error.response?.data || error.message);
      return false;
    }
  }

  async getLabelingData() {
    try {
      console.log('📋 Getting labeling data...');
      const response = await axios.get(`${BASE_URL}/raw-data/labeling/${this.sessionId}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      console.log('✅ Labeling data retrieved');
      console.log('📊 Current labels:', response.data.currentLabels);
      console.log('📝 Need to label:', response.data.needsLabeling);
      console.log('🔢 Available items:', response.data.unlabeledData.length);
      
      // Show first few items for manual labeling reference
      console.log('\n📝 Sample items for labeling:');
      response.data.unlabeledData.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ID: ${item.id} - "${item.clean_text}"`);
      });
      
      return response.data.unlabeledData;
    } catch (error) {
      console.error('❌ Failed to get labeling data:', error.response?.data || error.message);
      return null;
    }
  }

  async submitLabels(labelingData) {
    try {
      console.log('🏷️  Submitting sample labels...');
      
      // Create sample labels - 5 each type
      const labels = [];
      const items = labelingData.slice(0, 15); // Take first 15 items
      
      // Label first 5 as Positive
      for (let i = 0; i < 5; i++) {
        labels.push({ id: items[i].id, sentiment_label: 'Positive' });
      }
      
      // Label next 5 as Negative  
      for (let i = 5; i < 10; i++) {
        labels.push({ id: items[i].id, sentiment_label: 'Negative' });
      }
      
      // Label last 5 as Neutral
      for (let i = 10; i < 15; i++) {
        labels.push({ id: items[i].id, sentiment_label: 'Neutral' });
      }
      
      const response = await axios.post(`${BASE_URL}/raw-data/labeling/${this.sessionId}`, {
        labels: labels
      }, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      console.log('✅ Labels submitted successfully');
      console.log('📊 Final labels:', response.data.currentLabels);
      console.log('✅ Ready for analysis:', response.data.canProceedAnalysis);
      return true;
    } catch (error) {
      console.error('❌ Failed to submit labels:', error.response?.data || error.message);
      return false;
    }
  }

  async analyzeSentiment() {
    try {
      console.log('🤖 Running sentiment analysis...');
      const response = await axios.post(`${BASE_URL}/raw-data/analyze/${this.sessionId}`, {}, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      console.log('✅ Analysis completed successfully');
      console.log('📊 Model metrics:', response.data.modelMetrics);
      console.log('📈 Analysis stats:', response.data.analysisStats);
      return true;
    } catch (error) {
      console.error('❌ Analysis failed:', error.response?.data || error.message);
      return false;
    }
  }

  async getResults() {
    try {
      console.log('📊 Getting analysis results...');
      const response = await axios.get(`${BASE_URL}/raw-data/results/${this.sessionId}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      
      console.log('✅ Results retrieved');
      console.log('📊 Statistics:', response.data.statistics);
      
      console.log('\n📋 Training Data:');
      response.data.trainingData.forEach((item, index) => {
        console.log(`${index + 1}. "${item.clean_text}" → ${item.sentiment_label}`);
      });
      
      console.log('\n🔮 Predictions:');
      response.data.predictionData.forEach((item, index) => {
        console.log(`${index + 1}. "${item.clean_text}" → ${item.predicted_sentiment} (${(item.prediction_confidence * 100).toFixed(1)}%)`);
      });
      
      return true;
    } catch (error) {
      console.error('❌ Failed to get results:', error.response?.data || error.message);
      return false;
    }
  }

  async runFullTest() {
    console.log('🚀 Starting Raw Data Sentiment Analysis Test\n');
    
    // Step 1: Login
    if (!await this.login()) return false;
    
    // Step 2: Upload raw data
    if (!await this.uploadRawData()) return false;
    
    // Step 3: Get labeling data
    const labelingData = await this.getLabelingData();
    if (!labelingData) return false;
    
    // Step 4: Submit labels
    if (!await this.submitLabels(labelingData)) return false;
    
    // Step 5: Analyze sentiment
    if (!await this.analyzeSentiment()) return false;
    
    // Step 6: Get results
    if (!await this.getResults()) return false;
    
    console.log('\n🎉 Test completed successfully!');
    console.log(`📂 Session ID: ${this.sessionId}`);
    console.log('💡 You can now use the frontend to interact with this session.');
    return true;
  }
}

// Run the test
if (require.main === module) {
  const test = new RawDataAnalysisTest();
  test.runFullTest().catch(error => {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
  });
}

module.exports = RawDataAnalysisTest;